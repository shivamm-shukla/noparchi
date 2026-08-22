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
      'validation', to_jsonb(v_existing),
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
