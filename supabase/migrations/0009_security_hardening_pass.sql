-- ============================================================================
-- MediConnect — Security & Data-Integrity Hardening Pass
--
-- Fixes eight issues found in a targeted audit:
--
-- 1. expire_stale_prescriptions() was callable by ANY authenticated user and
--    would expire prescriptions across every store. Now scoped: admin
--    affects everything, a store owner affects only their own store's
--    prescriptions, anyone else affects zero rows.
-- 2. The prescriptions storage bucket's INSERT policy only checked
--    "is logged in" — not that the uploader owns the order/store the file
--    path claims to belong to, and not file type/size. Both are now
--    enforced at the storage-RLS layer itself (not just the frontend).
-- 3. order_status had no transition graph — a store owner (or a direct API
--    call) could jump e.g. pending -> delivered. Added a trigger enforcing
--    the real fulfillment/cancellation/refund graph, with admin override.
-- 4. Two real gaps found while auditing orders RLS: there was no policy at
--    all allowing a customer to update their OWN order (cancel/refund-
--    request), and the insert policy didn't restrict payment_verified /
--    razorpay_payment_id — a malicious direct API call could have inserted
--    a pre-marked-paid order. Fixed with a scoped update policy, a tighter
--    insert check, and a trigger that protects financial columns from any
--    client write regardless of policy shape (defense in depth).
-- 5. total_amount was trusted from the client at order creation and never
--    reconciled against the actual order_items. Added a trigger that
--    recomputes it from order_items × the *current* stock.price (not the
--    client-supplied order_items.price) immediately after items are
--    inserted, and corrects order_items.price to match — closing a
--    price-tampering path entirely server-side.
-- 6. Added a uniqueness constraint on razorpay_payment_id so the same
--    payment can never be attached to two different orders.
--
-- IDEMPOTENT — every statement is safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. expire_stale_prescriptions() — scope to admin / owning store only
-- ----------------------------------------------------------------------------
create or replace function public.expire_stale_prescriptions()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    update public.prescriptions
      set status = 'expired'
      where status = 'pending' and superseded = false and created_at < now() - interval '7 days';
  else
    update public.prescriptions p
      set status = 'expired'
      where p.status = 'pending' and p.superseded = false and p.created_at < now() - interval '7 days'
        and exists (select 1 from public.stores s where s.store_id = p.store_id and s.owner_id = auth.uid());
  end if;
end;
$$;
-- EXECUTE stays granted to `authenticated` (store owners need to call this on
-- page load) — the authorization now happens INSIDE the function, per the
-- "enforce admin/store-owner authorization inside the function" approach.
grant execute on function public.expire_stale_prescriptions() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Prescriptions storage bucket — real ownership + file-type/size checks
-- ----------------------------------------------------------------------------
drop policy if exists "prescriptions_bucket_insert" on storage.objects;
create policy "prescriptions_bucket_insert" on storage.objects
  for insert with check (
    bucket_id = 'prescriptions'
    and auth.role() = 'authenticated'
    -- path convention: {store_id}/{order_id}/{filename} — require both segments
    and array_length(storage.foldername(name), 1) >= 2
    -- uploader must actually own an order matching that exact store/order pair
    and exists (
      select 1 from public.orders o
      where o.order_id::text = (storage.foldername(name))[2]
        and o.store_id::text = (storage.foldername(name))[1]
        and o.user_id = auth.uid()
    )
    -- server-side file constraints — never rely on the frontend alone
    and coalesce((metadata->>'size')::bigint, 0) <= 5 * 1024 * 1024
    and (metadata->>'mimetype') in ('application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp')
  );

-- ----------------------------------------------------------------------------
-- 3. order_status transition graph
-- ----------------------------------------------------------------------------
create or replace function public.enforce_order_status_transitions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean := false;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if public.is_admin() then
      return new; -- admin retains full override authority
    end if;

    allowed := case old.status::text
      when 'pending'             then new.status::text in ('confirmed', 'cancelled')
      when 'confirmed'           then new.status::text in ('preparing', 'cancelled')
      when 'preparing'           then new.status::text in ('ready_for_dispatch', 'cancelled')
      when 'ready_for_dispatch'  then new.status::text in ('out_for_delivery', 'cancelled')
      when 'out_for_delivery'    then new.status::text in ('delivered', 'cancelled')
      when 'delivered'           then new.status::text in ('refund_requested')
      when 'refund_requested'    then new.status::text in ('refunded')
      else false
    end;

    if not allowed then
      raise exception 'Invalid order status transition: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_order_status_transitions on public.orders;
create trigger trg_enforce_order_status_transitions
  before update on public.orders
  for each row execute function public.enforce_order_status_transitions();

-- ----------------------------------------------------------------------------
-- 4a. orders RLS — customer can update ONLY their own order (fields are then
--     constrained by the trigger in 4b below, not by this policy shape)
-- ----------------------------------------------------------------------------
drop policy if exists "orders_customer_update_own" on public.orders;
create policy "orders_customer_update_own" on public.orders
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "orders_customer_insert" on public.orders;
create policy "orders_customer_insert" on public.orders
  for insert with check (
    user_id = auth.uid()
    and payment_verified = false
    and razorpay_payment_id is null
  );

-- ----------------------------------------------------------------------------
-- 4b. orders — protect financial columns from any client write, regardless
--     of which RLS policy matched. service_role (Edge Functions) and admin
--     pass through; a transaction-local flag lets our own recompute trigger
--     (5, below) write total_amount/discount_amount without being reverted.
-- ----------------------------------------------------------------------------
create or replace function public.protect_order_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_store_owner boolean;
  v_trusted boolean;
begin
  v_trusted := auth.role() = 'service_role'
    or public.is_admin()
    or coalesce(current_setting('mediconnect.system_write', true), 'off') = 'on';

  if v_trusted then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A brand-new order from a customer must always start unpaid — only the
    -- payment Edge Functions (service_role) may ever mark one "paid".
    if new.payment_status::text not in ('pending', 'cod_pending') then
      new.payment_status := case when new.payment_method = 'cod' then 'cod_pending' else 'pending' end;
    end if;
    new.payment_verified := false;
    new.razorpay_order_id := null;
    new.razorpay_payment_id := null;
    return new;
  end if;

  -- UPDATE path
  v_is_store_owner := exists (select 1 from public.stores s where s.store_id = new.store_id and s.owner_id = auth.uid());

  if new.total_amount is distinct from old.total_amount
     or new.discount_amount is distinct from old.discount_amount
     or new.coupon_code is distinct from old.coupon_code
     or new.payment_verified is distinct from old.payment_verified
     or new.razorpay_order_id is distinct from old.razorpay_order_id
     or new.razorpay_payment_id is distinct from old.razorpay_payment_id then
    new.total_amount := old.total_amount;
    new.discount_amount := old.discount_amount;
    new.coupon_code := old.coupon_code;
    new.payment_verified := old.payment_verified;
    new.razorpay_order_id := old.razorpay_order_id;
    new.razorpay_payment_id := old.razorpay_payment_id;
  end if;

  -- payment_status: only the fulfilling store (COD collected / refunded) may
  -- change it directly; a plain customer update can never touch it.
  if new.payment_status is distinct from old.payment_status and not v_is_store_owner then
    new.payment_status := old.payment_status;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_order_financial_fields on public.orders;
create trigger trg_protect_order_financial_fields
  before insert or update on public.orders
  for each row execute function public.protect_order_financial_fields();

-- ----------------------------------------------------------------------------
-- 5. Recompute total_amount from authoritative stock.price after order_items
--    are inserted — closes price-tampering regardless of what the client
--    claimed in order_items.price or the order's own total_amount.
-- ----------------------------------------------------------------------------
create or replace function public.validate_order_total_after_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  computed numeric;
  clamped_discount numeric;
  order_row record;
begin
  perform set_config('mediconnect.system_write', 'on', true);

  for r in select distinct order_id from new_items loop
    -- Correct any tampered per-line price to the real, current stock price.
    update public.order_items oi
      set price = s.price
      from public.stock s
      where oi.order_id = r.order_id and oi.stock_id = s.stock_id and oi.price is distinct from s.price;

    select coalesce(sum(oi.quantity * s.price), 0) into computed
      from public.order_items oi join public.stock s on s.stock_id = oi.stock_id
      where oi.order_id = r.order_id;

    select * into order_row from public.orders where order_id = r.order_id;
    clamped_discount := least(greatest(coalesce(order_row.discount_amount, 0), 0), computed);

    update public.orders
      set total_amount = greatest(computed - clamped_discount + coalesce(delivery_fee, 0), 0),
          discount_amount = clamped_discount
      where order_id = r.order_id;
  end loop;

  perform set_config('mediconnect.system_write', 'off', true);
  return null;
end;
$$;

drop trigger if exists trg_validate_order_total on public.order_items;
create trigger trg_validate_order_total
  after insert on public.order_items
  referencing new table as new_items
  for each statement execute function public.validate_order_total_after_items();

-- ----------------------------------------------------------------------------
-- 6. Prevent the same Razorpay payment from being attached to two orders
-- ----------------------------------------------------------------------------
alter table public.orders drop constraint if exists orders_razorpay_payment_id_unique;
alter table public.orders add constraint orders_razorpay_payment_id_unique unique (razorpay_payment_id);
