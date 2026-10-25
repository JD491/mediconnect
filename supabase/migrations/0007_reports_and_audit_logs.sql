-- ============================================================================
-- MediConnect — Phase 5: Reports & Oversight
--
-- Also fixes another real gap found while building admin Reviews moderation:
-- `reviews` had a public-read and an insert-own policy, but NO update or
-- delete policy at all — meaning nobody, not even admin, could actually
-- remove an inappropriate review despite section 14 explicitly requiring
-- "Report inappropriate reviews". Adds delete for the review's author or
-- admin.
--
-- IDEMPOTENT — every statement is safe to re-run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. reviews — allow the author or admin to delete
-- ----------------------------------------------------------------------------
drop policy if exists "reviews_delete" on public.reviews;
create policy "reviews_delete" on public.reviews
  for delete using (user_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. audit_logs — admin-readable trail of sensitive state changes
-- ----------------------------------------------------------------------------
create table if not exists public.audit_logs (
  log_id      bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id),
  action      text not null,
  entity_type text not null,
  entity_id   text not null,
  details     jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists "audit_logs_admin_read" on public.audit_logs;
create policy "audit_logs_admin_read" on public.audit_logs
  for select using (public.is_admin());

-- No client insert policy at all — rows are only ever written by the
-- SECURITY DEFINER trigger functions below, which bypass RLS entirely.

create or replace function public.write_audit_log(p_action text, p_entity_type text, p_entity_id text, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_details);
end;
$$;

create or replace function public.audit_store_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.approval_status is distinct from old.approval_status then
    perform public.write_audit_log('approval_status_change', 'store', new.store_id::text,
      jsonb_build_object('store_name', new.store_name, 'from', old.approval_status, 'to', new.approval_status));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_store_approval on public.stores;
create trigger trg_audit_store_approval
  after update on public.stores
  for each row execute function public.audit_store_approval();

create or replace function public.audit_doctor_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.approval_status is distinct from old.approval_status then
    perform public.write_audit_log('approval_status_change', 'doctor', new.doctor_id::text,
      jsonb_build_object('from', old.approval_status, 'to', new.approval_status));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_doctor_approval on public.doctors;
create trigger trg_audit_doctor_approval
  after update on public.doctors
  for each row execute function public.audit_doctor_approval();

create or replace function public.audit_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role or new.status is distinct from old.status then
    perform public.write_audit_log('role_or_status_change', 'profile', new.id::text,
      jsonb_build_object('name', new.name, 'role_from', old.role, 'role_to', new.role, 'status_from', old.status, 'status_to', new.status));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_profile_change on public.profiles;
create trigger trg_audit_profile_change
  after update on public.profiles
  for each row execute function public.audit_profile_change();

create or replace function public.audit_medicine_toggle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_active is distinct from old.is_active then
    perform public.write_audit_log(
      case when new.is_active then 'medicine_enabled' else 'medicine_disabled' end,
      'medicine', new.medicine_id::text, jsonb_build_object('name', new.name));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_medicine_toggle on public.medicines;
create trigger trg_audit_medicine_toggle
  after update on public.medicines
  for each row execute function public.audit_medicine_toggle();
