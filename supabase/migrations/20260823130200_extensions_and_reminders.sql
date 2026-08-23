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
