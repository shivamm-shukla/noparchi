-- =============================================================================
-- Migration: 20261005120000_dual_mode_scholarship.sql
-- Description: Adds dual-mode support (PARKING vs SCHOLARSHIP_TEST),
-- metadata JSONB, student registration RPC, and mode-aware ticket validation.
-- =============================================================================

-- 1. Add operating_mode and print_settings to merchants table
alter table public.merchants
  add column if not exists operating_mode text not null default 'PARKING'
  check (operating_mode in ('PARKING', 'SCHOLARSHIP_TEST', 'GENERAL_EVENT'));

-- 2. Add generic customer identification and metadata to transactions table
alter table public.transactions
  add column if not exists primary_name text,
  add column if not exists primary_phone text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists attended_at timestamptz,
  add column if not exists attended_by uuid references public.merchant_users(id);

create index if not exists idx_transactions_primary_phone on public.transactions(primary_phone);
create index if not exists idx_transactions_metadata on public.transactions using gin(metadata);

-- 3. Public RPC: Register Scholarship Student
create or replace function public.public_register_scholarship_student(
  p_merchant_id uuid,
  p_student_name text,
  p_student_phone text,
  p_parent_phone text,
  p_class_grade text,
  p_target_stream text,
  p_exam_slot text,
  p_campaign_source text default 'banner'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_merchant record;
  v_ticket_code text;
  v_roll_number text;
  v_transaction_id uuid;
  v_metadata jsonb;
  v_clean_student_phone text;
  v_clean_parent_phone text;
begin
  -- 1. Validate Merchant & Operating Mode
  select * into v_merchant 
  from public.merchants 
  where id = p_merchant_id and is_active;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Institute or exam center not found or inactive.');
  end if;

  v_clean_student_phone := regexp_replace(p_student_phone, '\D', '', 'g');
  v_clean_parent_phone := regexp_replace(p_parent_phone, '\D', '', 'g');

  if length(v_clean_student_phone) < 10 then
    return jsonb_build_object('success', false, 'message', 'Please enter a valid 10-digit student phone number.');
  end if;

  -- 2. Generate Roll Number & Unique Ticket Code
  v_ticket_code := generate_ticket_code();
  v_roll_number := 'SCH-' || to_char(now(), 'YY') || '-' || upper(substr(replace(v_ticket_code, '-', ''), 1, 4));

  -- 3. Construct Metadata Payload
  v_metadata := jsonb_build_object(
    'student_name', trim(p_student_name),
    'student_phone', v_clean_student_phone,
    'parent_phone', v_clean_parent_phone,
    'class_grade', trim(p_class_grade),
    'target_stream', trim(coalesce(p_target_stream, 'General')),
    'exam_slot', trim(p_exam_slot),
    'roll_number', v_roll_number,
    'campaign_source', trim(coalesce(p_campaign_source, 'banner'))
  );

  -- 4. Insert into transactions table
  insert into public.transactions (
    merchant_id,
    ticket_type_code,
    ticket_type_label,
    customer_phone,
    primary_name,
    primary_phone,
    ticket_code,
    amount,
    currency,
    status,
    activated_at,
    metadata
  ) values (
    p_merchant_id,
    'SCHOLARSHIP_TEST',
    'Scholarship Exam Admit Card',
    v_clean_student_phone,
    trim(p_student_name),
    v_clean_student_phone,
    v_ticket_code,
    0, -- Free scholarship registration
    'INR',
    'paid', -- Active / confirmed immediately
    now(),
    v_metadata
  )
  returning id into v_transaction_id;

  -- 5. Return Registration Summary
  return jsonb_build_object(
    'success', true,
    'ticketCode', v_ticket_code,
    'rollNumber', v_roll_number,
    'studentName', trim(p_student_name),
    'examSlot', trim(p_exam_slot),
    'merchantName', v_merchant.business_name,
    'location', v_merchant.location
  );
end;
$$;

grant execute on function public.public_register_scholarship_student to anon, authenticated;

-- 4. Update public_checkout_info to return operating_mode
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

  return jsonb_build_object(
    'success', true,
    'merchant', jsonb_build_object(
      'id',               v_m.id,
      'businessName',     v_m.business_name,
      'location',         v_m.location,
      'operatingMode',    coalesce(v_m.operating_mode, 'PARKING'),
      'upiId',            v_m.upi_id,
      'currency',         v_m.currency,
      'paymentProvider',  v_m.payment_provider,
      'messagingProvider',v_m.messaging_provider,
      'branding',         coalesce(v_m.settings -> 'branding', '{}'::jsonb),
      'printSettings',    coalesce(v_m.settings -> 'printSettings', '{}'::jsonb)
    ),
    'ticketTypes', v_types
  );
end;
$$;

grant execute on function public.public_checkout_info(uuid) to anon, authenticated;

-- 5. Update public_ticket_status to return mode-specific metadata and primary identification
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
      'primaryName',  coalesce(v_tx.primary_name, v_tx.metadata->>'student_name'),
      'primaryPhone', coalesce(v_tx.primary_phone, v_tx.customer_phone),
      'metadata',     coalesce(v_tx.metadata, '{}'::jsonb),
      'issuedAt',     v_tx.created_at,
      'expiresAt',    v_tx.expires_at,
      'isUsed',       v_val.id is not null or v_tx.attended_at is not null,
      'usedAt',       coalesce(v_val.scanned_at, v_tx.attended_at),
      'attendedAt',   v_tx.attended_at
    ),
    'merchant', jsonb_build_object(
      'id',            v_m.id,
      'businessName',  v_m.business_name,
      'location',      v_m.location,
      'operatingMode', coalesce(v_m.operating_mode, 'PARKING'),
      'branding',      coalesce(v_m.settings -> 'branding', '{}'::jsonb),
      'printSettings', coalesce(v_m.settings -> 'printSettings', '{}'::jsonb)
    )
  );
end;
$$;

grant execute on function public.public_ticket_status(text) to anon, authenticated;

-- 6. Mode-Aware validate_ticket RPC
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
  v_operating_mode text;
  v_can_verify    boolean;
  v_tx            public.transactions%rowtype;
  v_existing      public.ticket_validations%rowtype;
  v_scanned_by    text;
  v_new           public.ticket_validations%rowtype;
  v_code          text;
  v_student_name  text;
  v_roll_number   text;
  v_class_grade   text;
begin
  -- 1. Identify scanning staff member
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
      'message', 'You do not have permission to verify passes. Ask the owner to enable it.');
  end if;

  -- 2. Fetch merchant operating mode
  select coalesce(operating_mode, 'PARKING') into v_operating_mode
  from public.merchants
  where id = v_merchant_id;

  -- 3. Sanitize code
  v_code := trim(p_ticket_code);
  if v_code like '{%}' then
    begin
      v_code := coalesce(v_code::jsonb ->> 'ticketCode', v_code);
    exception when others then
      null;
    end;
  end if;
  v_code := upper(v_code);

  -- 4. Lock transaction row
  select * into v_tx
  from public.transactions t
  where upper(t.ticket_code) = v_code
    and t.merchant_id = v_merchant_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false, 'status', 'INVALID',
      'message', case 
                   when v_operating_mode = 'SCHOLARSHIP_TEST' then 'Invalid Admit Card. Not registered for this institute/exam.'
                   else 'Invalid pass. This QR is not recognised at this location.'
                 end);
  end if;

  -- 5. Paid/Confirmed check
  if v_tx.status <> 'paid' then
    return jsonb_build_object(
      'success', false,
      'status',  case when v_tx.status = 'pending' then 'UNPAID' else 'INVALID' end,
      'message', case
                   when v_tx.status = 'pending'  then 'Registration / Payment not confirmed for this pass.'
                   when v_tx.status = 'refunded' then 'This pass was refunded and is no longer valid.'
                   when v_tx.status = 'expired'  then 'This pass has expired.'
                   else 'This pass is not valid.'
                 end,
      'ticket', to_jsonb(v_tx));
  end if;

  -- 6. Check if already used / attended
  select * into v_existing
  from public.ticket_validations tv
  where tv.transaction_id = v_tx.id;

  if found or v_tx.attended_at is not null then
    select mu.name into v_scanned_by
    from public.merchant_users mu
    where mu.id = coalesce(v_existing.scanned_by_user_id, v_tx.attended_by);

    if v_operating_mode = 'SCHOLARSHIP_TEST' then
      return jsonb_build_object(
        'success', false, 'status', 'ALREADY_USED',
        'message', 'Student already checked in at ' || to_char(coalesce(v_existing.scanned_at, v_tx.attended_at), 'HH12:MI AM')
                   || ' by ' || coalesce(v_scanned_by, 'invigilator') || '.',
        'ticket', to_jsonb(v_tx),
        'studentName', coalesce(v_tx.primary_name, v_tx.metadata->>'student_name'),
        'rollNumber', v_tx.metadata->>'roll_number',
        'scannedAt', coalesce(v_existing.scanned_at, v_tx.attended_at));
    else
      return jsonb_build_object(
        'success', false, 'status', 'ALREADY_USED',
        'message', 'Already used at ' || to_char(v_existing.scanned_at, 'HH12:MI AM')
                   || ' by ' || coalesce(v_scanned_by, 'another gatekeeper')
                   || ' (' || v_existing.exit_gate || ').',
        'ticket', to_jsonb(v_tx),
        'validation', to_jsonb(v_existing) || jsonb_build_object('scanned_by_name', v_scanned_by),
        'scannedAt', v_existing.scanned_at);
    end if;
  end if;

  -- 7. Parking expiry check (skipped for scholarship test)
  if v_operating_mode = 'PARKING' and v_tx.expires_at is not null and v_tx.expires_at < now() then
    return jsonb_build_object(
      'success', false, 'status', 'EXPIRED',
      'message', 'This parking pass expired on ' || to_char(v_tx.expires_at, 'DD Mon, HH12:MI AM') || '.',
      'ticket', to_jsonb(v_tx));
  end if;

  -- 8. Record validation
  insert into public.ticket_validations
    (transaction_id, merchant_id, scanned_by_user_id, exit_gate, notes)
  values
    (v_tx.id, v_merchant_id, v_user_id, coalesce(nullif(trim(p_exit_gate), ''), case when v_operating_mode = 'SCHOLARSHIP_TEST' then 'Exam Hall Gate' else 'Main Exit' end), p_notes)
  returning * into v_new;

  -- In scholarship mode, also stamp attended_at on transactions
  if v_operating_mode = 'SCHOLARSHIP_TEST' then
    update public.transactions
    set attended_at = now(),
        attended_by = v_user_id
    where id = v_tx.id;
  end if;

  v_student_name := coalesce(v_tx.primary_name, v_tx.metadata->>'student_name');
  v_roll_number := v_tx.metadata->>'roll_number';
  v_class_grade := v_tx.metadata->>'class_grade';

  return jsonb_build_object(
    'success', true,
    'status', 'VERIFIED',
    'mode', v_operating_mode,
    'message', case 
                 when v_operating_mode = 'SCHOLARSHIP_TEST' then 'Attendance Recorded: ' || coalesce(v_student_name, 'Student') || ' (' || coalesce(v_roll_number, 'Admit Card') || ')'
                 else 'Vehicle cleared for exit.'
               end,
    'studentName', v_student_name,
    'rollNumber', v_roll_number,
    'classGrade', v_class_grade,
    'ticket', to_jsonb(v_tx),
    'validation', to_jsonb(v_new) || jsonb_build_object('scanned_by_name', (select name from public.merchant_users where id = v_user_id))
  );
end;
$$;

grant execute on function public.validate_ticket(text, text, text) to authenticated;
