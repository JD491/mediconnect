-- ============================================================================
-- MediConnect — Order-Insert Integrity + Razorpay Cancellation Fix
-- (follow-up to 0009/0010)
--
-- 1. protect_order_financial_fields()'s INSERT branch normalized
--    payment_status/payment_verified/razorpay_* but never touched `status`
--    itself — a direct API call could INSERT an order with an arbitrary
--    initial status (e.g. 'delivered'). Now force-set unconditionally for
--    any non-trusted INSERT.
-- 2. The same function's payment_status guard was all-or-nothing: only the
--    store owner (or admin/service_role) could ever change it. That's
--    correct in general, but it also silently blocked the one legitimate
--    customer-initiated payment_status change in the whole app — Cart.jsx
--    marking an order `status=cancelled, payment_status=failed` after a
--    Razorpay checkout is cancelled/fails. Added one narrowly-scoped
--    carve-out for exactly that transition; nothing else a customer sends
--    for payment_status is honored.
--
-- IDEMPOTENT — safe to re-run.
-- ============================================================================

create or replace function public.protect_order_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_store_owner boolean;
  v_is_customer boolean;
  v_is_payment_cancel boolean;
  v_trusted boolean;
begin
  v_trusted := auth.role() = 'service_role'
    or public.is_admin()
    or coalesce(current_setting('mediconnect.system_write', true), 'off') = 'on';

  if v_trusted then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Never trust the client's claimed initial state. A new order from a
    -- non-trusted actor always starts exactly here, no exceptions.
    new.status := 'pending';
    new.payment_status := case when new.payment_method = 'cod' then 'cod_pending' else 'pending' end;
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
  v_is_customer := old.user_id = auth.uid();

  -- The ONE payment_status change a customer may ever make directly: their
  -- own order, abandoning/failing an online payment that was mid-flight.
  -- Everything else about this update (status -> cancelled) is already
  -- validated independently by trg_enforce_order_status_transitions.
  v_is_payment_cancel := v_is_customer
    and old.payment_status::text = 'processing'
    and new.status::text = 'cancelled'
    and new.payment_status::text = 'failed';

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

  -- payment_status: the fulfilling store (COD collected / refunded), or a
  -- customer cancelling their own stuck online payment — nobody else.
  if new.payment_status is distinct from old.payment_status
     and not v_is_store_owner
     and not v_is_payment_cancel then
    new.payment_status := old.payment_status;
  end if;

  return new;
end;
$$;
-- Trigger already exists from 0009 (before insert or update); CREATE OR
-- REPLACE FUNCTION above is sufficient, no need to redrop/recreate it.
