-- ============================================================================
-- MediConnect — Order lifecycle, prescription lifecycle & payment architecture
--
-- 1. Expands order_status via RENAME VALUE (preserves existing rows/history)
--    rather than a destructive rebuild: placed->pending, packed->preparing,
--    plus new ready_for_dispatch, refund_requested, refunded.
-- 2. Expands the shared approval_status enum with under_review/expired for
--    the prescription workflow.
-- 3. Converts orders.payment_status from a free-text column to a real enum
--    (pending/processing/paid/failed/refunded/cod_pending/cod_collected),
--    migrating existing data rather than dropping it.
-- 4. Adds prescriptions.superseded (for re-upload) and a callable
--    expire_stale_prescriptions() function (no pg_cron dependency assumed).
-- 5. Adds Razorpay scaffolding columns (order id / payment id / verified
--    flag) — inert until Phase 2 wires an Edge Function to them.
-- 6. Closes a real fulfillment-safety gap: a trigger now blocks moving an
--    order past "confirmed" while it has a linked prescription that isn't
--    approved yet — enforced in the database, not just the UI.
--
-- IDEMPOTENT — safe to re-run (guards every enum change with DO blocks).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. order_status — rename + extend
-- ----------------------------------------------------------------------------
do $$ begin
  alter type order_status rename value 'placed' to 'pending';
exception when others then null; end $$;

do $$ begin
  alter type order_status rename value 'packed' to 'preparing';
exception when others then null; end $$;

alter type order_status add value if not exists 'ready_for_dispatch' after 'preparing';
alter type order_status add value if not exists 'refund_requested' after 'cancelled';
alter type order_status add value if not exists 'refunded' after 'refund_requested';

-- ----------------------------------------------------------------------------
-- 2. approval_status — extend for prescription workflow
-- ----------------------------------------------------------------------------
alter type approval_status add value if not exists 'under_review';
alter type approval_status add value if not exists 'expired';

-- ----------------------------------------------------------------------------
-- 3. payment_status — real enum instead of free text
-- ----------------------------------------------------------------------------
do $$ begin
  create type payment_status_type as enum ('pending', 'processing', 'paid', 'failed', 'refunded', 'cod_pending', 'cod_collected');
exception when duplicate_object then null; end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'payment_status' and data_type = 'text'
  ) then
    alter table public.orders alter column payment_status drop default;
    alter table public.orders alter column payment_status type payment_status_type using (
      case
        when payment_status = 'paid' then 'paid'
        when payment_method = 'cod' then 'cod_pending'
        else 'pending'
      end
    )::payment_status_type;
    alter table public.orders alter column payment_status set default 'pending';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Razorpay scaffolding (inert until Phase 2 Edge Function is deployed)
-- ----------------------------------------------------------------------------
alter table public.orders
  add column if not exists razorpay_order_id   text,
  add column if not exists razorpay_payment_id text,
  add column if not exists payment_verified    boolean not null default false;

-- ----------------------------------------------------------------------------
-- 5. prescriptions — re-upload support + expiry
-- ----------------------------------------------------------------------------
alter table public.prescriptions add column if not exists superseded boolean not null default false;

create or replace function public.expire_stale_prescriptions()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.prescriptions
    set status = 'expired'
    where status = 'pending' and superseded = false and created_at < now() - interval '7 days';
end;
$$;

grant execute on function public.expire_stale_prescriptions() to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Block fulfillment past "confirmed" while prescription is unapproved
-- ----------------------------------------------------------------------------
create or replace function public.enforce_prescription_approval_before_fulfillment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unapproved integer;
begin
  if new.status in ('preparing', 'ready_for_dispatch', 'out_for_delivery', 'delivered')
     and new.status is distinct from old.status then
    select count(*) into v_unapproved
      from public.prescriptions
      where order_id = new.order_id and superseded = false and status not in ('approved');
    if v_unapproved > 0 then
      raise exception 'Cannot advance order %: prescription is not yet approved', new.order_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_prescription_before_fulfillment on public.orders;
create trigger trg_enforce_prescription_before_fulfillment
  before update on public.orders
  for each row execute function public.enforce_prescription_approval_before_fulfillment();

-- ----------------------------------------------------------------------------
-- 7. New prescription upload -> notify store owner (INSERT event; the
--    existing notify_prescription_review trigger only covers UPDATE/review)
-- ----------------------------------------------------------------------------
create or replace function public.notify_prescription_uploaded()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.stores where store_id = new.store_id;
  if v_owner is not null then
    perform public.create_notification(v_owner, 'Prescription uploaded', format('A prescription was uploaded for order #%s — review it under Prescriptions.', new.order_id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_prescription_uploaded on public.prescriptions;
create trigger trg_notify_prescription_uploaded
  after insert on public.prescriptions
  for each row execute function public.notify_prescription_uploaded();
