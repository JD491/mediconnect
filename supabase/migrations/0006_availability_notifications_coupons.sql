-- ============================================================================
-- MediConnect — Phase 4: Doctor Availability, Nurse, Notifications, Coupons
--
-- Includes one more RLS tightening found while wiring up notifications:
-- `notifications_system_insert` was `with check (true)` — any authenticated
-- client could insert a notification row for ANY user_id (a spam/spoofing
-- vector), not just "trusted server-side functions" as the comment claimed.
-- Cross-user notifications now flow through SECURITY DEFINER trigger
-- functions below (which bypass RLS by design); the client-facing policy is
-- tightened to self-only.
--
-- Also fixes a real booking bug: the original unique constraint on
-- (doctor_id, date, time) covered ALL appointments including cancelled ones,
-- so a cancelled slot could never be rebooked by anyone — even though the UI
-- correctly showed it as free. Replaced with a partial unique index that
-- ignores cancelled rows.
--
-- IDEMPOTENT — every statement is safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. appointments — fix double-booking constraint to ignore cancelled slots
-- ----------------------------------------------------------------------------
do $$
declare con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.appointments'::regclass and contype = 'u'
  loop
    execute format('alter table public.appointments drop constraint %I', con.conname);
  end loop;
end $$;

create unique index if not exists appointments_open_slot_uidx
  on public.appointments (doctor_id, appointment_date, appointment_time)
  where status <> 'cancelled';

-- ----------------------------------------------------------------------------
-- 2. doctors — profile fields
-- ----------------------------------------------------------------------------
alter table public.doctors
  add column if not exists hospital_clinic  text,
  add column if not exists bio              text,
  add column if not exists profile_image_url text;

-- ----------------------------------------------------------------------------
-- 3. notifications — tighten client-insert policy, add trigger-driven events
-- ----------------------------------------------------------------------------
drop policy if exists "notifications_system_insert" on public.notifications;
create policy "notifications_system_insert" on public.notifications
  for insert with check (user_id = auth.uid() or public.is_admin());

create or replace function public.create_notification(p_user_id uuid, p_title text, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, title, message) values (p_user_id, p_title, p_message);
end;
$$;

-- new order -> notify store owner
create or replace function public.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.stores where store_id = new.store_id;
  if v_owner is not null then
    perform public.create_notification(v_owner, 'New order received', format('Order #%s placed — ₹%s', new.order_id, new.total_amount));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_order on public.orders;
create trigger trg_notify_new_order
  after insert on public.orders
  for each row execute function public.notify_new_order();

-- order status change -> notify customer
create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.create_notification(new.user_id, 'Order update', format('Order #%s is now %s', new.order_id, new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_order_status_change on public.orders;
create trigger trg_notify_order_status_change
  after update on public.orders
  for each row execute function public.notify_order_status_change();

-- new appointment -> notify doctor
create or replace function public.notify_new_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_doctor_user uuid;
begin
  select user_id into v_doctor_user from public.doctors where doctor_id = new.doctor_id;
  if v_doctor_user is not null then
    perform public.create_notification(v_doctor_user, 'New appointment request', format('Requested for %s at %s', new.appointment_date, new.appointment_time));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_appointment on public.appointments;
create trigger trg_notify_new_appointment
  after insert on public.appointments
  for each row execute function public.notify_new_appointment();

-- appointment status change -> notify patient
create or replace function public.notify_appointment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.create_notification(new.patient_id, 'Appointment update', format('Your appointment on %s at %s is now %s', new.appointment_date, new.appointment_time, new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_appointment_status_change on public.appointments;
create trigger trg_notify_appointment_status_change
  after update on public.appointments
  for each row execute function public.notify_appointment_status_change();

-- prescription review -> notify customer
create or replace function public.notify_prescription_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    perform public.create_notification(
      new.customer_id,
      'Prescription ' || new.status,
      format('Your prescription for order #%s was %s%s', new.order_id, new.status,
        case when new.status = 'rejected' and new.rejection_reason is not null then ': ' || new.rejection_reason else '' end)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_prescription_review on public.prescriptions;
create trigger trg_notify_prescription_review
  after update on public.prescriptions
  for each row execute function public.notify_prescription_review();

-- ----------------------------------------------------------------------------
-- 4. coupons — store-owned, with atomic redeem (row-locked, race-safe)
-- ----------------------------------------------------------------------------
create table if not exists public.coupons (
  coupon_id         bigint generated always as identity primary key,
  store_id          bigint not null references public.stores(store_id) on delete cascade,
  code              text not null,
  discount_type     text not null check (discount_type in ('percentage', 'fixed')),
  discount_value    numeric(10,2) not null check (discount_value > 0),
  min_order_amount  numeric(10,2) not null default 0 check (min_order_amount >= 0),
  max_discount      numeric(10,2),
  start_date        date,
  end_date          date,
  usage_limit       integer,
  used_count        integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  unique (store_id, code)
);

alter table public.coupons enable row level security;

drop policy if exists "coupons_read" on public.coupons;
create policy "coupons_read" on public.coupons
  for select using (
    (is_active and (start_date is null or start_date <= current_date) and (end_date is null or end_date >= current_date))
    or exists (select 1 from public.stores s where s.store_id = coupons.store_id and s.owner_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "coupons_owner_write" on public.coupons;
create policy "coupons_owner_write" on public.coupons
  for all using (
    exists (select 1 from public.stores s where s.store_id = coupons.store_id and s.owner_id = auth.uid()) or public.is_admin()
  ) with check (
    exists (select 1 from public.stores s where s.store_id = coupons.store_id and s.owner_id = auth.uid()) or public.is_admin()
  );

-- Read-only validity/discount preview — safe to call on every keystroke, never mutates.
create or replace function public.preview_coupon(p_store_id bigint, p_code text, p_order_amount numeric)
returns table(success boolean, message text, discount_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  computed numeric;
begin
  select * into c from public.coupons where store_id = p_store_id and code = p_code;
  if c is null then return query select false, 'Invalid coupon code.', 0::numeric; return; end if;
  if not c.is_active then return query select false, 'This coupon is no longer active.', 0::numeric; return; end if;
  if c.start_date is not null and c.start_date > current_date then return query select false, 'This coupon is not active yet.', 0::numeric; return; end if;
  if c.end_date is not null and c.end_date < current_date then return query select false, 'This coupon has expired.', 0::numeric; return; end if;
  if p_order_amount < c.min_order_amount then return query select false, format('Minimum order amount is ₹%s.', c.min_order_amount), 0::numeric; return; end if;
  if c.usage_limit is not null and c.used_count >= c.usage_limit then return query select false, 'This coupon has reached its usage limit.', 0::numeric; return; end if;

  if c.discount_type = 'percentage' then
    computed := p_order_amount * c.discount_value / 100;
    if c.max_discount is not null and computed > c.max_discount then computed := c.max_discount; end if;
  else
    computed := c.discount_value;
  end if;
  if computed > p_order_amount then computed := p_order_amount; end if;

  return query select true, 'Coupon valid.', computed;
end;
$$;

-- Actually applies the coupon: re-validates then atomically increments used_count
-- under a row lock, so two simultaneous checkouts can't both slip through a
-- usage_limit=1 coupon. Called once, at the moment an order is placed.
create or replace function public.redeem_coupon(p_store_id bigint, p_code text, p_order_amount numeric)
returns table(success boolean, message text, discount_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  computed numeric;
begin
  select * into c from public.coupons where store_id = p_store_id and code = p_code for update;
  if c is null then return query select false, 'Invalid coupon code.', 0::numeric; return; end if;
  if not c.is_active then return query select false, 'This coupon is no longer active.', 0::numeric; return; end if;
  if c.start_date is not null and c.start_date > current_date then return query select false, 'This coupon is not active yet.', 0::numeric; return; end if;
  if c.end_date is not null and c.end_date < current_date then return query select false, 'This coupon has expired.', 0::numeric; return; end if;
  if p_order_amount < c.min_order_amount then return query select false, format('Minimum order amount is ₹%s.', c.min_order_amount), 0::numeric; return; end if;
  if c.usage_limit is not null and c.used_count >= c.usage_limit then return query select false, 'This coupon has reached its usage limit.', 0::numeric; return; end if;

  if c.discount_type = 'percentage' then
    computed := p_order_amount * c.discount_value / 100;
    if c.max_discount is not null and computed > c.max_discount then computed := c.max_discount; end if;
  else
    computed := c.discount_value;
  end if;
  if computed > p_order_amount then computed := p_order_amount; end if;

  update public.coupons set used_count = used_count + 1 where coupon_id = c.coupon_id;

  return query select true, 'Coupon applied.', computed;
end;
$$;

grant execute on function public.preview_coupon(bigint, text, numeric) to authenticated;
grant execute on function public.redeem_coupon(bigint, text, numeric) to authenticated;

alter table public.orders
  add column if not exists discount_amount numeric(10,2) not null default 0 check (discount_amount >= 0),
  add column if not exists coupon_code text;
