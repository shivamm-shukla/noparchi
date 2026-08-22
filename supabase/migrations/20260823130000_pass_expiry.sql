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
