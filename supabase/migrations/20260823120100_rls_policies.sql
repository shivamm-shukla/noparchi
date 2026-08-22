-- =============================================================================
-- Row Level Security
--
-- The previous schema enabled RLS on nothing. Because the app ships the Supabase
-- anon key in the client bundle (which is correct and unavoidable - it is a
-- public key), RLS-off meant that key was effectively a full grant on every
-- table: any visitor could read every merchant's revenue ledger and staff list
-- straight from the browser console. The .eq('merchant_id', ...) filters in the
-- client were a convenience, never a boundary, because the client chooses its
-- own filter value.
--
-- From here, tenant isolation is enforced by the database. The client cannot
-- opt out of it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Identity helpers.
--
-- All of these are SECURITY DEFINER on purpose: they read merchant_users, and a
-- policy ON merchant_users that queried merchant_users through a normal
-- function would recurse infinitely. SECURITY DEFINER runs them with the
-- definer's rights, bypassing RLS, which breaks the cycle.
--
-- search_path is pinned on every one of them. Without that, a caller who can
-- create objects in a schema earlier on the search path could shadow the tables
-- these functions read and escalate through them.
-- -----------------------------------------------------------------------------

create or replace function public.app_current_user()
returns table (
  user_id     uuid,
  merchant_id uuid,
  is_owner    boolean,
  permissions jsonb
)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select mu.id, mu.merchant_id, mu.is_owner, mu.permissions
  from public.merchant_users mu
  where mu.auth_user_id = auth.uid()
    and mu.is_active
  limit 1;
$$;

create or replace function public.app_current_merchant_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select mu.merchant_id
  from public.merchant_users mu
  where mu.auth_user_id = auth.uid()
    and mu.is_active
  limit 1;
$$;

create or replace function public.app_current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select mu.id
  from public.merchant_users mu
  where mu.auth_user_id = auth.uid()
    and mu.is_active
  limit 1;
$$;

create or replace function public.app_is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select coalesce(
    (select mu.is_owner
     from public.merchant_users mu
     where mu.auth_user_id = auth.uid()
       and mu.is_active
     limit 1),
    false
  );
$$;

-- The single place that decides whether the caller holds a permission.
--
-- Owners are root and hold every permission implicitly, including ones added to
-- the registry after their account was created - otherwise a new toggle would
-- start out locked away from the only account that can grant it.
create or replace function public.app_has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select coalesce(
    (select case
              when mu.is_owner then true
              else coalesce((mu.permissions ->> p_key)::boolean, false)
            end
     from public.merchant_users mu
     where mu.auth_user_id = auth.uid()
       and mu.is_active
     limit 1),
    false
  );
$$;

revoke all on function public.app_current_user() from public, anon;
revoke all on function public.app_current_merchant_id() from public, anon;
revoke all on function public.app_current_user_id() from public, anon;
revoke all on function public.app_is_owner() from public, anon;
revoke all on function public.app_has_permission(text) from public, anon;
grant execute on function public.app_current_user() to authenticated;
grant execute on function public.app_current_merchant_id() to authenticated;
grant execute on function public.app_current_user_id() to authenticated;
grant execute on function public.app_is_owner() to authenticated;
grant execute on function public.app_has_permission(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere. Note there are deliberately NO policies for `anon`:
-- the customer-facing checkout and pass pages read through SECURITY DEFINER
-- RPCs that return only non-sensitive columns, so anonymous visitors never get
-- direct table access.
-- -----------------------------------------------------------------------------
alter table public.merchants          enable row level security;
alter table public.merchant_users     enable row level security;
alter table public.ticket_types       enable row level security;
alter table public.transactions       enable row level security;
alter table public.ticket_validations enable row level security;

-- Deliberately NOT using FORCE ROW LEVEL SECURITY.
--
-- FORCE would subject the table owner to these policies too. Every RPC below is
-- SECURITY DEFINER and runs as that owner, so FORCE would mean validate_ticket
-- could not read a pass on behalf of a gatekeeper who lacks can_view_ledger,
-- and could not insert into ticket_validations at all (there is no INSERT
-- policy - writes are meant to go through the RPC). The scanner would break for
-- exactly the staff it exists to serve.
--
-- Leaving FORCE off costs nothing: anon and authenticated are not the owner, so
-- they remain fully subject to RLS. Only postgres and service_role bypass it,
-- and both already hold unrestricted access by definition.

-- -----------------------------------------------------------------------------
-- Table grants.
--
-- Set explicitly rather than relying on Supabase's default privileges, so the
-- privilege surface is visible in this file. anon gets nothing at all: the
-- customer-facing pages read through SECURITY DEFINER RPCs, never tables.
-- -----------------------------------------------------------------------------
revoke all on public.merchants          from anon;
revoke all on public.merchant_users     from anon;
revoke all on public.ticket_types       from anon;
revoke all on public.transactions       from anon;
revoke all on public.ticket_validations from anon;

grant select on public.merchants          to authenticated;
grant select on public.merchant_users     to authenticated;
grant select on public.ticket_types       to authenticated;
grant select on public.transactions       to authenticated;
grant select on public.ticket_validations to authenticated;

-- Narrowed further by the policies below.
grant update on public.merchants      to authenticated;
grant update on public.merchant_users to authenticated;
grant insert, update, delete on public.ticket_types to authenticated;

-- transactions and ticket_validations are never written directly: issue_pass,
-- public_start_checkout, confirm_payment and validate_ticket are the only
-- writers, so that amount, status and payment verification cannot be set by a
-- client under any circumstance.

-- -----------------------------------------------------------------------------
-- merchants
-- -----------------------------------------------------------------------------
drop policy if exists merchants_select_own on public.merchants;
create policy merchants_select_own on public.merchants
  for select to authenticated
  using (id = public.app_current_merchant_id());

drop policy if exists merchants_update_own on public.merchants;
create policy merchants_update_own on public.merchants
  for update to authenticated
  using (id = public.app_current_merchant_id() and public.app_has_permission('can_edit_settings'))
  with check (id = public.app_current_merchant_id() and public.app_has_permission('can_edit_settings'));

-- No insert or delete policy: a merchant is created by the signup RPC, and
-- deleting a tenant is an out-of-band operation, not something the app can do.

-- -----------------------------------------------------------------------------
-- merchant_users
-- -----------------------------------------------------------------------------
drop policy if exists merchant_users_select_tenant on public.merchant_users;
create policy merchant_users_select_tenant on public.merchant_users
  for select to authenticated
  using (merchant_id = public.app_current_merchant_id());

-- Staff rows are written through the provision-staff Edge Function (it needs
-- the Auth admin API to create the login), so there is no INSERT policy. What
-- the app does need directly is permission editing and deactivation.
drop policy if exists merchant_users_update_by_manager on public.merchant_users;
create policy merchant_users_update_by_manager on public.merchant_users
  for update to authenticated
  using (
    merchant_id = public.app_current_merchant_id()
    and public.app_has_permission('can_manage_staff')
  )
  with check (
    merchant_id = public.app_current_merchant_id()
    and public.app_has_permission('can_manage_staff')
    -- Never let a manager promote anyone (including themselves) to owner.
    -- Ownership transfer is deliberately not an in-app operation.
    and is_owner = false
  );

-- -----------------------------------------------------------------------------
-- ticket_types
-- -----------------------------------------------------------------------------
drop policy if exists ticket_types_select_tenant on public.ticket_types;
create policy ticket_types_select_tenant on public.ticket_types
  for select to authenticated
  using (merchant_id = public.app_current_merchant_id());

drop policy if exists ticket_types_write_by_editor on public.ticket_types;
create policy ticket_types_write_by_editor on public.ticket_types
  for all to authenticated
  using (
    merchant_id = public.app_current_merchant_id()
    and public.app_has_permission('can_edit_settings')
  )
  with check (
    merchant_id = public.app_current_merchant_id()
    and public.app_has_permission('can_edit_settings')
  );

-- -----------------------------------------------------------------------------
-- transactions
--
-- Reading a transaction row means seeing what a customer paid, so SELECT is
-- gated on can_view_ledger. This is what makes the Ledger permission real: a
-- gatekeeper without it gets an empty result from the database itself, not a
-- hidden tab. The scanner does not need this - it goes through validate_ticket,
-- which is SECURITY DEFINER and returns only what a gatekeeper must see.
--
-- There is no INSERT or UPDATE policy at all. Passes are created and settled
-- exclusively through RPCs so that amount, status and payment verification can
-- never be set directly by a client.
-- -----------------------------------------------------------------------------
drop policy if exists transactions_select_ledger on public.transactions;
create policy transactions_select_ledger on public.transactions
  for select to authenticated
  using (
    merchant_id = public.app_current_merchant_id()
    and public.app_has_permission('can_view_ledger')
  );

-- -----------------------------------------------------------------------------
-- ticket_validations
--
-- Scan history is operational, not financial, so any active staff member of the
-- tenant may read it - a gatekeeper needs to see their own scan count. Writes
-- happen only inside validate_ticket.
-- -----------------------------------------------------------------------------
drop policy if exists ticket_validations_select_tenant on public.ticket_validations;
create policy ticket_validations_select_tenant on public.ticket_validations
  for select to authenticated
  using (merchant_id = public.app_current_merchant_id());
