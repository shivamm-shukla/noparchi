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
