-- =============================================================================
-- NoParchi core schema
--
-- This replaces the previous supabase/schema.sql and prisma/schema.prisma pair.
-- Those two had already drifted from each other (flatRate defaulted to 30 in
-- one and 40 in the other, amount was Float in one and NUMERIC in the other),
-- which is the failure mode of keeping two sources of truth. Migrations in this
-- directory are now the only source of truth for the database.
--
-- Two deliberate departures from the previous schema:
--
-- 1. snake_case columns, not quoted camelCase. The old schema quoted "isOwner"
--    and "merchantId", which meant PL/pgSQL - where unquoted identifiers fold
--    to lowercase - could not read them. That is why validate_ticket_atomic
--    raised on every call. It also breaks Realtime column filters. snake_case
--    removes the entire bug class rather than working around it.
--
-- 2. Status and ticket type are data, not Postgres ENUMs. Adding a value to an
--    ENUM needs a migration and a coordinated deploy; a CHECK constraint and a
--    per-merchant ticket_types table do not.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- merchants: the tenant root. Every other table hangs off this.
-- -----------------------------------------------------------------------------
create table if not exists public.merchants (
  id                 uuid primary key default gen_random_uuid(),
  business_name      text        not null check (length(trim(business_name)) > 0),
  location           text        not null default '',
  upi_id             text        not null default '',
  currency           text        not null default 'INR',

  -- Which adapter this merchant's checkout and pass delivery use. Kept as text
  -- so adding a provider is a code change only, never a migration.
  payment_provider   text        not null default 'upi_intent',
  messaging_provider text        not null default 'wa_deeplink',

  -- Branding and any future non-critical knobs (logo url, welcome message,
  -- theme colour). Non-critical settings live here precisely so that adding one
  -- does not require a migration.
  settings           jsonb       not null default '{}'::jsonb,

  is_active          boolean     not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger merchants_set_updated_at
  before update on public.merchants
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- merchant_users: owners and gatekeeper staff.
--
-- auth_user_id links to Supabase Auth. It is nullable only for the window
-- between creating the row and provisioning the auth account; every usable
-- account has one, because RLS resolves the tenant through auth.uid().
-- -----------------------------------------------------------------------------
create table if not exists public.merchant_users (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete set null,

  is_owner     boolean not null default false,
  name         text    not null check (length(trim(name)) > 0),
  phone        text    not null,

  -- Dynamic RBAC. One JSONB column rather than a boolean column per permission,
  -- so a new toggle never needs a migration. Keys are defined in
  -- src/config/permissions.ts; missing keys resolve to their staff default.
  -- Owners bypass this entirely (see app_has_permission below).
  permissions  jsonb   not null default '{}'::jsonb,

  is_active    boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- Phone is unique per tenant, NOT globally. A global unique constraint - as
  -- the previous schema had - means two different businesses can never employ
  -- people who share a number, and leaks the existence of other tenants' staff.
  constraint merchant_users_phone_per_merchant unique (merchant_id, phone)
);

create index if not exists merchant_users_merchant_idx on public.merchant_users (merchant_id);
create index if not exists merchant_users_auth_idx     on public.merchant_users (auth_user_id);

-- Exactly one owner per merchant.
create unique index if not exists merchant_users_single_owner_idx
  on public.merchant_users (merchant_id)
  where is_owner;

create trigger merchant_users_set_updated_at
  before update on public.merchant_users
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- ticket_types: pricing as data.
--
-- Previously a hardcoded Postgres ENUM (TWO_WHEELER, FOUR_WHEELER, ...) plus a
-- rate ladder copy-pasted into three components. An owner can now add "Cycle"
-- or "VIP Pass" from Settings with no migration and no app release.
-- -----------------------------------------------------------------------------
create table if not exists public.ticket_types (
  id          uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,

  code        text not null check (code ~ '^[A-Z0-9_]{2,32}$'),
  label       text not null check (length(trim(label)) > 0),
  icon        text not null default 'ticket',
  amount      numeric(10,2) not null check (amount >= 0),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint ticket_types_code_per_merchant unique (merchant_id, code)
);

create index if not exists ticket_types_merchant_idx
  on public.ticket_types (merchant_id, sort_order) where is_active;

create trigger ticket_types_set_updated_at
  before update on public.ticket_types
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- transactions: one issued pass.
-- -----------------------------------------------------------------------------
create table if not exists public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  merchant_id        uuid not null references public.merchants(id) on delete cascade,

  -- The type is referenced for reporting, but its label and amount are also
  -- snapshotted onto the row. A pass issued last month must keep showing the
  -- price the customer actually paid even after the owner edits the rate.
  ticket_type_id     uuid references public.ticket_types(id) on delete set null,
  ticket_type_code   text not null,
  ticket_type_label  text not null,

  amount             numeric(10,2) not null check (amount >= 0),
  vehicle_number     text,
  customer_phone     text,

  -- pending  : created, payment not yet confirmed. NOT a valid pass.
  -- paid     : payment confirmed. The only status the scanner will clear.
  -- failed / refunded / expired : terminal, never scannable.
  status             text not null default 'pending'
                     check (status in ('pending', 'paid', 'failed', 'refunded', 'expired')),

  payment_provider   text not null default 'upi_intent',
  payment_ref        text,
  -- Set only by a verified payment path (gateway webhook, or an explicit
  -- gatekeeper confirmation). A customer tapping "I have paid" must never set
  -- this - that was how the previous checkout minted free valid tickets.
  payment_verified_at timestamptz,
  payment_verified_by uuid references public.merchant_users(id) on delete set null,

  -- Null when the customer self-served through the QR checkout.
  issued_by_user_id  uuid references public.merchant_users(id) on delete set null,

  -- The QR payload. Globally unique because it is a random token, not a
  -- per-tenant sequence.
  ticket_code        text not null unique,
  expires_at         timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Payment references are unique within a tenant, not globally: two merchants
  -- on different gateways can legitimately be handed the same reference string.
  constraint transactions_payment_ref_per_merchant unique (merchant_id, payment_ref)
);

create index if not exists transactions_merchant_created_idx
  on public.transactions (merchant_id, created_at desc);
create index if not exists transactions_ticket_code_idx
  on public.transactions (ticket_code);
create index if not exists transactions_merchant_status_idx
  on public.transactions (merchant_id, status, created_at desc);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- ticket_validations: a pass being scanned at the exit gate.
--
-- The UNIQUE constraint on transaction_id is the anti-fraud primitive of this
-- entire product. It makes a second scan of the same pass impossible at the
-- database level, no matter what the application code does, and no matter how
-- many gatekeepers scan at the same instant. Do not remove it, and do not
-- replace it with an application-level check.
-- -----------------------------------------------------------------------------
create table if not exists public.ticket_validations (
  id                 uuid primary key default gen_random_uuid(),
  transaction_id     uuid not null unique references public.transactions(id) on delete cascade,

  -- Denormalised from the transaction so that RLS can filter without a join on
  -- every single scan. Kept honest by the validate_ticket RPC, which is the
  -- only writer.
  merchant_id        uuid not null references public.merchants(id) on delete cascade,

  scanned_by_user_id uuid not null references public.merchant_users(id) on delete restrict,
  exit_gate          text not null default 'Main Exit',
  notes              text,
  scanned_at         timestamptz not null default now()
);

create index if not exists ticket_validations_merchant_scanned_idx
  on public.ticket_validations (merchant_id, scanned_at desc);
create index if not exists ticket_validations_scanned_by_idx
  on public.ticket_validations (scanned_by_user_id);

-- -----------------------------------------------------------------------------
-- Realtime. The previous code subscribed to a channel filtered on a quoted
-- camelCase column and the tables were never added to the publication, so no
-- event could ever have fired.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.transactions;
    alter publication supabase_realtime add table public.ticket_validations;
  end if;
exception
  when duplicate_object then null;
end $$;
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
-- =============================================================================
-- Remote procedures
--
-- Everything that mutates money or pass state lives here rather than in client
-- code, for two reasons:
--
--   1. Atomicity. A PL/pgSQL function body runs inside a single transaction, so
--      "check the pass, then record the scan" cannot be interleaved by another
--      gatekeeper. The previous Edge Function did that check across three
--      separate network round-trips with no transaction at all.
--
--   2. Trust. These functions derive the caller's identity from auth.uid(),
--      never from a value in the request body. The previous validate-ticket
--      function took scannedByUserId from the client, so anyone could claim to
--      be the owner.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ticket code generation.
--
-- Alphabet excludes I, O, 0, 1 so a gatekeeper reading a code aloud or typing
-- it manually cannot confuse characters.
-- -----------------------------------------------------------------------------
create or replace function public.generate_ticket_code()
returns text
language plpgsql
volatile
set search_path = public, pg_temp
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempt integer := 0;
begin
  loop
    v_code := 'NP-';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    v_code := v_code || '-';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from public.transactions t where t.ticket_code = v_code);

    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'Could not generate a unique ticket code after % attempts', v_attempt;
    end if;
  end loop;

  return v_code;
end;
$$;

-- =============================================================================
-- validate_ticket: the anti-fraud core.
--
-- Called once per scan. Returns a JSON result rather than raising, because the
-- gatekeeper needs a red modal, not a stack trace - but note that unexpected
-- errors are deliberately NOT caught. The previous version wrapped its whole
-- body in `exception when others then return ... 'INVALID'`, which turned a
-- crash (it could not read its own camelCase columns) into a plausible-looking
-- rejection of every valid pass. Only the specific, expected race is handled.
-- =============================================================================
create or replace function public.validate_ticket(
  p_ticket_code text,
  p_exit_gate   text default 'Main Exit',
  p_notes       text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id       uuid;
  v_merchant_id   uuid;
  v_can_verify    boolean;
  v_tx            public.transactions%rowtype;
  v_existing      public.ticket_validations%rowtype;
  v_scanned_by    text;
  v_new           public.ticket_validations%rowtype;
  v_code          text;
begin
  -- 1. Who is scanning? Resolved from the JWT, never from an argument.
  select mu.id, mu.merchant_id,
         case when mu.is_owner then true
              else coalesce((mu.permissions ->> 'can_verify_tickets')::boolean, false) end
    into v_user_id, v_merchant_id, v_can_verify
  from public.merchant_users mu
  where mu.auth_user_id = auth.uid()
    and mu.is_active
  limit 1;

  if v_user_id is null then
    return jsonb_build_object(
      'success', false, 'status', 'UNAUTHORIZED',
      'message', 'Not signed in as an active staff member.');
  end if;

  if not v_can_verify then
    return jsonb_build_object(
      'success', false, 'status', 'UNAUTHORIZED',
      'message', 'You do not have permission to verify exit passes. Ask the owner to enable it.');
  end if;

  -- 2. Accept either a bare code or the JSON payload the QR actually encodes.
  v_code := trim(p_ticket_code);
  if v_code like '{%}' then
    begin
      v_code := coalesce(v_code::jsonb ->> 'ticketCode', v_code);
    exception when others then
      -- Malformed JSON in a QR is a scan of something that is not our pass,
      -- not a server fault: fall through and treat the raw string as a code.
      null;
    end;
  end if;
  v_code := upper(v_code);

  -- 3. Lock the pass row.
  --
  -- Scoped to the scanner's own merchant in the WHERE clause rather than
  -- checked after the fact, so a pass belonging to another tenant is simply
  -- not found - it never gets read or locked. FOR UPDATE serialises two
  -- gatekeepers scanning the same pass in the same instant: the second one
  -- blocks here until the first has committed its validation row.
  select * into v_tx
  from public.transactions t
  where upper(t.ticket_code) = v_code
    and t.merchant_id = v_merchant_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false, 'status', 'INVALID',
      'message', 'Invalid pass. This QR is not recognised at this location.');
  end if;

  -- 4. An unpaid pass is not a pass.
  --
  -- The customer checkout creates rows as 'pending' and only a verified payment
  -- promotes them to 'paid'. This branch is what stops someone walking up,
  -- generating a pass, skipping payment and showing it at the gate.
  if v_tx.status <> 'paid' then
    return jsonb_build_object(
      'success', false,
      'status',  case when v_tx.status = 'pending' then 'UNPAID' else 'INVALID' end,
      'message', case
                   when v_tx.status = 'pending'  then 'Payment not confirmed for this pass. Do not allow exit.'
                   when v_tx.status = 'refunded' then 'This pass was refunded and is no longer valid.'
                   when v_tx.status = 'expired'  then 'This pass has expired.'
                   else 'This pass is not valid.'
                 end,
      'ticket', to_jsonb(v_tx));
  end if;

  if v_tx.expires_at is not null and v_tx.expires_at < now() then
    return jsonb_build_object(
      'success', false, 'status', 'INVALID',
      'message', 'This pass expired on ' || to_char(v_tx.expires_at, 'DD Mon, HH12:MI AM') || '.',
      'ticket', to_jsonb(v_tx));
  end if;

  -- 5. Already used?
  select * into v_existing
  from public.ticket_validations tv
  where tv.transaction_id = v_tx.id;

  if found then
    select mu.name into v_scanned_by
    from public.merchant_users mu
    where mu.id = v_existing.scanned_by_user_id;

    return jsonb_build_object(
      'success', false, 'status', 'ALREADY_USED',
      'message', 'Already used at ' || to_char(v_existing.scanned_at, 'HH12:MI AM')
                 || ' by ' || coalesce(v_scanned_by, 'another gatekeeper')
                 || ' (' || v_existing.exit_gate || ').',
      'ticket', to_jsonb(v_tx),
      -- The name is folded into the object rather than left only in the
      -- message, so the app can lay out who and where itself. A gatekeeper
      -- reading a refusal needs those two facts as facts, not as a sentence
      -- they have to parse in a queue.
      'validation', to_jsonb(v_existing)
                    || jsonb_build_object('scanned_by_name', v_scanned_by),
      'scannedAt', v_existing.scanned_at);
  end if;

  -- 6. Record the scan. The UNIQUE constraint on transaction_id is the real
  -- guarantee here; the check above is only for a friendlier message.
  insert into public.ticket_validations
    (transaction_id, merchant_id, scanned_by_user_id, exit_gate, notes)
  values
    (v_tx.id, v_merchant_id, v_user_id, coalesce(nullif(trim(p_exit_gate), ''), 'Main Exit'), p_notes)
  returning * into v_new;

  return jsonb_build_object(
    'success', true, 'status', 'VERIFIED',
    'message', 'Pass verified. Exit cleared.',
    'ticket', to_jsonb(v_tx),
    'validation', to_jsonb(v_new),
    'scannedAt', v_new.scanned_at);

exception
  -- The one race the row lock cannot cover: two sessions that both passed the
  -- existence check before either inserted. The loser lands here.
  when unique_violation then
    return jsonb_build_object(
      'success', false, 'status', 'ALREADY_USED',
      'message', 'Already used - another gatekeeper scanned this pass a moment ago.');
end;
$$;

revoke all on function public.validate_ticket(text, text, text) from public, anon;
grant execute on function public.validate_ticket(text, text, text) to authenticated;

-- =============================================================================
-- issue_pass: a gatekeeper issuing a pass at the gate (cash or UPI in person).
--
-- p_mark_paid exists because in the walk-up case the staff member has physically
-- seen the money arrive. That is a real verification by an accountable, named
-- user - recorded in payment_verified_by - which is categorically different
-- from a customer ticking "I have paid" about themselves.
-- =============================================================================
create or replace function public.issue_pass(
  p_ticket_type_code text,
  p_vehicle_number   text default null,
  p_customer_phone   text default null,
  p_mark_paid        boolean default true,
  p_payment_ref      text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id     uuid;
  v_merchant_id uuid;
  v_can_issue   boolean;
  v_type        public.ticket_types%rowtype;
  v_tx          public.transactions%rowtype;
begin
  select mu.id, mu.merchant_id,
         case when mu.is_owner then true
              else coalesce((mu.permissions ->> 'can_issue_passes')::boolean, false) end
    into v_user_id, v_merchant_id, v_can_issue
  from public.merchant_users mu
  where mu.auth_user_id = auth.uid() and mu.is_active
  limit 1;

  if v_user_id is null then
    return jsonb_build_object('success', false, 'status', 'UNAUTHORIZED',
      'message', 'Not signed in as an active staff member.');
  end if;

  if not v_can_issue then
    return jsonb_build_object('success', false, 'status', 'UNAUTHORIZED',
      'message', 'You do not have permission to issue passes.');
  end if;

  select * into v_type
  from public.ticket_types tt
  where tt.merchant_id = v_merchant_id
    and tt.code = upper(trim(p_ticket_type_code))
    and tt.is_active;

  if not found then
    return jsonb_build_object('success', false, 'status', 'INVALID',
      'message', 'Unknown or inactive ticket type: ' || coalesce(p_ticket_type_code, '(none)'));
  end if;

  -- Label and amount are snapshotted onto the transaction so that editing the
  -- rate later never rewrites what a past customer was charged.
  insert into public.transactions (
    merchant_id, ticket_type_id, ticket_type_code, ticket_type_label,
    amount, vehicle_number, customer_phone,
    status, payment_provider, payment_ref,
    payment_verified_at, payment_verified_by,
    issued_by_user_id, ticket_code
  ) values (
    v_merchant_id, v_type.id, v_type.code, v_type.label,
    v_type.amount,
    nullif(upper(trim(coalesce(p_vehicle_number, ''))), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    case when p_mark_paid then 'paid' else 'pending' end,
    'counter',
    nullif(trim(coalesce(p_payment_ref, '')), ''),
    case when p_mark_paid then now() else null end,
    case when p_mark_paid then v_user_id else null end,
    v_user_id, public.generate_ticket_code()
  )
  returning * into v_tx;

  return jsonb_build_object('success', true, 'status', 'ISSUED', 'ticket', to_jsonb(v_tx));
end;
$$;

revoke all on function public.issue_pass(text, text, text, boolean, text) from public, anon;
grant execute on function public.issue_pass(text, text, text, boolean, text) to authenticated;

-- =============================================================================
-- confirm_payment: promote a pending customer-checkout pass to paid.
--
-- Used by the UPI deep-link flow, where no gateway webhook exists to confirm
-- receipt. A named staff member asserts the money arrived; that assertion is
-- recorded against them so the ledger stays auditable.
-- =============================================================================
create or replace function public.confirm_payment(
  p_ticket_code text,
  p_payment_ref text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id     uuid;
  v_merchant_id uuid;
  v_can_issue   boolean;
  v_tx          public.transactions%rowtype;
begin
  select mu.id, mu.merchant_id,
         case when mu.is_owner then true
              else coalesce((mu.permissions ->> 'can_issue_passes')::boolean, false) end
    into v_user_id, v_merchant_id, v_can_issue
  from public.merchant_users mu
  where mu.auth_user_id = auth.uid() and mu.is_active
  limit 1;

  if v_user_id is null or not v_can_issue then
    return jsonb_build_object('success', false, 'status', 'UNAUTHORIZED',
      'message', 'You do not have permission to confirm payments.');
  end if;

  select * into v_tx
  from public.transactions t
  where upper(t.ticket_code) = upper(trim(p_ticket_code))
    and t.merchant_id = v_merchant_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'INVALID',
      'message', 'No such pass at this location.');
  end if;

  if v_tx.status = 'paid' then
    return jsonb_build_object('success', true, 'status', 'ALREADY_PAID',
      'message', 'This pass was already confirmed.', 'ticket', to_jsonb(v_tx));
  end if;

  if v_tx.status <> 'pending' then
    return jsonb_build_object('success', false, 'status', 'INVALID',
      'message', 'A ' || v_tx.status || ' pass cannot be confirmed.');
  end if;

  update public.transactions
     set status = 'paid',
         payment_ref = coalesce(nullif(trim(coalesce(p_payment_ref, '')), ''), payment_ref),
         payment_verified_at = now(),
         payment_verified_by = v_user_id
   where id = v_tx.id
  returning * into v_tx;

  return jsonb_build_object('success', true, 'status', 'CONFIRMED',
    'message', 'Payment confirmed. Pass is now valid.', 'ticket', to_jsonb(v_tx));
end;
$$;

revoke all on function public.confirm_payment(text, text) from public, anon;
grant execute on function public.confirm_payment(text, text) to authenticated;
-- =============================================================================
-- Customer-facing (anonymous) procedures, reporting, and tenant provisioning.
--
-- The app-less customer flow has no login, so it cannot use RLS-protected
-- tables. Instead of opening those tables to `anon` - which would expose every
-- merchant's ledger - the three functions below are the entire anonymous
-- surface area. Each is SECURITY DEFINER and returns only fields a stranger
-- standing at the gate is allowed to see.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- What the customer needs to render the checkout page for one merchant.
--
-- This is what makes /pay/[merchantId] genuinely multi-tenant: the page loads
-- the merchant named in its own URL. Previously it read the app's hardcoded
-- merchant from context and ignored the route parameter entirely, so every
-- merchant's gate QR led to the same business at the same prices.
-- -----------------------------------------------------------------------------
create or replace function public.public_checkout_info(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_m     public.merchants%rowtype;
  v_types jsonb;
begin
  select * into v_m
  from public.merchants m
  where m.id = p_merchant_id and m.is_active;

  if not found then
    return jsonb_build_object('success', false, 'message', 'This gate QR is not active.');
  end if;

  select coalesce(jsonb_agg(t order by t.sort_order), '[]'::jsonb) into v_types
  from (
    select tt.code, tt.label, tt.icon, tt.amount, tt.sort_order
    from public.ticket_types tt
    where tt.merchant_id = p_merchant_id and tt.is_active
  ) t;

  -- Note what is NOT returned: no staff, no transactions, no settings blob.
  -- upi_id is included because the customer must pay into it.
  return jsonb_build_object(
    'success', true,
    'merchant', jsonb_build_object(
      'id',               v_m.id,
      'businessName',     v_m.business_name,
      'location',         v_m.location,
      'upiId',            v_m.upi_id,
      'currency',         v_m.currency,
      'paymentProvider',  v_m.payment_provider,
      'messagingProvider',v_m.messaging_provider,
      'branding',         coalesce(v_m.settings -> 'branding', '{}'::jsonb)
    ),
    'ticketTypes', v_types
  );
end;
$$;

grant execute on function public.public_checkout_info(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Start a checkout.
--
-- Creates the pass as 'pending' and nothing more. A pending pass is explicitly
-- rejected by validate_ticket, so it cannot get anyone through the gate. It
-- becomes 'paid' only via a gateway webhook or an accountable staff member
-- calling confirm_payment. The amount is read from the merchant's own ticket
-- type row and never taken from the request, so the customer cannot price their
-- own ticket.
-- -----------------------------------------------------------------------------
create or replace function public.public_start_checkout(
  p_merchant_id      uuid,
  p_ticket_type_code text,
  p_vehicle_number   text default null,
  p_customer_phone   text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_m       public.merchants%rowtype;
  v_type    public.ticket_types%rowtype;
  v_tx      public.transactions%rowtype;
  v_pending integer;
begin
  select * into v_m from public.merchants m where m.id = p_merchant_id and m.is_active;
  if not found then
    return jsonb_build_object('success', false, 'message', 'This gate QR is not active.');
  end if;

  -- Cheap abuse guard. This endpoint is unauthenticated by necessity, so a
  -- script could otherwise fill the table with junk pending rows. A real venue
  -- will never approach this rate; an attacker hits it immediately.
  select count(*) into v_pending
  from public.transactions t
  where t.merchant_id = p_merchant_id
    and t.status = 'pending'
    and t.created_at > now() - interval '5 minutes';

  if v_pending > 200 then
    return jsonb_build_object('success', false,
      'message', 'Too many checkouts in progress at this gate. Please try again shortly.');
  end if;

  select * into v_type
  from public.ticket_types tt
  where tt.merchant_id = p_merchant_id
    and tt.code = upper(trim(p_ticket_type_code))
    and tt.is_active;

  if not found then
    return jsonb_build_object('success', false, 'message', 'That pass type is not available here.');
  end if;

  insert into public.transactions (
    merchant_id, ticket_type_id, ticket_type_code, ticket_type_label,
    amount, vehicle_number, customer_phone,
    status, payment_provider, ticket_code
  ) values (
    p_merchant_id, v_type.id, v_type.code, v_type.label,
    v_type.amount,
    nullif(upper(trim(coalesce(p_vehicle_number, ''))), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    'pending', v_m.payment_provider, public.generate_ticket_code()
  )
  returning * into v_tx;

  return jsonb_build_object(
    'success', true,
    'ticketCode', v_tx.ticket_code,
    'amount',     v_tx.amount,
    'status',     v_tx.status,
    'ticketTypeLabel', v_tx.ticket_type_label,
    'merchant', jsonb_build_object(
      'id', v_m.id, 'businessName', v_m.business_name,
      'location', v_m.location, 'upiId', v_m.upi_id)
  );
end;
$$;

grant execute on function public.public_start_checkout(uuid, text, text, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- The customer's own pass page, /ticket/[ticketCode].
--
-- Previously this looked the pass up in the merchant app's in-memory context,
-- so on a customer's phone it always missed and rendered placeholder values.
-- Ticket codes are 8 characters from a 32-symbol alphabet (~1.1e12 space), so
-- they are not practically enumerable, and only non-sensitive fields are
-- returned regardless.
-- -----------------------------------------------------------------------------
create or replace function public.public_ticket_status(p_ticket_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx   public.transactions%rowtype;
  v_m    public.merchants%rowtype;
  v_val  public.ticket_validations%rowtype;
begin
  select * into v_tx
  from public.transactions t
  where upper(t.ticket_code) = upper(trim(p_ticket_code));

  if not found then
    return jsonb_build_object('success', false, 'message', 'Pass not found.');
  end if;

  select * into v_m from public.merchants m where m.id = v_tx.merchant_id;
  select * into v_val from public.ticket_validations tv where tv.transaction_id = v_tx.id;

  return jsonb_build_object(
    'success', true,
    'ticket', jsonb_build_object(
      'ticketCode',   v_tx.ticket_code,
      'status',       v_tx.status,
      'amount',       v_tx.amount,
      'typeLabel',    v_tx.ticket_type_label,
      'vehicleNumber',v_tx.vehicle_number,
      'issuedAt',     v_tx.created_at,
      'expiresAt',    v_tx.expires_at,
      'isUsed',       v_val.id is not null,
      'usedAt',       v_val.scanned_at
    ),
    'merchant', jsonb_build_object(
      'id', v_m.id, 'businessName', v_m.business_name, 'location', v_m.location)
  );
end;
$$;

grant execute on function public.public_ticket_status(text) to anon, authenticated;

-- =============================================================================
-- Reporting
-- =============================================================================

-- Aggregated in the database rather than by fetching every row and reducing in
-- JavaScript, which is what the previous dashboard did. Revenue figures are
-- withheld from staff who lack can_view_ledger; scan counts are not, because a
-- gatekeeper is expected to see their own throughput.
create or replace function public.dashboard_stats(
  p_from timestamptz default date_trunc('day', now()),
  p_to   timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_merchant_id uuid;
  v_user_id     uuid;
  v_can_ledger  boolean;
  v_prev_from   timestamptz;
  v_revenue     numeric := 0;
  v_prev_rev    numeric := 0;
  v_issued      integer := 0;
  v_scans       integer := 0;
  v_my_scans    integer := 0;
  v_open        integer := 0;
  v_pending     integer := 0;
  v_growth      numeric := 0;
begin
  select mu.id, mu.merchant_id,
         case when mu.is_owner then true
              else coalesce((mu.permissions ->> 'can_view_ledger')::boolean, false) end
    into v_user_id, v_merchant_id, v_can_ledger
  from public.merchant_users mu
  where mu.auth_user_id = auth.uid() and mu.is_active
  limit 1;

  if v_merchant_id is null then
    return jsonb_build_object('success', false, 'message', 'Not signed in.');
  end if;

  v_prev_from := p_from - (p_to - p_from);

  select coalesce(sum(t.amount) filter (where t.status = 'paid'), 0),
         count(*) filter (where t.status = 'paid'),
         count(*) filter (where t.status = 'pending')
    into v_revenue, v_issued, v_pending
  from public.transactions t
  where t.merchant_id = v_merchant_id
    and t.created_at >= p_from and t.created_at < p_to;

  select coalesce(sum(t.amount) filter (where t.status = 'paid'), 0)
    into v_prev_rev
  from public.transactions t
  where t.merchant_id = v_merchant_id
    and t.created_at >= v_prev_from and t.created_at < p_from;

  select count(*), count(*) filter (where tv.scanned_by_user_id = v_user_id)
    into v_scans, v_my_scans
  from public.ticket_validations tv
  where tv.merchant_id = v_merchant_id
    and tv.scanned_at >= p_from and tv.scanned_at < p_to;

  -- Passes paid for but not yet scanned out: vehicles still inside.
  select count(*) into v_open
  from public.transactions t
  left join public.ticket_validations tv on tv.transaction_id = t.id
  where t.merchant_id = v_merchant_id
    and t.status = 'paid'
    and tv.id is null;

  if v_prev_rev > 0 then
    v_growth := round(((v_revenue - v_prev_rev) / v_prev_rev) * 100);
  elsif v_revenue > 0 then
    v_growth := 100;
  end if;

  return jsonb_build_object(
    'success', true,
    'canViewRevenue', v_can_ledger,
    'revenue',        case when v_can_ledger then v_revenue else null end,
    'previousRevenue',case when v_can_ledger then v_prev_rev else null end,
    'growthPercent',  case when v_can_ledger then v_growth else null end,
    'passesIssued',   case when v_can_ledger then v_issued else null end,
    'pendingPayments',case when v_can_ledger then v_pending else null end,
    'scans',          v_scans,
    'myScans',        v_my_scans,
    'openPasses',     v_open,
    'from',           p_from,
    'to',             p_to
  );
end;
$$;

revoke all on function public.dashboard_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.dashboard_stats(timestamptz, timestamptz) to authenticated;

-- =============================================================================
-- Tenant provisioning
--
-- Run once, immediately after an owner signs up through Supabase Auth. Creates
-- the merchant, links the caller as its owner, and seeds ticket types.
--
-- The starter ticket types are passed IN as JSON rather than hardcoded here, so
-- src/config/pricing.ts stays the single place that defines them - duplicating
-- that list into SQL is how the old schema ended up disagreeing with the app
-- about the flat rate.
-- =============================================================================
create or replace function public.provision_merchant(
  p_business_name text,
  p_owner_name    text,
  p_phone         text,
  p_location      text default '',
  p_upi_id        text default '',
  p_ticket_types  jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_auth_id     uuid := auth.uid();
  v_merchant_id uuid;
  v_existing    uuid;
  v_type        jsonb;
begin
  if v_auth_id is null then
    return jsonb_build_object('success', false, 'message', 'Not signed in.');
  end if;

  -- Idempotent: a retried signup must not create a second tenant.
  select mu.merchant_id into v_existing
  from public.merchant_users mu where mu.auth_user_id = v_auth_id;

  if v_existing is not null then
    return jsonb_build_object('success', true, 'merchantId', v_existing, 'alreadyProvisioned', true);
  end if;

  insert into public.merchants (business_name, location, upi_id)
  values (trim(p_business_name), coalesce(trim(p_location), ''), coalesce(trim(p_upi_id), ''))
  returning id into v_merchant_id;

  -- The owner's permissions column stays empty by design: app_has_permission
  -- short-circuits to true for owners, so an owner automatically holds every
  -- permission including ones added to the registry years from now.
  insert into public.merchant_users (merchant_id, auth_user_id, is_owner, name, phone, permissions)
  values (v_merchant_id, v_auth_id, true, trim(p_owner_name), trim(p_phone), '{}'::jsonb);

  for v_type in select * from jsonb_array_elements(p_ticket_types)
  loop
    insert into public.ticket_types (merchant_id, code, label, icon, amount, sort_order, is_active)
    values (
      v_merchant_id,
      upper(v_type ->> 'code'),
      v_type ->> 'label',
      coalesce(v_type ->> 'icon', 'ticket'),
      coalesce((v_type ->> 'amount')::numeric, 0),
      coalesce((v_type ->> 'sortOrder')::int, 0),
      coalesce((v_type ->> 'isActive')::boolean, true)
    )
    on conflict (merchant_id, code) do nothing;
  end loop;

  return jsonb_build_object('success', true, 'merchantId', v_merchant_id, 'alreadyProvisioned', false);
end;
$$;

revoke all on function public.provision_merchant(text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.provision_merchant(text, text, text, text, text, jsonb) to authenticated;
-- =============================================================================
-- Brute-force protection for staff PIN sign-in.
--
-- A gatekeeper PIN is short by necessity - it is typed on a phone at a gate, in
-- a hurry, sometimes in the rain. A 6-digit PIN is only a million guesses, which
-- an unthrottled endpoint gives up in hours. These columns let the staff-auth
-- Edge Function lock an account after repeated failures.
--
-- Counters live on merchant_users rather than in a separate attempts table
-- because the lockout only ever needs the latest state, not an audit trail, and
-- a table would need its own RLS story for something no client may read.
-- =============================================================================

alter table public.merchant_users
  add column if not exists failed_pin_attempts integer     not null default 0,
  add column if not exists pin_locked_until    timestamptz;

-- Called only by the staff-auth Edge Function using the service role, so it
-- takes the user id directly rather than reading auth.uid() - at the point it
-- runs there is deliberately no session yet.
create or replace function public.register_pin_failure(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempts integer;
  v_locked   timestamptz;
begin
  update public.merchant_users
     set failed_pin_attempts = failed_pin_attempts + 1,
         -- Five strikes, then fifteen minutes. Long enough to make guessing
         -- hopeless, short enough that a gatekeeper who fat-fingered their PIN
         -- is not locked out for a whole shift.
         pin_locked_until = case
           when failed_pin_attempts + 1 >= 5 then now() + interval '15 minutes'
           else pin_locked_until
         end
   where id = p_user_id
  returning failed_pin_attempts, pin_locked_until into v_attempts, v_locked;

  return jsonb_build_object('attempts', v_attempts, 'lockedUntil', v_locked);
end;
$$;

create or replace function public.clear_pin_failures(p_user_id uuid)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.merchant_users
     set failed_pin_attempts = 0, pin_locked_until = null, last_seen_at = now()
   where id = p_user_id;
$$;

revoke all on function public.register_pin_failure(uuid) from public, anon, authenticated;
revoke all on function public.clear_pin_failures(uuid)  from public, anon, authenticated;
grant execute on function public.register_pin_failure(uuid) to service_role;
grant execute on function public.clear_pin_failures(uuid)  to service_role;
-- =============================================================================
-- Gateway-verified settlement.
--
-- confirm_payment requires a signed-in staff member, which is right for the UPI
-- flow where a human asserts the money arrived. A payment gateway webhook has
-- no session and no staff member - its authority comes from a signature this
-- database cannot check. So the verification happens in the Edge Function, and
-- this function is granted to service_role only, never to anon or authenticated.
--
-- Keeping it separate from confirm_payment is deliberate: the ledger must be
-- able to tell apart a payment a gateway proved and one a person vouched for.
-- =============================================================================

create or replace function public.settle_payment_by_gateway(
  p_ticket_code text,
  p_payment_ref text,
  p_provider    text default 'razorpay'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.transactions%rowtype;
begin
  select * into v_tx
  from public.transactions t
  where upper(t.ticket_code) = upper(trim(p_ticket_code))
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'No such pass.');
  end if;

  -- Webhooks are retried, sometimes many times. Settling twice must be a no-op,
  -- not a second payment or an error the gateway keeps retrying.
  if v_tx.status = 'paid' then
    return jsonb_build_object('success', true, 'alreadySettled', true,
      'ticketCode', v_tx.ticket_code);
  end if;

  if v_tx.status <> 'pending' then
    return jsonb_build_object('success', false,
      'message', 'A ' || v_tx.status || ' pass cannot be settled.');
  end if;

  update public.transactions
     set status = 'paid',
         payment_ref = coalesce(nullif(trim(coalesce(p_payment_ref, '')), ''), payment_ref),
         payment_provider = p_provider,
         payment_verified_at = now(),
         -- Deliberately null: no person vouched for this one, the gateway did.
         payment_verified_by = null
   where id = v_tx.id
  returning * into v_tx;

  return jsonb_build_object('success', true, 'alreadySettled', false,
    'ticketCode', v_tx.ticket_code);
end;
$$;

revoke all on function public.settle_payment_by_gateway(text, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_payment_by_gateway(text, text, text) to service_role;

-- Read-only lookup for the order-creation endpoint: it must price the order
-- from the database, never from the browser, or a customer could pay one rupee
-- for any pass.
create or replace function public.gateway_order_context(p_ticket_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx public.transactions%rowtype;
  v_m  public.merchants%rowtype;
begin
  select * into v_tx from public.transactions t
   where upper(t.ticket_code) = upper(trim(p_ticket_code));
  if not found then
    return jsonb_build_object('success', false, 'message', 'No such pass.');
  end if;
  if v_tx.status <> 'pending' then
    return jsonb_build_object('success', false, 'message', 'This pass is not awaiting payment.');
  end if;

  select * into v_m from public.merchants m where m.id = v_tx.merchant_id;

  return jsonb_build_object(
    'success', true,
    'ticketCode', v_tx.ticket_code,
    'amount', v_tx.amount,
    'currency', v_m.currency,
    'businessName', v_m.business_name,
    'customerPhone', v_tx.customer_phone,
    'description', v_tx.ticket_type_label
  );
end;
$$;

revoke all on function public.gateway_order_context(text) from public, anon, authenticated;
grant execute on function public.gateway_order_context(text) to service_role;
-- =============================================================================
-- Pass validity, extensions and overstay.
--
-- A pass now has a lifetime. When it runs out the customer either extends it -
-- ideally from the reminder that reaches their WhatsApp - or pays an overstay
-- charge at the gate.
--
-- The overstay path is the one that matters commercially. Before this, an
-- expired pass simply failed at the exit and a staff member had to improvise:
-- money changed hands with no record, which is exactly the leak this product
-- exists to close. Now the gatekeeper is told the amount, collects it, and taps
-- once - and that collection is attributed to them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Validity is per ticket type, alongside its price.
--
-- NULL valid_for_minutes means the type never expires, which keeps existing
-- behaviour for anything the owner does not want timed (a mela day pass, a
-- stall token). Extension price and length fall back to the base ones when left
-- unset, so an owner who only wants "another hour costs the same" sets nothing.
-- -----------------------------------------------------------------------------
alter table public.ticket_types
  add column if not exists valid_for_minutes integer
    check (valid_for_minutes is null or valid_for_minutes > 0),
  add column if not exists extension_minutes integer
    check (extension_minutes is null or extension_minutes > 0),
  add column if not exists extension_amount numeric(10,2)
    check (extension_amount is null or extension_amount >= 0);

comment on column public.ticket_types.valid_for_minutes is
  'How long a pass of this type stays valid once paid. NULL = never expires.';
comment on column public.ticket_types.extension_amount is
  'Price of one extension. NULL falls back to this type''s base amount.';
comment on column public.ticket_types.extension_minutes is
  'Length of one extension. NULL falls back to valid_for_minutes.';

-- -----------------------------------------------------------------------------
-- The clock starts when the pass becomes usable, not when it was created.
--
-- A customer whose UPI payment sat unconfirmed for twenty minutes must not lose
-- twenty minutes of parking, so activated_at is stamped at the moment status
-- becomes paid, and expires_at is derived from it.
-- -----------------------------------------------------------------------------
alter table public.transactions
  add column if not exists activated_at          timestamptz,
  add column if not exists extension_count       integer not null default 0,
  add column if not exists overstay_amount       numeric(10,2) not null default 0,
  add column if not exists overstay_collected_at timestamptz,
  add column if not exists overstay_collected_by uuid references public.merchant_users(id) on delete set null,
  add column if not exists reminder_sent_at      timestamptz;

-- Drives both the "expiring soon" list and the reminder sweep. Partial, because
-- only live passes are ever queried this way.
create index if not exists transactions_expiry_watch_idx
  on public.transactions (merchant_id, expires_at)
  where status = 'paid' and expires_at is not null;

-- -----------------------------------------------------------------------------
-- Extensions are their own rows rather than an edit to the pass.
--
-- Each one is money taken, so it needs its own status, its own payment
-- reference and its own audit trail. Folding them into the transaction would
-- leave the ledger unable to answer "what did this customer actually pay, and
-- when".
-- -----------------------------------------------------------------------------
create table if not exists public.pass_extensions (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  merchant_id    uuid not null references public.merchants(id) on delete cascade,

  amount         numeric(10,2) not null check (amount >= 0),
  minutes        integer not null check (minutes > 0),

  /** The window this extension buys, recorded even before it is paid. */
  extends_from   timestamptz not null,
  extends_to     timestamptz not null,

  status         text not null default 'pending'
                 check (status in ('pending', 'paid', 'cancelled')),
  payment_provider    text,
  payment_ref         text,
  payment_verified_at timestamptz,
  payment_verified_by uuid references public.merchant_users(id) on delete set null,

  created_at     timestamptz not null default now()
);

create index if not exists pass_extensions_transaction_idx
  on public.pass_extensions (transaction_id, created_at desc);
create index if not exists pass_extensions_merchant_idx
  on public.pass_extensions (merchant_id, created_at desc);

-- At most one unpaid extension per pass, so a customer tapping Extend twice
-- cannot end up owing for two.
create unique index if not exists pass_extensions_one_pending_idx
  on public.pass_extensions (transaction_id)
  where status = 'pending';

alter table public.pass_extensions enable row level security;

revoke all on public.pass_extensions from anon;
grant select on public.pass_extensions to authenticated;

-- Same rule as transactions: seeing what someone paid requires can_view_ledger.
-- Writes go only through the RPCs below.
drop policy if exists pass_extensions_select_ledger on public.pass_extensions;
create policy pass_extensions_select_ledger on public.pass_extensions
  for select to authenticated
  using (
    merchant_id = public.app_current_merchant_id()
    and public.app_has_permission('can_view_ledger')
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.pass_extensions;
  end if;
exception
  when duplicate_object then null;
end $$;

-- =============================================================================
-- Shared helpers
-- =============================================================================

/** Expiry for a pass of this type starting at p_from. NULL = never expires. */
create or replace function public.compute_expiry(
  p_ticket_type_id uuid,
  p_from           timestamptz
)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
           when tt.valid_for_minutes is null then null
           else p_from + make_interval(mins => tt.valid_for_minutes)
         end
  from public.ticket_types tt
  where tt.id = p_ticket_type_id;
$$;

/** What one extension of this pass costs and buys. */
create or replace function public.extension_terms(p_ticket_type_id uuid)
returns table (amount numeric, minutes integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(tt.extension_amount, tt.amount),
         coalesce(tt.extension_minutes, tt.valid_for_minutes)
  from public.ticket_types tt
  where tt.id = p_ticket_type_id
    and tt.valid_for_minutes is not null;
$$;

/**
 * Overstay owed on an expired pass.
 *
 * Charged in whole extension periods: being forty minutes late on a
 * thirty-minute extension costs two, the same as it would have cost to extend
 * twice in advance. That keeps the incentive pointing the right way - extending
 * is never more expensive than overstaying - and it is a rule a gatekeeper can
 * explain to an argumentative customer in one sentence.
 *
 * Returns 0 for a pass that has not expired or has no expiry at all.
 */
create or replace function public.overstay_due(p_transaction_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx      public.transactions%rowtype;
  v_amount  numeric;
  v_minutes integer;
  v_overdue numeric;
begin
  select * into v_tx from public.transactions t where t.id = p_transaction_id;
  if not found or v_tx.expires_at is null or v_tx.expires_at >= now() then
    return 0;
  end if;

  select et.amount, et.minutes into v_amount, v_minutes
  from public.extension_terms(v_tx.ticket_type_id) et;

  -- The type was deleted, or never had a validity window. Nothing to charge.
  if v_amount is null or v_minutes is null or v_minutes <= 0 then
    return 0;
  end if;

  v_overdue := extract(epoch from (now() - v_tx.expires_at)) / 60.0;
  return round(ceil(v_overdue / v_minutes) * v_amount, 2);
end;
$$;

revoke all on function public.compute_expiry(uuid, timestamptz) from public, anon;
revoke all on function public.extension_terms(uuid) from public, anon;
revoke all on function public.overstay_due(uuid) from public, anon;
grant execute on function public.compute_expiry(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.extension_terms(uuid) to authenticated, service_role;
grant execute on function public.overstay_due(uuid) to authenticated, service_role;
-- =============================================================================
-- Expiry-aware procedures.
--
-- Replaces the pass lifecycle functions so that validity is stamped when a pass
-- becomes usable, and adds the extension and overstay paths.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- issue_pass: now stamps the validity window when the counter marks it paid.
-- -----------------------------------------------------------------------------
create or replace function public.issue_pass(
  p_ticket_type_code text,
  p_vehicle_number   text default null,
  p_customer_phone   text default null,
  p_mark_paid        boolean default true,
  p_payment_ref      text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id     uuid;
  v_merchant_id uuid;
  v_can_issue   boolean;
  v_type        public.ticket_types%rowtype;
  v_tx          public.transactions%rowtype;
  v_now         timestamptz := now();
begin
  select mu.id, mu.merchant_id,
         case when mu.is_owner then true
              else coalesce((mu.permissions ->> 'can_issue_passes')::boolean, false) end
    into v_user_id, v_merchant_id, v_can_issue
  from public.merchant_users mu
  where mu.auth_user_id = auth.uid() and mu.is_active
  limit 1;

  if v_user_id is null then
    return jsonb_build_object('success', false, 'status', 'UNAUTHORIZED',
      'message', 'Not signed in as an active staff member.');
  end if;
  if not v_can_issue then
    return jsonb_build_object('success', false, 'status', 'UNAUTHORIZED',
      'message', 'You do not have permission to issue passes.');
  end if;

  select * into v_type
  from public.ticket_types tt
  where tt.merchant_id = v_merchant_id
    and tt.code = upper(trim(p_ticket_type_code))
    and tt.is_active;

  if not found then
    return jsonb_build_object('success', false, 'status', 'INVALID',
      'message', 'Unknown or inactive ticket type: ' || coalesce(p_ticket_type_code, '(none)'));
  end if;

  insert into public.transactions (
    merchant_id, ticket_type_id, ticket_type_code, ticket_type_label,
    amount, vehicle_number, customer_phone,
    status, payment_provider, payment_ref,
    payment_verified_at, payment_verified_by,
    activated_at, expires_at,
    issued_by_user_id, ticket_code
  ) values (
    v_merchant_id, v_type.id, v_type.code, v_type.label,
    v_type.amount,
    nullif(upper(trim(coalesce(p_vehicle_number, ''))), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    case when p_mark_paid then 'paid' else 'pending' end,
    'counter',
    nullif(trim(coalesce(p_payment_ref, '')), ''),
    case when p_mark_paid then v_now else null end,
    case when p_mark_paid then v_user_id else null end,
    -- The clock starts only once the pass is usable.
    case when p_mark_paid then v_now else null end,
    case when p_mark_paid then public.compute_expiry(v_type.id, v_now) else null end,
    v_user_id, public.generate_ticket_code()
  )
  returning * into v_tx;

  return jsonb_build_object('success', true, 'status', 'ISSUED', 'ticket', to_jsonb(v_tx));
end;
$$;

revoke all on function public.issue_pass(text, text, text, boolean, text) from public, anon;
grant execute on function public.issue_pass(text, text, text, boolean, text) to authenticated;

-- -----------------------------------------------------------------------------
-- confirm_payment: the clock starts here for a customer-checkout pass.
-- -----------------------------------------------------------------------------
create or replace function public.confirm_payment(
  p_ticket_code text,
  p_payment_ref text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id     uuid;
  v_merchant_id uuid;
  v_can_issue   boolean;
  v_tx          public.transactions%rowtype;
  v_now         timestamptz := now();
begin
  select mu.id, mu.merchant_id,
         case when mu.is_owner then true
              else coalesce((mu.permissions ->> 'can_issue_passes')::boolean, false) end
    into v_user_id, v_merchant_id, v_can_issue
  from public.merchant_users mu
  where mu.auth_user_id = auth.uid() and mu.is_active
  limit 1;

  if v_user_id is null or not v_can_issue then
    return jsonb_build_object('success', false, 'status', 'UNAUTHORIZED',
      'message', 'You do not have permission to confirm payments.');
  end if;

  select * into v_tx
  from public.transactions t
  where upper(t.ticket_code) = upper(trim(p_ticket_code))
    and t.merchant_id = v_merchant_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'INVALID',
      'message', 'No such pass at this location.');
  end if;
  if v_tx.status = 'paid' then
    return jsonb_build_object('success', true, 'status', 'ALREADY_PAID',
      'message', 'This pass was already confirmed.', 'ticket', to_jsonb(v_tx));
  end if;
  if v_tx.status <> 'pending' then
    return jsonb_build_object('success', false, 'status', 'INVALID',
      'message', 'A ' || v_tx.status || ' pass cannot be confirmed.');
  end if;

  update public.transactions
     set status = 'paid',
         payment_ref = coalesce(nullif(trim(coalesce(p_payment_ref, '')), ''), payment_ref),
         payment_verified_at = v_now,
         payment_verified_by = v_user_id,
         activated_at = v_now,
         expires_at = public.compute_expiry(ticket_type_id, v_now)
   where id = v_tx.id
  returning * into v_tx;

  return jsonb_build_object('success', true, 'status', 'CONFIRMED',
    'message', 'Payment confirmed. Pass is now valid.', 'ticket', to_jsonb(v_tx));
end;
$$;

revoke all on function public.confirm_payment(text, text) from public, anon;
grant execute on function public.confirm_payment(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- settle_payment_by_gateway: same stamping, gateway-verified.
-- -----------------------------------------------------------------------------
create or replace function public.settle_payment_by_gateway(
  p_ticket_code text,
  p_payment_ref text,
  p_provider    text default 'razorpay'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx  public.transactions%rowtype;
  v_now timestamptz := now();
begin
  select * into v_tx
  from public.transactions t
  where upper(t.ticket_code) = upper(trim(p_ticket_code))
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'No such pass.');
  end if;
  if v_tx.status = 'paid' then
    return jsonb_build_object('success', true, 'alreadySettled', true,
      'ticketCode', v_tx.ticket_code);
  end if;
  if v_tx.status <> 'pending' then
    return jsonb_build_object('success', false,
      'message', 'A ' || v_tx.status || ' pass cannot be settled.');
  end if;

  update public.transactions
     set status = 'paid',
         payment_ref = coalesce(nullif(trim(coalesce(p_payment_ref, '')), ''), payment_ref),
         payment_provider = p_provider,
         payment_verified_at = v_now,
         payment_verified_by = null,
         activated_at = v_now,
         expires_at = public.compute_expiry(ticket_type_id, v_now)
   where id = v_tx.id
  returning * into v_tx;

  return jsonb_build_object('success', true, 'alreadySettled', false,
    'ticketCode', v_tx.ticket_code);
end;
$$;

revoke all on function public.settle_payment_by_gateway(text, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_payment_by_gateway(text, text, text) to service_role;

-- =============================================================================
-- validate_ticket: expiry now produces its own outcome.
--
-- An expired pass is deliberately NOT cleared here, and not rejected outright
-- either. It returns EXPIRED together with what is owed, so the gatekeeper can
-- take the money and clear it in one further tap via clear_expired_pass. That
-- second call is what puts the collection in the ledger against their name -
-- previously an expired pass simply failed and whatever happened next happened
-- off the books.
-- =============================================================================
create or replace function public.validate_ticket(
  p_ticket_code text,
  p_exit_gate   text default 'Main Exit',
  p_notes       text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id    uuid;
  v_merchant_id uuid;
  v_can_verify boolean;
  v_tx         public.transactions%rowtype;
  v_existing   public.ticket_validations%rowtype;
  v_scanned_by text;
  v_new        public.ticket_validations%rowtype;
  v_code       text;
  v_due        numeric;
begin
  select mu.id, mu.merchant_id,
         case when mu.is_owner then true
              else coalesce((mu.permissions ->> 'can_verify_tickets')::boolean, false) end
    into v_user_id, v_merchant_id, v_can_verify
  from public.merchant_users mu
  where mu.auth_user_id = auth.uid() and mu.is_active
  limit 1;

  if v_user_id is null then
    return jsonb_build_object('success', false, 'status', 'UNAUTHORIZED',
      'message', 'Not signed in as an active staff member.');
  end if;
  if not v_can_verify then
    return jsonb_build_object('success', false, 'status', 'UNAUTHORIZED',
      'message', 'You do not have permission to verify exit passes. Ask the owner to enable it.');
  end if;

  v_code := trim(p_ticket_code);
  if v_code like '{%}' then
    begin
      v_code := coalesce(v_code::jsonb ->> 'ticketCode', v_code);
    exception when others then
      null;
    end;
  end if;
  v_code := upper(v_code);

  select * into v_tx
  from public.transactions t
  where upper(t.ticket_code) = v_code
    and t.merchant_id = v_merchant_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'INVALID',
      'message', 'Invalid pass. This QR is not recognised at this location.');
  end if;

  if v_tx.status <> 'paid' then
    return jsonb_build_object(
      'success', false,
      'status',  case when v_tx.status = 'pending' then 'UNPAID' else 'INVALID' end,
      'message', case
                   when v_tx.status = 'pending'  then 'Payment not confirmed for this pass. Do not allow exit.'
                   when v_tx.status = 'refunded' then 'This pass was refunded and is no longer valid.'
                   else 'This pass is not valid.'
                 end,
      'ticket', to_jsonb(v_tx));
  end if;

  -- Checked before expiry: "already used" is the more useful thing to tell a
  -- gatekeeper about a pass that is both.
  select * into v_existing
  from public.ticket_validations tv
  where tv.transaction_id = v_tx.id;

  if found then
    select mu.name into v_scanned_by
    from public.merchant_users mu where mu.id = v_existing.scanned_by_user_id;

    return jsonb_build_object(
      'success', false, 'status', 'ALREADY_USED',
      'message', 'Already used at ' || to_char(v_existing.scanned_at, 'HH12:MI AM')
                 || ' by ' || coalesce(v_scanned_by, 'another gatekeeper')
                 || ' (' || v_existing.exit_gate || ').',
      'ticket', to_jsonb(v_tx),
      -- The name is folded into the object rather than left only in the
      -- message, so the app can lay out who and where itself. A gatekeeper
      -- reading a refusal needs those two facts as facts, not as a sentence
      -- they have to parse in a queue.
      'validation', to_jsonb(v_existing)
                    || jsonb_build_object('scanned_by_name', v_scanned_by),
      'scannedAt', v_existing.scanned_at);
  end if;

  if v_tx.expires_at is not null and v_tx.expires_at < now() then
    v_due := public.overstay_due(v_tx.id);
    return jsonb_build_object(
      'success', false, 'status', 'EXPIRED',
      'message', 'Pass expired at ' || to_char(v_tx.expires_at, 'HH12:MI AM')
                 || case when v_due > 0
                      then '. Collect ' || to_char(v_due, 'FM999999990.00') || ' overstay before exit.'
                      else '.' end,
      'ticket', to_jsonb(v_tx),
      'expiresAt', v_tx.expires_at,
      'overstayDue', v_due);
  end if;

  insert into public.ticket_validations
    (transaction_id, merchant_id, scanned_by_user_id, exit_gate, notes)
  values
    (v_tx.id, v_merchant_id, v_user_id, coalesce(nullif(trim(p_exit_gate), ''), 'Main Exit'), p_notes)
  returning * into v_new;

  return jsonb_build_object(
    'success', true, 'status', 'VERIFIED',
    'message', 'Pass verified. Exit cleared.',
    'ticket', to_jsonb(v_tx),
    'validation', to_jsonb(v_new),
    'scannedAt', v_new.scanned_at);

exception
  when unique_violation then
    return jsonb_build_object(
      'success', false, 'status', 'ALREADY_USED',
      'message', 'Already used - another gatekeeper scanned this pass a moment ago.');
end;
$$;

revoke all on function public.validate_ticket(text, text, text) from public, anon;
grant execute on function public.validate_ticket(text, text, text) to authenticated;

-- =============================================================================
-- clear_expired_pass: take the overstay and open the gate, in one transaction.
--
-- The amount is recomputed here rather than trusted from the request, so a
-- tampered client cannot let someone out for a rupee. The client's figure is
-- accepted only when it is at least what is owed - a gatekeeper rounding up
-- because the customer had no change is fine; rounding down is not.
-- =============================================================================
create or replace function public.clear_expired_pass(
  p_ticket_code       text,
  p_collected_amount  numeric default null,
  p_exit_gate         text default 'Main Exit',
  p_notes             text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id     uuid;
  v_merchant_id uuid;
  v_can_verify  boolean;
  v_tx          public.transactions%rowtype;
  v_new         public.ticket_validations%rowtype;
  v_due         numeric;
  v_collected   numeric;
begin
  select mu.id, mu.merchant_id,
         case when mu.is_owner then true
              else coalesce((mu.permissions ->> 'can_verify_tickets')::boolean, false) end
    into v_user_id, v_merchant_id, v_can_verify
  from public.merchant_users mu
  where mu.auth_user_id = auth.uid() and mu.is_active
  limit 1;

  if v_user_id is null or not v_can_verify then
    return jsonb_build_object('success', false, 'status', 'UNAUTHORIZED',
      'message', 'You do not have permission to clear passes.');
  end if;

  select * into v_tx
  from public.transactions t
  where upper(t.ticket_code) = upper(trim(p_ticket_code))
    and t.merchant_id = v_merchant_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'INVALID',
      'message', 'No such pass at this location.');
  end if;
  if v_tx.status <> 'paid' then
    return jsonb_build_object('success', false, 'status', 'UNPAID',
      'message', 'This pass was never paid for.');
  end if;

  v_due := public.overstay_due(v_tx.id);
  v_collected := coalesce(p_collected_amount, v_due);

  if v_collected < v_due then
    return jsonb_build_object('success', false, 'status', 'INVALID',
      'message', 'Overstay of ' || to_char(v_due, 'FM999999990.00') || ' is still owed.',
      'overstayDue', v_due);
  end if;

  update public.transactions
     set overstay_amount = v_collected,
         overstay_collected_at = now(),
         overstay_collected_by = v_user_id
   where id = v_tx.id
  returning * into v_tx;

  insert into public.ticket_validations
    (transaction_id, merchant_id, scanned_by_user_id, exit_gate, notes)
  values
    (v_tx.id, v_merchant_id, v_user_id,
     coalesce(nullif(trim(p_exit_gate), ''), 'Main Exit'),
     coalesce(p_notes, 'Overstay collected: ' || to_char(v_collected, 'FM999999990.00')))
  returning * into v_new;

  return jsonb_build_object(
    'success', true, 'status', 'VERIFIED',
    'message', 'Overstay recorded. Exit cleared.',
    'ticket', to_jsonb(v_tx),
    'validation', to_jsonb(v_new),
    'overstayCollected', v_collected,
    'scannedAt', v_new.scanned_at);

exception
  when unique_violation then
    return jsonb_build_object('success', false, 'status', 'ALREADY_USED',
      'message', 'Already used - another gatekeeper cleared this pass a moment ago.');
end;
$$;

revoke all on function public.clear_expired_pass(text, numeric, text, text) from public, anon;
grant execute on function public.clear_expired_pass(text, numeric, text, text) to authenticated;
-- =============================================================================
-- Extensions, expiry reminders, and the reporting that goes with them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- public_start_extension: the customer taps Extend on their own pass page.
--
-- Anonymous, because the whole point is that they act from the WhatsApp
-- reminder without an account. Like checkout, it creates something PENDING and
-- prices it from the database: the extension does not take effect until the
-- money is confirmed, so tapping Extend cannot by itself buy time.
-- -----------------------------------------------------------------------------
create or replace function public.public_start_extension(p_ticket_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx       public.transactions%rowtype;
  v_m        public.merchants%rowtype;
  v_amount   numeric;
  v_minutes  integer;
  v_from     timestamptz;
  v_existing public.pass_extensions%rowtype;
  v_ext      public.pass_extensions%rowtype;
begin
  select * into v_tx
  from public.transactions t
  where upper(t.ticket_code) = upper(trim(p_ticket_code))
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Pass not found.');
  end if;
  if v_tx.status <> 'paid' then
    return jsonb_build_object('success', false, 'message', 'This pass is not active yet.');
  end if;
  if exists (select 1 from public.ticket_validations tv where tv.transaction_id = v_tx.id) then
    return jsonb_build_object('success', false,
      'message', 'This pass has already been used at the exit.');
  end if;
  if v_tx.expires_at is null then
    return jsonb_build_object('success', false, 'message', 'This pass does not expire.');
  end if;

  select et.amount, et.minutes into v_amount, v_minutes
  from public.extension_terms(v_tx.ticket_type_id) et;

  if v_amount is null or v_minutes is null then
    return jsonb_build_object('success', false,
      'message', 'Extensions are not available for this pass type.');
  end if;

  -- Reuse an unpaid extension rather than stacking a second one. A customer who
  -- taps Extend, gets distracted, and taps again must not end up owing twice.
  select * into v_existing
  from public.pass_extensions pe
  where pe.transaction_id = v_tx.id and pe.status = 'pending';

  if found then
    select * into v_m from public.merchants m where m.id = v_tx.merchant_id;
    return jsonb_build_object(
      'success', true, 'extensionId', v_existing.id, 'amount', v_existing.amount,
      'minutes', v_existing.minutes, 'extendsTo', v_existing.extends_to,
      'ticketCode', v_tx.ticket_code, 'reused', true,
      'merchant', jsonb_build_object('id', v_m.id, 'businessName', v_m.business_name,
                                     'upiId', v_m.upi_id, 'currency', v_m.currency,
                                     'paymentProvider', v_m.payment_provider));
  end if;

  -- Extend from whichever is later: the current expiry, or now. Someone who is
  -- already overdue buys time from this moment, not retroactively from an hour
  -- ago - otherwise a long overstay could be erased for one extension's price.
  v_from := greatest(v_tx.expires_at, now());

  insert into public.pass_extensions
    (transaction_id, merchant_id, amount, minutes, extends_from, extends_to, status)
  values
    (v_tx.id, v_tx.merchant_id, v_amount, v_minutes,
     v_from, v_from + make_interval(mins => v_minutes), 'pending')
  returning * into v_ext;

  select * into v_m from public.merchants m where m.id = v_tx.merchant_id;

  return jsonb_build_object(
    'success', true, 'extensionId', v_ext.id, 'amount', v_ext.amount,
    'minutes', v_ext.minutes, 'extendsTo', v_ext.extends_to,
    'ticketCode', v_tx.ticket_code, 'reused', false,
    'merchant', jsonb_build_object('id', v_m.id, 'businessName', v_m.business_name,
                                   'upiId', v_m.upi_id, 'currency', v_m.currency,
                                   'paymentProvider', v_m.payment_provider));
end;
$$;

grant execute on function public.public_start_extension(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- confirm_extension: a staff member saw the extension money arrive.
-- -----------------------------------------------------------------------------
create or replace function public.confirm_extension(
  p_ticket_code text,
  p_payment_ref text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id     uuid;
  v_merchant_id uuid;
  v_can_issue   boolean;
  v_tx          public.transactions%rowtype;
  v_ext         public.pass_extensions%rowtype;
begin
  select mu.id, mu.merchant_id,
         case when mu.is_owner then true
              else coalesce((mu.permissions ->> 'can_issue_passes')::boolean, false) end
    into v_user_id, v_merchant_id, v_can_issue
  from public.merchant_users mu
  where mu.auth_user_id = auth.uid() and mu.is_active
  limit 1;

  if v_user_id is null or not v_can_issue then
    return jsonb_build_object('success', false, 'status', 'UNAUTHORIZED',
      'message', 'You do not have permission to confirm payments.');
  end if;

  select * into v_tx
  from public.transactions t
  where upper(t.ticket_code) = upper(trim(p_ticket_code))
    and t.merchant_id = v_merchant_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'INVALID',
      'message', 'No such pass at this location.');
  end if;

  select * into v_ext
  from public.pass_extensions pe
  where pe.transaction_id = v_tx.id and pe.status = 'pending'
  for update;

  if not found then
    return jsonb_build_object('success', false, 'status', 'INVALID',
      'message', 'No extension is waiting for payment on this pass.');
  end if;

  update public.pass_extensions
     set status = 'paid',
         payment_provider = 'counter',
         payment_ref = nullif(trim(coalesce(p_payment_ref, '')), ''),
         payment_verified_at = now(),
         payment_verified_by = v_user_id
   where id = v_ext.id;

  update public.transactions
     set expires_at = v_ext.extends_to,
         extension_count = extension_count + 1
   where id = v_tx.id
  returning * into v_tx;

  return jsonb_build_object('success', true, 'status', 'EXTENDED',
    'message', 'Pass extended to ' || to_char(v_ext.extends_to, 'HH12:MI AM') || '.',
    'ticket', to_jsonb(v_tx), 'extendsTo', v_ext.extends_to);
end;
$$;

revoke all on function public.confirm_extension(text, text) from public, anon;
grant execute on function public.confirm_extension(text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- settle_extension_by_gateway: the same, proved by a payment webhook.
-- -----------------------------------------------------------------------------
create or replace function public.settle_extension_by_gateway(
  p_extension_id uuid,
  p_payment_ref  text,
  p_provider     text default 'razorpay'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ext public.pass_extensions%rowtype;
begin
  select * into v_ext from public.pass_extensions pe where pe.id = p_extension_id for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'No such extension.');
  end if;
  -- Webhooks retry; settling twice must not buy a second window.
  if v_ext.status = 'paid' then
    return jsonb_build_object('success', true, 'alreadySettled', true);
  end if;
  if v_ext.status <> 'pending' then
    return jsonb_build_object('success', false, 'message', 'This extension was cancelled.');
  end if;

  update public.pass_extensions
     set status = 'paid', payment_provider = p_provider, payment_ref = p_payment_ref,
         payment_verified_at = now(), payment_verified_by = null
   where id = v_ext.id;

  update public.transactions
     set expires_at = v_ext.extends_to,
         extension_count = extension_count + 1
   where id = v_ext.transaction_id;

  return jsonb_build_object('success', true, 'alreadySettled', false,
    'extendsTo', v_ext.extends_to);
end;
$$;

revoke all on function public.settle_extension_by_gateway(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.settle_extension_by_gateway(uuid, text, text) to service_role;

/** Priced server-side for the gateway, same reasoning as gateway_order_context. */
create or replace function public.extension_order_context(p_extension_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ext public.pass_extensions%rowtype;
  v_tx  public.transactions%rowtype;
  v_m   public.merchants%rowtype;
begin
  select * into v_ext from public.pass_extensions pe where pe.id = p_extension_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'No such extension.');
  end if;
  if v_ext.status <> 'pending' then
    return jsonb_build_object('success', false, 'message', 'This extension is not awaiting payment.');
  end if;

  select * into v_tx from public.transactions t where t.id = v_ext.transaction_id;
  select * into v_m  from public.merchants m    where m.id = v_ext.merchant_id;

  return jsonb_build_object(
    'success', true, 'extensionId', v_ext.id, 'amount', v_ext.amount,
    'currency', v_m.currency, 'businessName', v_m.business_name,
    'ticketCode', v_tx.ticket_code, 'customerPhone', v_tx.customer_phone,
    'description', v_tx.ticket_type_label || ' extension');
end;
$$;

revoke all on function public.extension_order_context(uuid) from public, anon, authenticated;
grant execute on function public.extension_order_context(uuid) to service_role;

-- =============================================================================
-- Reminders
-- =============================================================================

/**
 * Passes whose customer should be nudged now, claimed atomically.
 *
 * The UPDATE ... RETURNING stamps reminder_sent_at in the same statement that
 * selects the rows, so two overlapping sweeps cannot both pick up the same
 * pass and message the customer twice. Stamping before the send is the safer
 * side of the trade: a rare missed reminder beats duplicate messages that cost
 * money per conversation and read as spam.
 */
create or replace function public.due_expiry_reminders(
  p_lead_minutes integer default 30,
  p_limit        integer default 100
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows jsonb;
begin
  with due as (
    select t.id
    from public.transactions t
    left join public.ticket_validations tv on tv.transaction_id = t.id
    where t.status = 'paid'
      and t.expires_at is not null
      and t.reminder_sent_at is null
      and t.customer_phone is not null
      and tv.id is null
      and t.expires_at > now()
      and t.expires_at <= now() + make_interval(mins => p_lead_minutes)
    order by t.expires_at
    limit p_limit
    for update of t skip locked
  ),
  claimed as (
    update public.transactions t
       set reminder_sent_at = now()
      from due
     where t.id = due.id
    returning t.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'ticketCode',    c.ticket_code,
           'customerPhone', c.customer_phone,
           'typeLabel',     c.ticket_type_label,
           'vehicleNumber', c.vehicle_number,
           'expiresAt',     c.expires_at,
           'businessName',  m.business_name,
           'location',      m.location,
           'currency',      m.currency,
           'extensionAmount', et.amount,
           'extensionMinutes', et.minutes
         )), '[]'::jsonb)
    into v_rows
  from claimed c
  join public.merchants m on m.id = c.merchant_id
  left join lateral public.extension_terms(c.ticket_type_id) et on true;

  return jsonb_build_object('success', true, 'passes', v_rows);
end;
$$;

revoke all on function public.due_expiry_reminders(integer, integer)
  from public, anon, authenticated;
grant execute on function public.due_expiry_reminders(integer, integer) to service_role;

/** Lets the sweep put a reminder back in the queue when the send failed. */
create or replace function public.reset_expiry_reminder(p_ticket_code text)
returns void
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  update public.transactions
     set reminder_sent_at = null
   where upper(ticket_code) = upper(trim(p_ticket_code));
$$;

revoke all on function public.reset_expiry_reminder(text) from public, anon, authenticated;
grant execute on function public.reset_expiry_reminder(text) to service_role;

-- =============================================================================
-- Reporting
-- =============================================================================

/** The merchant-facing "these are about to run out" list. */
create or replace function public.passes_expiring_soon(p_within_minutes integer default 60)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_merchant_id uuid;
  v_can_ledger  boolean;
  v_rows        jsonb;
begin
  select mu.merchant_id,
         case when mu.is_owner then true
              else coalesce((mu.permissions ->> 'can_view_ledger')::boolean, false) end
    into v_merchant_id, v_can_ledger
  from public.merchant_users mu
  where mu.auth_user_id = auth.uid() and mu.is_active
  limit 1;

  if v_merchant_id is null then
    return jsonb_build_object('success', false, 'message', 'Not signed in.');
  end if;
  -- Vehicle numbers and phone numbers are customer data, so this follows the
  -- same permission as the ledger rather than being open to every gatekeeper.
  if not v_can_ledger then
    return jsonb_build_object('success', true, 'passes', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ticketCode',    t.ticket_code,
           'typeLabel',     t.ticket_type_label,
           'vehicleNumber', t.vehicle_number,
           'customerPhone', t.customer_phone,
           'expiresAt',     t.expires_at,
           'reminderSentAt', t.reminder_sent_at,
           'isExpired',     t.expires_at < now(),
           'overstayDue',   public.overstay_due(t.id)
         ) order by t.expires_at), '[]'::jsonb)
    into v_rows
  from public.transactions t
  left join public.ticket_validations tv on tv.transaction_id = t.id
  where t.merchant_id = v_merchant_id
    and t.status = 'paid'
    and t.expires_at is not null
    and tv.id is null
    and t.expires_at <= now() + make_interval(mins => p_within_minutes);

  return jsonb_build_object('success', true, 'passes', v_rows);
end;
$$;

revoke all on function public.passes_expiring_soon(integer) from public, anon;
grant execute on function public.passes_expiring_soon(integer) to authenticated;

-- -----------------------------------------------------------------------------
-- dashboard_stats: extensions and overstay are revenue too.
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_stats(
  p_from timestamptz default date_trunc('day', now()),
  p_to   timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_merchant_id  uuid;
  v_user_id      uuid;
  v_can_ledger   boolean;
  v_prev_from    timestamptz;
  v_pass_rev     numeric := 0;
  v_ext_rev      numeric := 0;
  v_overstay_rev numeric := 0;
  v_prev_rev     numeric := 0;
  v_issued       integer := 0;
  v_scans        integer := 0;
  v_my_scans     integer := 0;
  v_open         integer := 0;
  v_pending      integer := 0;
  v_expiring     integer := 0;
  v_growth       numeric := 0;
  v_revenue      numeric := 0;
begin
  select mu.id, mu.merchant_id,
         case when mu.is_owner then true
              else coalesce((mu.permissions ->> 'can_view_ledger')::boolean, false) end
    into v_user_id, v_merchant_id, v_can_ledger
  from public.merchant_users mu
  where mu.auth_user_id = auth.uid() and mu.is_active
  limit 1;

  if v_merchant_id is null then
    return jsonb_build_object('success', false, 'message', 'Not signed in.');
  end if;

  v_prev_from := p_from - (p_to - p_from);

  select coalesce(sum(t.amount) filter (where t.status = 'paid'), 0),
         coalesce(sum(t.overstay_amount) filter (where t.overstay_collected_at
                    between p_from and p_to), 0),
         count(*) filter (where t.status = 'paid'),
         count(*) filter (where t.status = 'pending')
    into v_pass_rev, v_overstay_rev, v_issued, v_pending
  from public.transactions t
  where t.merchant_id = v_merchant_id
    and t.created_at >= p_from and t.created_at < p_to;

  select coalesce(sum(pe.amount), 0) into v_ext_rev
  from public.pass_extensions pe
  where pe.merchant_id = v_merchant_id
    and pe.status = 'paid'
    and pe.payment_verified_at >= p_from and pe.payment_verified_at < p_to;

  -- Previous period on the same basis, or the comparison is meaningless.
  select coalesce(sum(t.amount) filter (where t.status = 'paid'), 0)
         + coalesce(sum(t.overstay_amount) filter (where t.overstay_collected_at
             between v_prev_from and p_from), 0)
    into v_prev_rev
  from public.transactions t
  where t.merchant_id = v_merchant_id
    and t.created_at >= v_prev_from and t.created_at < p_from;

  select v_prev_rev + coalesce(sum(pe.amount), 0) into v_prev_rev
  from public.pass_extensions pe
  where pe.merchant_id = v_merchant_id
    and pe.status = 'paid'
    and pe.payment_verified_at >= v_prev_from and pe.payment_verified_at < p_from;

  select count(*), count(*) filter (where tv.scanned_by_user_id = v_user_id)
    into v_scans, v_my_scans
  from public.ticket_validations tv
  where tv.merchant_id = v_merchant_id
    and tv.scanned_at >= p_from and tv.scanned_at < p_to;

  select count(*) filter (where true),
         count(*) filter (where t.expires_at is not null
                            and t.expires_at <= now() + interval '60 minutes')
    into v_open, v_expiring
  from public.transactions t
  left join public.ticket_validations tv on tv.transaction_id = t.id
  where t.merchant_id = v_merchant_id
    and t.status = 'paid'
    and tv.id is null;

  v_revenue := v_pass_rev + v_ext_rev + v_overstay_rev;

  if v_prev_rev > 0 then
    v_growth := round(((v_revenue - v_prev_rev) / v_prev_rev) * 100);
  elsif v_revenue > 0 then
    v_growth := 100;
  end if;

  return jsonb_build_object(
    'success', true,
    'canViewRevenue',  v_can_ledger,
    'revenue',         case when v_can_ledger then v_revenue else null end,
    'extensionRevenue',case when v_can_ledger then v_ext_rev else null end,
    'overstayRevenue', case when v_can_ledger then v_overstay_rev else null end,
    'previousRevenue', case when v_can_ledger then v_prev_rev else null end,
    'growthPercent',   case when v_can_ledger then v_growth else null end,
    'passesIssued',    case when v_can_ledger then v_issued else null end,
    'pendingPayments', case when v_can_ledger then v_pending else null end,
    'scans',           v_scans,
    'myScans',         v_my_scans,
    'openPasses',      v_open,
    'expiringSoon',    v_expiring,
    'from',            p_from,
    'to',              p_to
  );
end;
$$;

revoke all on function public.dashboard_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.dashboard_stats(timestamptz, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- public_ticket_status: the customer needs to see their countdown.
-- -----------------------------------------------------------------------------
create or replace function public.public_ticket_status(p_ticket_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tx      public.transactions%rowtype;
  v_m       public.merchants%rowtype;
  v_val     public.ticket_validations%rowtype;
  v_amount  numeric;
  v_minutes integer;
  v_pending public.pass_extensions%rowtype;
begin
  select * into v_tx
  from public.transactions t
  where upper(t.ticket_code) = upper(trim(p_ticket_code));

  if not found then
    return jsonb_build_object('success', false, 'message', 'Pass not found.');
  end if;

  select * into v_m from public.merchants m where m.id = v_tx.merchant_id;
  select * into v_val from public.ticket_validations tv where tv.transaction_id = v_tx.id;
  select et.amount, et.minutes into v_amount, v_minutes
  from public.extension_terms(v_tx.ticket_type_id) et;
  select * into v_pending
  from public.pass_extensions pe
  where pe.transaction_id = v_tx.id and pe.status = 'pending';

  return jsonb_build_object(
    'success', true,
    'ticket', jsonb_build_object(
      'ticketCode',     v_tx.ticket_code,
      'status',         v_tx.status,
      'amount',         v_tx.amount,
      'typeLabel',      v_tx.ticket_type_label,
      'vehicleNumber',  v_tx.vehicle_number,
      'issuedAt',       v_tx.created_at,
      'activatedAt',    v_tx.activated_at,
      'expiresAt',      v_tx.expires_at,
      'isUsed',         v_val.id is not null,
      'usedAt',         v_val.scanned_at,
      'extensionCount', v_tx.extension_count,
      'overstayDue',    public.overstay_due(v_tx.id),
      'canExtend',      v_tx.status = 'paid' and v_val.id is null
                        and v_tx.expires_at is not null and v_amount is not null,
      'extensionAmount',  v_amount,
      'extensionMinutes', v_minutes,
      'pendingExtension', case when v_pending.id is null then null else jsonb_build_object(
        'extensionId', v_pending.id, 'amount', v_pending.amount,
        'minutes', v_pending.minutes, 'extendsTo', v_pending.extends_to) end
    ),
    'merchant', jsonb_build_object(
      'id', v_m.id, 'businessName', v_m.business_name, 'location', v_m.location,
      'upiId', v_m.upi_id, 'currency', v_m.currency,
      'paymentProvider', v_m.payment_provider,
      -- The customer looking at their pass should see whose business it is.
      -- Same shape public_checkout_info returns, so one component renders both.
      'branding', coalesce(v_m.settings -> 'branding', '{}'::jsonb))
  );
end;
$$;

grant execute on function public.public_ticket_status(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- public_checkout_info: show the customer how long each pass lasts.
-- -----------------------------------------------------------------------------
create or replace function public.public_checkout_info(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_m     public.merchants%rowtype;
  v_types jsonb;
begin
  select * into v_m from public.merchants m where m.id = p_merchant_id and m.is_active;
  if not found then
    return jsonb_build_object('success', false, 'message', 'This gate QR is not active.');
  end if;

  select coalesce(jsonb_agg(t order by t.sort_order), '[]'::jsonb) into v_types
  from (
    select tt.code, tt.label, tt.icon, tt.amount, tt.sort_order,
           tt.valid_for_minutes,
           coalesce(tt.extension_amount, tt.amount)         as extension_amount,
           coalesce(tt.extension_minutes, tt.valid_for_minutes) as extension_minutes
    from public.ticket_types tt
    where tt.merchant_id = p_merchant_id and tt.is_active
  ) t;

  return jsonb_build_object(
    'success', true,
    'merchant', jsonb_build_object(
      'id',                v_m.id,
      'businessName',      v_m.business_name,
      'location',          v_m.location,
      'upiId',             v_m.upi_id,
      'currency',          v_m.currency,
      'paymentProvider',   v_m.payment_provider,
      'messagingProvider', v_m.messaging_provider,
      'branding',          coalesce(v_m.settings -> 'branding', '{}'::jsonb)
    ),
    'ticketTypes', v_types
  );
end;
$$;

grant execute on function public.public_checkout_info(uuid) to anon, authenticated;
-- =============================================================================
-- Schedule the expiry reminder sweep.
--
-- Guarded rather than assumed: pg_cron and pg_net have to be enabled on the
-- project (Database -> Extensions in the Supabase dashboard) and are not on by
-- default. If they are missing this migration does nothing and says so, instead
-- of failing the whole push - the app works without reminders, it just falls
-- back to the "Running out soon" list that staff work manually.
--
-- Before this does anything useful, set the two settings it reads:
--
--   alter database postgres set app.settings.functions_url =
--     'https://YOUR-PROJECT.functions.supabase.co';
--   alter database postgres set app.settings.cron_secret = 'the CRON_SECRET you set';
--
-- Every five minutes is chosen against a thirty-minute lead time: a pass is
-- claimed well within its warning window, and a missed run costs the customer
-- at most five minutes of notice.
-- =============================================================================

do $$
declare
  v_functions_url text;
  v_cron_secret   text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not enabled - expiry reminders will not be scheduled. '
                 'Enable it in Database -> Extensions, then re-run this migration.';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net is not enabled - expiry reminders will not be scheduled. '
                 'Enable it in Database -> Extensions, then re-run this migration.';
    return;
  end if;

  v_functions_url := current_setting('app.settings.functions_url', true);
  v_cron_secret   := current_setting('app.settings.cron_secret', true);

  if v_functions_url is null or v_cron_secret is null then
    raise notice 'app.settings.functions_url or app.settings.cron_secret is unset - '
                 'expiry reminders will not be scheduled. See the comment at the top '
                 'of this migration.';
    return;
  end if;

  -- Unschedule first so re-running this is idempotent rather than stacking
  -- duplicate jobs that would each message the same customer.
  perform cron.unschedule('noparchi-expiry-reminders')
  where exists (select 1 from cron.job where jobname = 'noparchi-expiry-reminders');

  perform cron.schedule(
    'noparchi-expiry-reminders',
    '*/5 * * * *',
    format(
      $job$
      select net.http_post(
        url     := %L,
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'x-cron-secret', %L),
        body    := '{}'::jsonb
      );
      $job$,
      v_functions_url || '/expiry-reminders',
      v_cron_secret
    )
  );

  raise notice 'Expiry reminder sweep scheduled every 5 minutes.';
end $$;
-- =============================================================================
-- Storage Bucket: merchant-assets
--
-- Holds merchant logos and public branding assets.
-- Public bucket so customer-facing checkout and ticket pages (/pay, /ticket)
-- can load merchant logos without authentication.
-- Upload, update, and deletion are restricted to authenticated merchant staff
-- with 'can_edit_settings' permission scoped to their merchant folder.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'merchant-assets',
  'merchant-assets',
  true,
  5242880, -- 5 MB limit
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Storage RLS Policies
-- -----------------------------------------------------------------------------

-- Public read for merchant assets
drop policy if exists "merchant_assets_public_read" on storage.objects;
create policy "merchant_assets_public_read"
on storage.objects for select
using (bucket_id = 'merchant-assets');

-- Staff with can_edit_settings can upload to their merchant's folder
drop policy if exists "merchant_assets_staff_insert" on storage.objects;
create policy "merchant_assets_staff_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'merchant-assets'
  and (storage.foldername(name))[1] = public.app_current_merchant_id()::text
  and public.app_has_permission('can_edit_settings')
);

-- Staff with can_edit_settings can update objects in their merchant's folder
drop policy if exists "merchant_assets_staff_update" on storage.objects;
create policy "merchant_assets_staff_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'merchant-assets'
  and (storage.foldername(name))[1] = public.app_current_merchant_id()::text
  and public.app_has_permission('can_edit_settings')
);

-- Staff with can_edit_settings can delete objects from their merchant's folder
drop policy if exists "merchant_assets_staff_delete" on storage.objects;
create policy "merchant_assets_staff_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'merchant-assets'
  and (storage.foldername(name))[1] = public.app_current_merchant_id()::text
  and public.app_has_permission('can_edit_settings')
);
