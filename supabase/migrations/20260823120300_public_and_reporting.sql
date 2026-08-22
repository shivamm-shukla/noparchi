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
