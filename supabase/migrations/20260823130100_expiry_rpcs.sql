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
      'validation', to_jsonb(v_existing),
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
