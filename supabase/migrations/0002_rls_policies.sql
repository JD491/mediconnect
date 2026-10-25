-- ============================================================================
-- MediConnect — Row Level Security
-- Pattern: enable RLS everywhere, then explicit policies per role.
-- public.current_role() / public.is_admin() come from 0001_init_schema.sql
--
-- IDEMPOTENT: "create policy" has no IF NOT EXISTS in Postgres, so every
-- policy below is dropped first (if present) and recreated. Safe to re-run.
-- ============================================================================

alter table public.profiles            enable row level security;
alter table public.stores              enable row level security;
alter table public.medicines           enable row level security;
alter table public.stock               enable row level security;
alter table public.cart_items          enable row level security;
alter table public.orders              enable row level security;
alter table public.order_items         enable row level security;
alter table public.reviews             enable row level security;
alter table public.doctors             enable row level security;
alter table public.doctor_availability enable row level security;
alter table public.appointments        enable row level security;
alter table public.patients            enable row level security;
alter table public.vitals              enable row level security;
alter table public.tasks               enable row level security;
alter table public.notes               enable row level security;
alter table public.emergency_contacts  enable row level security;
alter table public.notifications       enable row level security;
alter table public.symptom_checks      enable row level security;

-- ---------- profiles ----------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- doctors/nurses/store owners need to be *visible* (name only, via view) to
-- patients/customers; we expose a lightweight public view instead of opening the table:
create or replace view public.public_directory as
  select id, name, role from public.profiles where role in ('doctor', 'nurse');
grant select on public.public_directory to authenticated, anon;

-- ---------- stores ----------
drop policy if exists "stores_public_read_approved" on public.stores;
create policy "stores_public_read_approved" on public.stores
  for select using (approval_status = 'approved' or owner_id = auth.uid() or public.is_admin());

drop policy if exists "stores_owner_insert" on public.stores;
create policy "stores_owner_insert" on public.stores
  for insert with check (owner_id = auth.uid());

drop policy if exists "stores_owner_update" on public.stores;
create policy "stores_owner_update" on public.stores
  for update using (owner_id = auth.uid() or public.is_admin());

-- ---------- medicines (public catalog) ----------
drop policy if exists "medicines_public_read" on public.medicines;
create policy "medicines_public_read" on public.medicines for select using (true);

drop policy if exists "medicines_admin_write" on public.medicines;
create policy "medicines_admin_write" on public.medicines
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- stock ----------
drop policy if exists "stock_public_read" on public.stock;
create policy "stock_public_read" on public.stock for select using (true);

drop policy if exists "stock_owner_write" on public.stock;
create policy "stock_owner_write" on public.stock
  for all using (
    exists (select 1 from public.stores s where s.store_id = stock.store_id and s.owner_id = auth.uid())
    or public.is_admin()
  ) with check (
    exists (select 1 from public.stores s where s.store_id = stock.store_id and s.owner_id = auth.uid())
    or public.is_admin()
  );

-- ---------- cart_items (private to the shopper) ----------
drop policy if exists "cart_owner_all" on public.cart_items;
create policy "cart_owner_all" on public.cart_items
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- orders ----------
drop policy if exists "orders_customer_read_own" on public.orders;
create policy "orders_customer_read_own" on public.orders
  for select using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.stores s where s.store_id = orders.store_id and s.owner_id = auth.uid())
  );

drop policy if exists "orders_customer_insert" on public.orders;
create policy "orders_customer_insert" on public.orders
  for insert with check (user_id = auth.uid());

drop policy if exists "orders_store_update_status" on public.orders;
create policy "orders_store_update_status" on public.orders
  for update using (
    exists (select 1 from public.stores s where s.store_id = orders.store_id and s.owner_id = auth.uid())
    or public.is_admin()
  );

-- ---------- order_items (inherit via parent order) ----------
drop policy if exists "order_items_via_order" on public.order_items;
create policy "order_items_via_order" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.order_id = order_items.order_id
        and (o.user_id = auth.uid() or public.is_admin()
             or exists (select 1 from public.stores s where s.store_id = o.store_id and s.owner_id = auth.uid()))
    )
  );

drop policy if exists "order_items_insert_via_order" on public.order_items;
create policy "order_items_insert_via_order" on public.order_items
  for insert with check (
    exists (select 1 from public.orders o where o.order_id = order_items.order_id and o.user_id = auth.uid())
  );

-- ---------- reviews ----------
drop policy if exists "reviews_public_read" on public.reviews;
create policy "reviews_public_read" on public.reviews for select using (true);

drop policy if exists "reviews_own_write" on public.reviews;
create policy "reviews_own_write" on public.reviews
  for insert with check (user_id = auth.uid());

-- ---------- doctors ----------
drop policy if exists "doctors_public_read_approved" on public.doctors;
create policy "doctors_public_read_approved" on public.doctors
  for select using (approval_status = 'approved' or user_id = auth.uid() or public.is_admin());

drop policy if exists "doctors_self_update" on public.doctors;
create policy "doctors_self_update" on public.doctors
  for update using (user_id = auth.uid() or public.is_admin());

drop policy if exists "doctors_self_insert" on public.doctors;
create policy "doctors_self_insert" on public.doctors
  for insert with check (user_id = auth.uid());

-- ---------- doctor_availability ----------
drop policy if exists "availability_public_read" on public.doctor_availability;
create policy "availability_public_read" on public.doctor_availability for select using (true);

drop policy if exists "availability_doctor_write" on public.doctor_availability;
create policy "availability_doctor_write" on public.doctor_availability
  for all using (
    exists (select 1 from public.doctors d where d.doctor_id = doctor_availability.doctor_id and d.user_id = auth.uid())
    or public.is_admin()
  );

-- ---------- appointments ----------
drop policy if exists "appointments_patient_read" on public.appointments;
create policy "appointments_patient_read" on public.appointments
  for select using (
    patient_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.doctors d where d.doctor_id = appointments.doctor_id and d.user_id = auth.uid())
  );

drop policy if exists "appointments_patient_insert" on public.appointments;
create policy "appointments_patient_insert" on public.appointments
  for insert with check (patient_id = auth.uid());

drop policy if exists "appointments_update_by_patient_or_doctor" on public.appointments;
create policy "appointments_update_by_patient_or_doctor" on public.appointments
  for update using (
    patient_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.doctors d where d.doctor_id = appointments.doctor_id and d.user_id = auth.uid())
  );

-- ---------- patients (clinical) — staff-only ----------
drop policy if exists "patients_staff_read" on public.patients;
create policy "patients_staff_read" on public.patients
  for select using (
    public.current_role() in ('nurse', 'doctor', 'admin')
    or profile_id = auth.uid()
  );

drop policy if exists "patients_staff_write" on public.patients;
create policy "patients_staff_write" on public.patients
  for all using (public.current_role() in ('nurse', 'doctor', 'admin'))
  with check (public.current_role() in ('nurse', 'doctor', 'admin'));

-- ---------- vitals ----------
drop policy if exists "vitals_staff_read" on public.vitals;
create policy "vitals_staff_read" on public.vitals
  for select using (
    public.current_role() in ('nurse', 'doctor', 'admin')
    or exists (select 1 from public.patients p where p.patient_id = vitals.patient_id and p.profile_id = auth.uid())
  );

drop policy if exists "vitals_staff_write" on public.vitals;
create policy "vitals_staff_write" on public.vitals
  for insert with check (public.current_role() in ('nurse', 'doctor', 'admin'));

-- ---------- tasks ----------
drop policy if exists "tasks_staff_read" on public.tasks;
create policy "tasks_staff_read" on public.tasks
  for select using (public.current_role() in ('nurse', 'doctor', 'admin'));

drop policy if exists "tasks_staff_write" on public.tasks;
create policy "tasks_staff_write" on public.tasks
  for all using (public.current_role() in ('nurse', 'doctor', 'admin'))
  with check (public.current_role() in ('nurse', 'doctor', 'admin'));

-- ---------- notes ----------
drop policy if exists "notes_staff_read" on public.notes;
create policy "notes_staff_read" on public.notes
  for select using (public.current_role() in ('nurse', 'doctor', 'admin'));

drop policy if exists "notes_staff_write" on public.notes;
create policy "notes_staff_write" on public.notes
  for insert with check (public.current_role() in ('nurse', 'doctor', 'admin'));

-- ---------- emergency_contacts (public read, admin write) ----------
drop policy if exists "emergency_public_read" on public.emergency_contacts;
create policy "emergency_public_read" on public.emergency_contacts for select using (true);

drop policy if exists "emergency_admin_write" on public.emergency_contacts;
create policy "emergency_admin_write" on public.emergency_contacts
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- notifications ----------
drop policy if exists "notifications_own_read" on public.notifications;
create policy "notifications_own_read" on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists "notifications_own_update" on public.notifications;
create policy "notifications_own_update" on public.notifications
  for update using (user_id = auth.uid());

drop policy if exists "notifications_system_insert" on public.notifications;
create policy "notifications_system_insert" on public.notifications
  for insert with check (true); -- inserted by trusted server-side functions/triggers

-- ---------- symptom_checks ----------
drop policy if exists "symptom_checks_own" on public.symptom_checks;
create policy "symptom_checks_own" on public.symptom_checks
  for all using (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid());
