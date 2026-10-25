-- ============================================================================
-- MediConnect — Phase 1: Shop Owner Module
-- Adds: full store-profile fields, medicine master-catalog extensions,
-- store-inventory (stock) extensions, prescriptions table + private storage
-- bucket/policies, and updated medicines RLS so store owners can contribute
-- to the shared master catalog (architecture: admin/owner-authored master
-- medicines + per-store price/stock/batch in `stock`, per section 5 of spec).
--
-- IDEMPOTENT — every statement is safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. stores — full profile fields
-- ----------------------------------------------------------------------------
alter table public.stores
  add column if not exists store_owner_name   text,
  add column if not exists logo_url           text,
  add column if not exists phone              text,
  add column if not exists email              text,
  add column if not exists city               text,
  add column if not exists pincode            text,
  add column if not exists description        text,
  add column if not exists opening_time       time,
  add column if not exists closing_time       time,
  add column if not exists weekly_holidays    text[] not null default '{}',
  add column if not exists delivery_radius_km numeric(5,1),
  add column if not exists min_order_amount   numeric(10,2) not null default 0 check (min_order_amount >= 0),
  add column if not exists is_open            boolean not null default true;

-- ----------------------------------------------------------------------------
-- 2. medicines — master catalog extensions
-- ----------------------------------------------------------------------------
do $$ begin
  create type medicine_form as enum ('tablet','capsule','syrup','injection','cream','drops','other');
exception when duplicate_object then null; end $$;

alter table public.medicines
  add column if not exists brand      text,
  add column if not exists dosage     text,
  add column if not exists form       medicine_form,
  add column if not exists pack_size  text,
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists is_active  boolean not null default true;

-- ----------------------------------------------------------------------------
-- 3. stock — store-inventory extensions (per-store price/stock/batch/expiry)
-- ----------------------------------------------------------------------------
alter table public.stock
  add column if not exists discount_percent  numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  add column if not exists min_stock_level   integer not null default 10 check (min_stock_level >= 0),
  add column if not exists batch_number      text,
  add column if not exists manufacturing_date date,
  add column if not exists sku               text,
  add column if not exists barcode           text,
  add column if not exists is_active         boolean not null default true;

alter table public.stock drop constraint if exists stock_expiry_after_mfg;
alter table public.stock add constraint stock_expiry_after_mfg
  check (manufacturing_date is null or expiry_date is null or expiry_date >= manufacturing_date);

-- ----------------------------------------------------------------------------
-- 4. orders — cancellation reason
-- ----------------------------------------------------------------------------
alter table public.orders add column if not exists cancellation_reason text;

-- ----------------------------------------------------------------------------
-- 5. prescriptions
-- ----------------------------------------------------------------------------
create table if not exists public.prescriptions (
  prescription_id  bigint generated always as identity primary key,
  order_id         bigint not null references public.orders(order_id) on delete cascade,
  customer_id      uuid not null references public.profiles(id) on delete cascade,
  store_id         bigint not null references public.stores(store_id) on delete cascade,
  file_path        text not null,   -- storage path convention: {store_id}/{order_id}/{filename}
  status           approval_status not null default 'pending',
  rejection_reason text,
  reviewed_by      uuid references public.profiles(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists prescriptions_store_idx on public.prescriptions(store_id, status);
create index if not exists prescriptions_order_idx on public.prescriptions(order_id);

alter table public.prescriptions enable row level security;

drop policy if exists "prescriptions_read" on public.prescriptions;
create policy "prescriptions_read" on public.prescriptions
  for select using (
    customer_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.stores s where s.store_id = prescriptions.store_id and s.owner_id = auth.uid())
  );

drop policy if exists "prescriptions_customer_insert" on public.prescriptions;
create policy "prescriptions_customer_insert" on public.prescriptions
  for insert with check (customer_id = auth.uid());

drop policy if exists "prescriptions_store_review" on public.prescriptions;
create policy "prescriptions_store_review" on public.prescriptions
  for update using (
    exists (select 1 from public.stores s where s.store_id = prescriptions.store_id and s.owner_id = auth.uid())
    or public.is_admin()
  );

-- ----------------------------------------------------------------------------
-- 6. medicines RLS — allow store owners to contribute to the master catalog
--    (previously admin-only write). Update restricted to the row's creator
--    or admin, so one shop owner can't silently rewrite another's listing.
-- ----------------------------------------------------------------------------
drop policy if exists "medicines_admin_write" on public.medicines;

drop policy if exists "medicines_owner_insert" on public.medicines;
create policy "medicines_owner_insert" on public.medicines
  for insert with check (public.current_role() in ('store_owner', 'admin'));

drop policy if exists "medicines_owner_update" on public.medicines;
create policy "medicines_owner_update" on public.medicines
  for update using (created_by = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------------------
-- 7. storage — private "prescriptions" bucket + RLS
--    Path convention: {store_id}/{order_id}/{filename} so we can check store
--    ownership straight from the object path without extra joins.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('prescriptions', 'prescriptions', false)
  on conflict (id) do nothing;

drop policy if exists "prescriptions_bucket_insert" on storage.objects;
create policy "prescriptions_bucket_insert" on storage.objects
  for insert with check (bucket_id = 'prescriptions' and auth.role() = 'authenticated');

drop policy if exists "prescriptions_bucket_select" on storage.objects;
create policy "prescriptions_bucket_select" on storage.objects
  for select using (
    bucket_id = 'prescriptions' and (
      owner = auth.uid()
      or public.is_admin()
      or exists (
        select 1 from public.stores s
        where s.store_id::text = (storage.foldername(name))[1]
          and s.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "prescriptions_bucket_delete" on storage.objects;
create policy "prescriptions_bucket_delete" on storage.objects
  for delete using (bucket_id = 'prescriptions' and owner = auth.uid());
