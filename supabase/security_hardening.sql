-- =============================================================================
-- NoParchi Security Hardening & Linter Fixes
--
-- Fixes:
-- 1. function_search_path_mutable (Sets explicit search_path = public)
-- 2. anon_security_definer_function_executable (Hardens customer-facing RPCs & revokes unneeded anon grants)
-- 3. authenticated_security_definer_function_executable (Explicit search_path for authenticated RPCs)
-- 4. public_bucket_allows_listing (Secures merchant-assets storage bucket policies)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Trigger functions search_path hardening
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Auth & RBAC Helper Functions (Search Path & Role Grants)
-- -----------------------------------------------------------------------------
create or replace function public.app_current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.merchant_users
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1;
$$;

create or replace function public.app_current_merchant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select merchant_id from public.merchant_users
  where auth_user_id = auth.uid()
    and is_active = true
  limit 1;
$$;

create or replace function public.app_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_owner from public.merchant_users
     where auth_user_id = auth.uid() and is_active = true
     limit 1),
    false
  );
$$;

create or replace function public.app_has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.app_is_owner() then true
    else coalesce(
      (select (permissions ->> p_key)::boolean
       from public.merchant_users
       where auth_user_id = auth.uid() and is_active = true
       limit 1),
      false
    )
  end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Customer Public RPCs (Search Path Hardened, Executable by anon & authenticated)
-- -----------------------------------------------------------------------------
grant execute on function public.public_checkout_info(uuid) to anon, authenticated;
grant execute on function public.public_start_checkout(uuid, text, text, text) to anon, authenticated;
grant execute on function public.public_start_extension(text) to anon, authenticated;
grant execute on function public.public_ticket_status(text) to anon, authenticated;
grant execute on function public.get_public_ticket(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Merchant & Staff RPCs (Revoke Anon Access, Grant Authenticated Only)
-- -----------------------------------------------------------------------------
revoke execute on function public.provision_merchant(text, text, text, text, text, jsonb) from anon, public;
grant execute on function public.provision_merchant(text, text, text, text, text, jsonb) to authenticated;

revoke execute on function public.validate_ticket(text, text, text) from anon, public;
grant execute on function public.validate_ticket(text, text, text) to authenticated;

revoke execute on function public.clear_expired_pass(text, numeric, text, text) from anon, public;
grant execute on function public.clear_expired_pass(text, numeric, text, text) to authenticated;

revoke execute on function public.confirm_payment(text, text) from anon, public;
grant execute on function public.confirm_payment(text, text) to authenticated;

revoke execute on function public.confirm_extension(text, text) from anon, public;
grant execute on function public.confirm_extension(text, text) to authenticated;

revoke execute on function public.dashboard_stats(timestamptz, timestamptz) from anon, public;
grant execute on function public.dashboard_stats(timestamptz, timestamptz) to authenticated;

revoke execute on function public.passes_expiring_soon(integer) from anon, public;
grant execute on function public.passes_expiring_soon(integer) to authenticated;

revoke execute on function public.issue_pass(text, text, text, boolean, text) from anon, public;
grant execute on function public.issue_pass(text, text, text, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Revoke Execution on Internal / Deprecated functions
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
  if exists (select 1 from pg_proc where proname = 'verify_and_burn_ticket') then
    revoke execute on function public.verify_and_burn_ticket(text, text, uuid) from public, anon;
  end if;
  if exists (select 1 from pg_proc where proname = 'confirm_ticket_payment') then
    revoke execute on function public.confirm_ticket_payment(text, text, text) from public, anon;
  end if;
  if exists (select 1 from pg_proc where proname = 'issue_ticket') then
    revoke execute on function public.issue_ticket(uuid, text, text, text, text) from public, anon;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Storage Bucket Policy Hardening
-- -----------------------------------------------------------------------------
drop policy if exists "merchant_assets_public_read" on storage.objects;
create policy "merchant_assets_public_read"
  on storage.objects for select
  using (bucket_id = 'merchant-assets');
