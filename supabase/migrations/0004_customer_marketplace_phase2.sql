-- ============================================================================
-- MediConnect — Phase 2: Customer Marketplace
-- Adds: wishlists, cart "save for later", order payment-status + invoice
-- header fields (customer name/phone captured at checkout so an order/invoice
-- is a stable snapshot even if the profile changes later).
--
-- IDEMPOTENT — every statement is safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. wishlists
-- ----------------------------------------------------------------------------
create table if not exists public.wishlists (
  wishlist_id  bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  medicine_id  bigint not null references public.medicines(medicine_id) on delete cascade,
  created_at   timestamptz not null default now(),
  unique (user_id, medicine_id)
);

alter table public.wishlists enable row level security;

drop policy if exists "wishlists_owner_all" on public.wishlists;
create policy "wishlists_owner_all" on public.wishlists
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 2. cart_items — "save for later"
-- ----------------------------------------------------------------------------
alter table public.cart_items add column if not exists saved_for_later boolean not null default false;

-- ----------------------------------------------------------------------------
-- 3. orders — payment status + invoice snapshot fields
-- ----------------------------------------------------------------------------
alter table public.orders
  add column if not exists payment_status  text not null default 'pending', -- pending | paid | failed
  add column if not exists delivery_fee    numeric(10,2) not null default 0 check (delivery_fee >= 0),
  add column if not exists customer_name   text,
  add column if not exists customer_phone  text;
