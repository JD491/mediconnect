-- ============================================================================
-- MediConnect — Targeted Integrity Fix (follow-up to 0009)
--
-- 1. order_items integrity: a row's stock_id must belong to the same store
--    as its parent order, and medicine_id must match that stock row's own
--    medicine_id — rejecting mismatched store/medicine combinations at
--    insert time, at the database level.
-- 2. orders UPDATE hardening: extends the 0009 financial-field protection to
--    also lock store_id, delivery_fee, payment_method, and user_id against
--    any client-side change after creation (service_role/admin still pass
--    through; legitimate status-only changes like cancel/refund-request are
--    untouched since this trigger never inspects `status`).
-- 3. Coupon discounts: the 0009 total-recompute trigger clamped
--    discount_amount to the item subtotal but still trusted the client's
--    claimed amount. It now re-derives the discount from the actual coupon
--    row (type, value, max_discount, validity window, min order) whenever
--    orders.coupon_code is set, and forces discount_amount to 0 whenever it
--    isn't — closing the gap where a direct API call could claim any
--    discount, or a discount with no real coupon at all.
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. order_items: stock must belong to the order's store; medicine must match
-- ----------------------------------------------------------------------------
create or replace function public.validate_order_item_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_store_id bigint;
  v_stock_store_id bigint;
  v_stock_medicine_id bigint;
begin
  select store_id into v_order_store_id from public.orders where order_id = new.order_id;
  if v_order_store_id is null then
    raise exception 'Order % not found', new.order_id;
  end if;

  select store_id, medicine_id into v_stock_store_id, v_stock_medicine_id
    from public.stock where stock_id = new.stock_id;
  if v_stock_store_id is null then
    raise exception 'Stock item % not found', new.stock_id;
  end if;

  if v_stock_store_id is distinct from v_order_store_id then
    raise exception 'Stock item % does not belong to order %''s store', new.stock_id, new.order_id;
  end if;

  if new.medicine_id is distinct from v_stock_medicine_id then
    raise exception 'medicine_id % does not match stock item %''s medicine', new.medicine_id, new.stock_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_order_item_integrity on public.order_items;
create trigger trg_validate_order_item_integrity
  before insert on public.order_items
  for each row execute function public.validate_order_item_integrity();

-- ----------------------------------------------------------------------------
-- 2. orders — lock down additional non-customer-editable fields on UPDATE
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
    if new.payment_status::text not in ('pending', 'cod_pending') then
      new.payment_status := case when new.payment_method = 'cod' then 'cod_pending' else 'pending' end;
    end if;
    new.payment_verified := false;
    new.razorpay_order_id := null;
    new.razorpay_payment_id := null;
    return new;
  end if;

  v_is_store_owner := exists (
    select 1
    from public.stores s
    where s.store_id = new.store_id
      and s.owner_id = auth.uid()
  );

  -- UPDATE path: financial fields + identity/relationship fields are all
  -- immutable once the order exists, for any non-trusted actor.
  if new.total_amount is distinct from old.total_amount
     or new.discount_amount is distinct from old.discount_amount
     or new.coupon_code is distinct from old.coupon_code
     or new.payment_verified is distinct from old.payment_verified
     or new.razorpay_order_id is distinct from old.razorpay_order_id
     or new.razorpay_payment_id is distinct from old.razorpay_payment_id
     or new.store_id is distinct from old.store_id
     or new.delivery_fee is distinct from old.delivery_fee
     or new.payment_method is distinct from old.payment_method
     or new.user_id is distinct from old.user_id then
    new.total_amount := old.total_amount;
    new.discount_amount := old.discount_amount;
    new.coupon_code := old.coupon_code;
    new.payment_verified := old.payment_verified;
    new.razorpay_order_id := old.razorpay_order_id;
    new.razorpay_payment_id := old.razorpay_payment_id;
    new.store_id := old.store_id;
    new.delivery_fee := old.delivery_fee;
    new.payment_method := old.payment_method;
    new.user_id := old.user_id;
  end if;

  -- payment_status: only the fulfilling store (COD collected / refunded) may
  -- change it directly; status itself (cancel / refund-request) is untouched
  -- here and remains governed solely by trg_enforce_order_status_transitions.
  if new.payment_status is distinct from old.payment_status and not v_is_store_owner then
    new.payment_status := old.payment_status;
  end if;

  return new;
end;
$$;
-- Trigger already exists from 0009 (before insert or update); CREATE OR
-- REPLACE FUNCTION above is sufficient, no need to redrop/recreate it.

-- ----------------------------------------------------------------------------
-- 3. Re-derive discount_amount from the real coupon row, not the client claim
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
  v_coupon record;
  v_final_discount numeric;
begin
  perform set_config('mediconnect.system_write', 'on', true);

  for r in select distinct order_id from new_items loop
    update public.order_items oi
      set price = s.price
      from public.stock s
      where oi.order_id = r.order_id and oi.stock_id = s.stock_id and oi.price is distinct from s.price;

    select coalesce(sum(oi.quantity * s.price), 0) into computed
      from public.order_items oi join public.stock s on s.stock_id = oi.stock_id
      where oi.order_id = r.order_id;

    select * into order_row from public.orders where order_id = r.order_id;

    if order_row.coupon_code is not null then
      select * into v_coupon from public.coupons where store_id = order_row.store_id and code = order_row.coupon_code;

      if v_coupon is null
         or not v_coupon.is_active
         or (v_coupon.start_date is not null and v_coupon.start_date > current_date)
         or (v_coupon.end_date is not null and v_coupon.end_date < current_date)
         or computed < v_coupon.min_order_amount then
        v_final_discount := 0; -- coupon no longer valid for this order -> no discount, order still proceeds
      elsif v_coupon.discount_type = 'percentage' then
        v_final_discount := computed * v_coupon.discount_value / 100;
        if v_coupon.max_discount is not null and v_final_discount > v_coupon.max_discount then
          v_final_discount := v_coupon.max_discount;
        end if;
      else
        v_final_discount := v_coupon.discount_value;
      end if;
    else
      v_final_discount := 0;
    end if;

    clamped_discount := least(greatest(v_final_discount, 0), computed);

    update public.orders
      set total_amount = greatest(computed - clamped_discount + coalesce(delivery_fee, 0), 0),
          discount_amount = clamped_discount
      where order_id = r.order_id;
  end loop;

  perform set_config('mediconnect.system_write', 'off', true);
  return null;
end;
$$;
-- Trigger already exists from 0009 (after insert, statement-level, with the
-- new_items transition table); CREATE OR REPLACE FUNCTION is sufficient.
