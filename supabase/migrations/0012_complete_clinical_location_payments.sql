-- ============================================================================
-- MediConnect — 0012: complete clinical, location, payment & e-prescription
-- schema to match the production frontend.
--
-- Everything here is additive and idempotent. It closes the gap between the
-- TypeScript data model (src/types/database.types.ts) and the SQL built up by
-- migrations 0001–0011:
--   * GPS hyperlocal delivery columns (orders / stores)
--   * online + offline payment lifecycle columns (orders / appointments)
--   * doctor-issued e-prescriptions (new table + RLS)
--   * vitals triage + medication-administration (MAR) task fields
--   * patient demographics used by the EHR
--   * medicine pricing/GST metadata
--   * `refund_initiated` order status and its transition graph
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. order_status — add the refund acknowledgement step
--    (no statement in this transaction reads the new label directly)
-- ----------------------------------------------------------------------------
alter type order_status add value if not exists 'refund_initiated' after 'refund_requested';

-- ----------------------------------------------------------------------------
-- 2. Order status transitions — delivered -> refund_requested ->
--    refund_initiated -> refunded (direct request -> refunded kept for
--    instant/auto-approved refunds)
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
      return new;
    end if;

    allowed := case old.status::text
      when 'pending'             then new.status::text in ('confirmed', 'cancelled')
      when 'confirmed'           then new.status::text in ('preparing', 'cancelled')
      when 'preparing'           then new.status::text in ('ready_for_dispatch', 'cancelled')
      when 'ready_for_dispatch'  then new.status::text in ('out_for_delivery', 'cancelled')
      when 'out_for_delivery'    then new.status::text in ('delivered', 'cancelled')
      when 'delivered'           then new.status::text in ('refund_requested')
      when 'refund_requested'    then new.status::text in ('refund_initiated', 'refunded')
      when 'refund_initiated'    then new.status::text in ('refunded')
      else false
    end;

    if not allowed then
      raise exception 'Invalid order status transition: % -> %', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Orders — delivery distance, partner tracking, pickup & payment refs
-- ----------------------------------------------------------------------------
alter table public.orders
  add column if not exists pickup_token             text,
  add column if not exists offline_collection_ref   text,
  add column if not exists payment_ref              text,
  add column if not exists payment_failure_reason   text,
  add column if not exists delivery_distance_km     numeric(6,2),
  add column if not exists delivery_partner_name    text,
  add column if not exists delivery_partner_phone   text,
  add column if not exists delivery_partner_lat     numeric(9,6),
  add column if not exists delivery_partner_lng     numeric(9,6),
  add column if not exists self_pickup              boolean not null default false;

create index if not exists orders_pickup_token_idx on public.orders(pickup_token) where pickup_token is not null;
create index if not exists orders_payment_ref_idx on public.orders(payment_ref) where payment_ref is not null;

-- Keep payment_status consistent for the new offline methods. Self-pickup is
-- prepaid online (it only becomes cod_pending when the customer explicitly
-- switches it to Cash on Delivery), so it is deliberately excluded here.
update public.orders
  set payment_status = 'cod_pending'
  where payment_method in ('cod', 'upi_offline', 'clinic_counter')
    and payment_status = 'pending';

-- ----------------------------------------------------------------------------
-- 3b. Order payment guards — keep 0011's protections, but align them with the
--     shipped checkout/refund flows:
--       * COD, doorstep UPI and clinic-counter orders start `cod_pending`;
--         self-pickup/online stay `pending` until the gateway verifies them.
--       * a customer may abandon a failed online payment for COD, and may
--         move their own unpaid order between pending/processing/failed.
--       * only the store owner, service_role or an admin can mark money as
--         received (paid/refunded/cod_collected) or set payment_verified.
--     Everything else 0011 protected (amounts, coupon, store, method, user,
--     Razorpay ids) stays immutable for non-trusted writers.
-- ----------------------------------------------------------------------------
create or replace function public.protect_order_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_store_owner boolean;
  v_is_customer boolean;
  v_cod_switch boolean;
  v_customer_unpaid_state boolean;
  v_trusted boolean;
begin
  v_trusted := auth.role() = 'service_role'
    or public.is_admin()
    or coalesce(current_setting('mediconnect.system_write', true), 'off') = 'on';

  if v_trusted then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.payment_status := case
      when new.payment_method::text in ('cod', 'upi_offline', 'clinic_counter') then 'cod_pending'
      else 'pending'
    end;
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

  -- Abandoned/failed checkout or retry: a customer can only move their own
  -- order back into an unpaid state. "processing" is also allowed while they
  -- open a refund request (status -> refund_requested).
  v_customer_unpaid_state := v_is_customer
    and new.payment_status::text in ('pending', 'processing', 'failed')
    and (
      old.payment_status::text in ('pending', 'processing', 'failed')
      or new.status::text = 'refund_requested'
    );

  -- "Switch to Cash on Delivery" from a still-open prepaid order.
  v_cod_switch := v_is_customer
    and old.payment_method::text in ('online', 'self_pickup')
    and new.payment_method::text = 'cod'
    and new.payment_status::text = 'cod_pending'
    and old.status::text in ('pending', 'confirmed');

  -- Financial + identity fields are immutable once the order exists.
  if new.total_amount is distinct from old.total_amount
     or new.discount_amount is distinct from old.discount_amount
     or new.coupon_code is distinct from old.coupon_code
     or new.razorpay_order_id is distinct from old.razorpay_order_id
     or new.razorpay_payment_id is distinct from old.razorpay_payment_id
     or new.store_id is distinct from old.store_id
     or new.delivery_fee is distinct from old.delivery_fee
     or new.user_id is distinct from old.user_id then
    new.total_amount := old.total_amount;
    new.discount_amount := old.discount_amount;
    new.coupon_code := old.coupon_code;
    new.razorpay_order_id := old.razorpay_order_id;
    new.razorpay_payment_id := old.razorpay_payment_id;
    new.store_id := old.store_id;
    new.delivery_fee := old.delivery_fee;
    new.user_id := old.user_id;
  end if;

  -- Payment method is immutable except for the customer's COD switch.
  if new.payment_method is distinct from old.payment_method
     and not v_is_store_owner
     and not v_cod_switch then
    new.payment_method := old.payment_method;
  end if;

  -- Payment status: the till may always update it; customers are limited to
  -- unpaid states. Nobody without trust can mark an order paid/refunded.
  if new.payment_status is distinct from old.payment_status
     and not v_is_store_owner
     and not v_customer_unpaid_state
     and not v_cod_switch then
    new.payment_status := old.payment_status;
  end if;

  -- payment_verified is a money-received signal: store till or webhook only.
  if new.payment_verified is distinct from old.payment_verified
     and not v_is_store_owner then
    new.payment_verified := old.payment_verified;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Stores — explicit delivery radius/coordinates (0001 already had lat/lng)
-- ----------------------------------------------------------------------------
alter table public.stores
  add column if not exists latitude           numeric(9,6),
  add column if not exists longitude          numeric(9,6),
  add column if not exists delivery_radius_km numeric(5,1);

-- ----------------------------------------------------------------------------
-- 5. Medicines — GST + salt composition used on product cards/invoices
-- ----------------------------------------------------------------------------
alter table public.medicines
  add column if not exists salt_composition text,
  add column if not exists gst_rate         numeric(4,2) not null default 12
    check (gst_rate in (0, 5, 12, 18, 28));

-- ----------------------------------------------------------------------------
-- 6. Profiles / patients — demographics, allergies, blood group
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists date_of_birth date,
  add column if not exists gender        text,
  add column if not exists blood_group   text,
  add column if not exists allergies     text[] not null default '{}';

alter table public.patients
  add column if not exists blood_group text,
  add column if not exists allergies   text[] not null default '{}',
  add column if not exists phone       text;

-- ----------------------------------------------------------------------------
-- 7. Appointments — consultation mode + prepaid / clinic-counter payment
-- ----------------------------------------------------------------------------
alter table public.appointments
  add column if not exists payment_method      text not null default 'clinic_counter',
  add column if not exists payment_status      text not null default 'cod_pending',
  add column if not exists payment_ref         text,
  add column if not exists razorpay_order_id   text,
  add column if not exists razorpay_payment_id text,
  add column if not exists payment_verified    boolean not null default false,
  add column if not exists consultation_mode   text not null default 'in_person',
  add column if not exists meeting_link        text,
  add column if not exists notes               text,
  add column if not exists triage              text;

create index if not exists appointments_payment_status_idx on public.appointments(payment_status);
-- Same payment can never settle two appointments (mirrors orders in 0009).
create unique index if not exists appointments_razorpay_payment_id_unique
  on public.appointments(razorpay_payment_id) where razorpay_payment_id is not null;

-- ----------------------------------------------------------------------------
-- 8. Vitals — glucose / weight / pain score for triage charts
-- ----------------------------------------------------------------------------
alter table public.vitals
  add column if not exists glucose numeric(6,1),
  add column if not exists weight_kg numeric(5,1),
  add column if not exists pain_score smallint check (pain_score between 0 and 10);

-- ----------------------------------------------------------------------------
-- 9. Tasks — medication administration record (MAR) + walk-in fee capture
-- ----------------------------------------------------------------------------
alter type task_status add value if not exists 'escalated' after 'done';

alter table public.tasks
  add column if not exists task_type text not null default 'other'
    check (task_type in ('medication', 'observation', 'procedure', 'walk_in', 'other')),
  add column if not exists medication_name  text,
  add column if not exists dosage           text,
  add column if not exists scheduled_at     timestamptz,
  add column if not exists administered_at  timestamptz,
  add column if not exists escalated_reason text,
  add column if not exists fee_amount       numeric(10,2),
  add column if not exists fee_verified     boolean not null default false,
  add column if not exists fee_ref          text;

create index if not exists tasks_mar_idx on public.tasks(assigned_to, status, scheduled_at);

-- ----------------------------------------------------------------------------
-- 10. Prescriptions — doctor-authored e-prescription metadata
-- ----------------------------------------------------------------------------
alter table public.prescriptions
  add column if not exists diagnosis      text,
  add column if not exists notes          text,
  add column if not exists prescribed_by  uuid references public.profiles(id),
  add column if not exists follow_up_date date,
  add column if not exists items          jsonb not null default '[]'::jsonb;

-- ----------------------------------------------------------------------------
-- 11. e_prescriptions — structured prescriptions written inside the doctor
--     portal (independent of a pharmacy order; a patient can later attach
--     one to an order).
-- ----------------------------------------------------------------------------
create table if not exists public.e_prescriptions (
  e_prescription_id bigint generated always as identity primary key,
  doctor_id         bigint not null references public.doctors(doctor_id) on delete cascade,
  appointment_id    bigint references public.appointments(appointment_id) on delete set null,
  patient_profile_id uuid references public.profiles(id) on delete set null,
  patient_id        bigint references public.patients(patient_id) on delete set null,
  diagnosis         text not null,
  advice            text,
  follow_up_date    date,
  items             jsonb not null default '[]'::jsonb,
  vitals            jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists e_prescriptions_doctor_idx on public.e_prescriptions(doctor_id, created_at desc);
create index if not exists e_prescriptions_patient_idx on public.e_prescriptions(patient_profile_id);
create index if not exists e_prescriptions_appointment_idx on public.e_prescriptions(appointment_id);

alter table public.e_prescriptions enable row level security;

drop policy if exists "e_prescriptions_read" on public.e_prescriptions;
create policy "e_prescriptions_read" on public.e_prescriptions
  for select using (
    patient_profile_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.doctors d
      where d.doctor_id = e_prescriptions.doctor_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "e_prescriptions_doctor_insert" on public.e_prescriptions;
create policy "e_prescriptions_doctor_insert" on public.e_prescriptions
  for insert with check (
    exists (
      select 1 from public.doctors d
      where d.doctor_id = e_prescriptions.doctor_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "e_prescriptions_doctor_update" on public.e_prescriptions;
create policy "e_prescriptions_doctor_update" on public.e_prescriptions
  for update using (
    exists (
      select 1 from public.doctors d
      where d.doctor_id = e_prescriptions.doctor_id and d.user_id = auth.uid()
    )
  );

drop policy if exists "e_prescriptions_doctor_delete" on public.e_prescriptions;
create policy "e_prescriptions_doctor_delete" on public.e_prescriptions
  for delete using (
    public.is_admin()
    or exists (
      select 1 from public.doctors d
      where d.doctor_id = e_prescriptions.doctor_id and d.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 12. Grants for the new table (matches the rest of the public schema)
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on public.e_prescriptions to authenticated;
grant usage, select on sequence public.e_prescriptions_e_prescription_id_seq to authenticated;
