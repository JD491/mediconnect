-- ============================================================================
-- MediConnect — Core Schema Migration
-- Merges MediMart (medicines/stores/orders/appointments/symptom checker)
-- with VitalSync (patients/vitals/tasks/notes) into one Postgres schema.
-- Target: Supabase (Postgres 15+). Run via `supabase db push` or the SQL editor.
--
-- IDEMPOTENT: every statement below is safe to run more than once against the
-- same database (re-running after a partial failure, or pasting again into
-- the SQL editor, will not error out on "already exists").
-- ============================================================================

-- ---------- extensions ----------
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- fuzzy medicine search

-- ---------- enums (create type has no IF NOT EXISTS, so wrap it) ----------
do $$ begin
  create type user_role as enum ('customer', 'store_owner', 'doctor', 'nurse', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type order_status as enum ('placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type appointment_status as enum ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type task_status as enum ('pending', 'in_progress', 'done');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type task_priority as enum ('low', 'medium', 'high', 'urgent');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type patient_status as enum ('stable', 'monitoring', 'critical', 'discharged');
exception when duplicate_object then null;
end $$;

-- ============================================================================
-- 1. IDENTITY — profiles extends auth.users (Supabase Auth is the source of truth)
-- ============================================================================
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null unique,
  phone         text,
  role          user_role not null default 'customer',
  address       text,
  status        text not null default 'active',        -- active | suspended
  avatar_url    text,
  created_at    timestamptz not null default now()
);
comment on table public.profiles is 'One row per auth.users row. role drives all RLS + UI routing.';

-- helper: current caller's role (used throughout RLS policies)
create or replace function public.current_role()
returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_role() = 'admin';
$$;

-- ============================================================================
-- 2. MEDICINE MARKETPLACE (MediMart)
-- ============================================================================
create table if not exists public.stores (
  store_id          bigint generated always as identity primary key,
  owner_id          uuid not null references public.profiles(id) on delete cascade,
  store_name        text not null,
  license_number    text not null,
  address           text not null,
  latitude          numeric(9,6),
  longitude         numeric(9,6),
  approval_status   approval_status not null default 'pending',
  rating            numeric(2,1) default 0,
  created_at        timestamptz not null default now()
);

create table if not exists public.medicines (
  medicine_id           bigint generated always as identity primary key,
  name                  text not null,
  generic_name          text,
  category              text,
  manufacturer          text,
  image_url             text,
  prescription_required boolean not null default false,
  description           text,
  created_at            timestamptz not null default now()
);
create index if not exists medicines_name_trgm_idx on public.medicines using gin (name gin_trgm_ops);

create table if not exists public.stock (
  stock_id      bigint generated always as identity primary key,
  store_id      bigint not null references public.stores(store_id) on delete cascade,
  medicine_id   bigint not null references public.medicines(medicine_id) on delete cascade,
  price         numeric(10,2) not null check (price >= 0),
  mrp           numeric(10,2) not null check (mrp >= 0),
  quantity      integer not null default 0 check (quantity >= 0),
  expiry_date   date,
  updated_at    timestamptz not null default now(),
  unique (store_id, medicine_id)
);
create index if not exists stock_medicine_idx on public.stock(medicine_id);

create table if not exists public.cart_items (
  cart_item_id  bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  stock_id      bigint not null references public.stock(stock_id) on delete cascade,
  quantity      integer not null default 1 check (quantity > 0),
  created_at    timestamptz not null default now(),
  unique (user_id, stock_id)
);

create table if not exists public.orders (
  order_id            bigint generated always as identity primary key,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  store_id            bigint not null references public.stores(store_id),
  delivery_address    text not null,
  payment_method      text not null default 'cod',
  prescription_url    text,
  status              order_status not null default 'placed',
  total_amount        numeric(10,2) not null default 0,
  created_at          timestamptz not null default now()
);

create table if not exists public.order_items (
  order_item_id   bigint generated always as identity primary key,
  order_id        bigint not null references public.orders(order_id) on delete cascade,
  medicine_id     bigint not null references public.medicines(medicine_id),
  stock_id        bigint references public.stock(stock_id),
  quantity        integer not null check (quantity > 0),
  price           numeric(10,2) not null
);

create table if not exists public.reviews (
  review_id     bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  target_type   text not null,   -- 'store' | 'doctor' | 'medicine'
  target_id     bigint not null,
  rating        smallint not null check (rating between 1 and 5),
  comment       text,
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- 3. DOCTORS & APPOINTMENTS (MediMart)
-- ============================================================================
create table if not exists public.doctors (
  doctor_id             bigint generated always as identity primary key,
  user_id               uuid not null unique references public.profiles(id) on delete cascade,
  specialization        text not null,
  qualification         text,
  registration_number   text,
  experience_years      integer default 0,
  consultation_fee      numeric(10,2) default 0,
  approval_status       approval_status not null default 'pending',
  rating                numeric(2,1) default 0
);

create table if not exists public.doctor_availability (
  slot_id               bigint generated always as identity primary key,
  doctor_id             bigint not null references public.doctors(doctor_id) on delete cascade,
  day_of_week           text not null,          -- 'Mon' .. 'Sun'
  start_time            time not null,
  end_time              time not null,
  slot_duration_minutes integer not null default 15
);

create table if not exists public.appointments (
  appointment_id    bigint generated always as identity primary key,
  patient_id        uuid not null references public.profiles(id) on delete cascade,
  doctor_id         bigint not null references public.doctors(doctor_id) on delete cascade,
  appointment_date  date not null,
  appointment_time  time not null,
  status            appointment_status not null default 'pending',
  reason            text,
  created_at        timestamptz not null default now(),
  unique (doctor_id, appointment_date, appointment_time)
);
create index if not exists appointments_patient_idx on public.appointments(patient_id);
create index if not exists appointments_doctor_idx on public.appointments(doctor_id);

-- ============================================================================
-- 4. CLINICAL CARE (VitalSync) — nurse/doctor patient monitoring
-- ============================================================================
create table if not exists public.patients (
  patient_id        bigint generated always as identity primary key,
  profile_id        uuid references public.profiles(id) on delete set null, -- linked if patient also has a login
  name              text not null,
  age               integer,
  gender            text,
  room_number       text,
  status            patient_status not null default 'stable',
  primary_doctor_id bigint references public.doctors(doctor_id),
  primary_nurse_id  uuid references public.profiles(id),
  admitted_at       timestamptz not null default now(),
  discharged_at     timestamptz
);

create table if not exists public.vitals (
  vital_id            bigint generated always as identity primary key,
  patient_id          bigint not null references public.patients(patient_id) on delete cascade,
  heart_rate          integer,
  bp_systolic         integer,
  bp_diastolic        integer,
  temperature         numeric(4,1),
  spo2                integer,
  respiratory_rate    integer,
  recorded_by         uuid references public.profiles(id),
  recorded_at         timestamptz not null default now()
);
create index if not exists vitals_patient_recorded_idx on public.vitals(patient_id, recorded_at desc);

create table if not exists public.tasks (
  task_id       bigint generated always as identity primary key,
  patient_id    bigint references public.patients(patient_id) on delete cascade,
  assigned_to   uuid references public.profiles(id) on delete set null,
  created_by    uuid references public.profiles(id),
  title         text not null,
  description   text,
  status        task_status not null default 'pending',
  priority      task_priority not null default 'medium',
  due_at        timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists tasks_assigned_idx on public.tasks(assigned_to, status);

create table if not exists public.notes (
  note_id       bigint generated always as identity primary key,
  patient_id    bigint references public.patients(patient_id) on delete cascade,
  created_by    uuid references public.profiles(id),
  content       text not null,
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- 5. SHARED PLATFORM FEATURES
-- ============================================================================
create table if not exists public.emergency_contacts (
  contact_id    bigint generated always as identity primary key,
  name          text not null,
  type          text not null,          -- ambulance | hospital | police | blood_bank
  phone         text not null,
  address       text,
  latitude      numeric(9,6),
  longitude     numeric(9,6)
);

create table if not exists public.notifications (
  notification_id  bigint generated always as identity primary key,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  title            text not null,
  message          text,
  is_read          boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, is_read);

create table if not exists public.symptom_checks (
  check_id      bigint generated always as identity primary key,
  user_id       uuid references public.profiles(id) on delete cascade,
  symptoms      jsonb not null,     -- array of symptom ids submitted
  result        jsonb not null,     -- array of {condition, severity, action, score}
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- 6. AUTO-PROFILE TRIGGER — creates a profiles row whenever a user signs up
-- (role/name/phone passed via supabase.auth.signUp({options:{data:{...}}}))
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, phone, role, address)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'phone',
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer'),
    new.raw_user_meta_data->>'address'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- "create trigger" has no IF NOT EXISTS, so drop-then-create instead
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- 7. updated_at maintenance for stock
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists stock_touch_updated_at on public.stock;
create trigger stock_touch_updated_at before update on public.stock
  for each row execute procedure public.touch_updated_at();

-- ============================================================================
-- 8. REALTIME — enable logical replication for tables the UI subscribes to
-- "alter publication ... add table" errors on a table that's already a member,
-- and errors the whole statement if ANY one table in the list is a dupe — so
-- add each table individually and swallow "already a member" errors.
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'public.appointments', 'public.tasks', 'public.vitals', 'public.notes',
    'public.orders', 'public.notifications', 'public.stock'
  ]
  loop
    begin
      execute format('alter publication supabase_realtime add table %s', t);
    exception
      when duplicate_object then null;      -- already a member, fine
      when undefined_object then            -- publication doesn't exist yet
        raise notice 'supabase_realtime publication not found — skipping %', t;
    end;
  end loop;
end $$;
