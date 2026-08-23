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
