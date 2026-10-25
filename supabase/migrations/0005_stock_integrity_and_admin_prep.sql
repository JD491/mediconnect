-- ============================================================================
-- MediConnect — Phase 2 fix + Phase 3 prep
-- 1. Closes a data-integrity gap: customers can't write to `stock` (by design,
--    RLS restricts stock writes to the owning store/admin), so nothing was
--    actually decrementing stock when an order was placed. This adds a
--    row-locked, security-definer trigger that decrements stock atomically on
--    order_items insert and rejects the insert if there isn't enough stock —
--    closing the "no ordering beyond stock" requirement server-side, not just
--    client-side. A matching trigger restocks items if an order is cancelled.
-- 2. Adds 'suspended' to approval_status so admin can suspend an already-
--    approved store/doctor (distinct from rejecting a pending application).
-- 3. Closes two privilege-escalation gaps found while building the Admin
--    module: `profiles_update_own` let any user rewrite their own `role` or
--    `status` column (e.g. customer -> admin), and `stores_owner_update` /
--    `doctors_self_update` let an owner/doctor silently self-approve their
--    own pending application. Both are fixed with BEFORE UPDATE triggers that
--    revert those specific columns unless the actor is admin — RLS alone
--    can't do column-level restriction, so this is enforced at the DB layer
--    per section 38 ("important permissions must also be enforced at the
--    database/backend level").
--
-- IDEMPOTENT — every statement is safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. approval_status: add 'suspended'
-- ----------------------------------------------------------------------------
alter type approval_status add value if not exists 'suspended';

-- ----------------------------------------------------------------------------
-- 2. Atomic stock decrement on order_items insert
-- ----------------------------------------------------------------------------
create or replace function public.decrement_stock_on_order_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  available integer;
begin
  select quantity into available from public.stock where stock_id = new.stock_id for update;

  if available is null then
    raise exception 'Stock row % not found for this order item', new.stock_id;
  end if;

  if available < new.quantity then
    raise exception 'Insufficient stock (available %, requested %)', available, new.quantity;
  end if;

  update public.stock
    set quantity = quantity - new.quantity, updated_at = now()
    where stock_id = new.stock_id;

  return new;
end;
$$;

drop trigger if exists trg_decrement_stock_on_order_item on public.order_items;
create trigger trg_decrement_stock_on_order_item
  after insert on public.order_items
  for each row execute function public.decrement_stock_on_order_item();

-- ----------------------------------------------------------------------------
-- 3. Restock on order cancellation
-- ----------------------------------------------------------------------------
create or replace function public.restock_on_order_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.stock s
      set quantity = s.quantity + oi.quantity, updated_at = now()
      from public.order_items oi
      where oi.order_id = new.order_id and s.stock_id = oi.stock_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restock_on_order_cancel on public.orders;
create trigger trg_restock_on_order_cancel
  after update on public.orders
  for each row execute function public.restock_on_order_cancel();

-- ----------------------------------------------------------------------------
-- 4. profiles — admin can update any profile (role changes, suspend/activate)
-- ----------------------------------------------------------------------------
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. Anti-privilege-escalation triggers
-- ----------------------------------------------------------------------------
create or replace function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_role_escalation on public.profiles;
create trigger trg_prevent_self_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_role_escalation();

create or replace function public.prevent_self_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() and new.approval_status is distinct from old.approval_status then
    new.approval_status := old.approval_status;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_store_self_approval on public.stores;
create trigger trg_prevent_store_self_approval
  before update on public.stores
  for each row execute function public.prevent_self_approval();

drop trigger if exists trg_prevent_doctor_self_approval on public.doctors;
create trigger trg_prevent_doctor_self_approval
  before update on public.doctors
  for each row execute function public.prevent_self_approval();
