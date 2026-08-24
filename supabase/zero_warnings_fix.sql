-- =============================================================================
-- Zero-Warnings Security & Linter Cleanup Script
-- =============================================================================

-- 1. Remove Storage Table Policy Warning (Public buckets serve directly via public URL)
drop policy if exists "merchant_assets_public_read" on storage.objects;

-- 2. Drop Legacy/Unused Functions that triggered linter warnings
drop function if exists public.get_merchant_checkout_info(uuid);
drop function if exists public.get_public_ticket(text);
drop function if exists public.issue_ticket(uuid, text, text, text, text);
drop function if exists public.verify_and_burn_ticket(text, text, uuid);
drop function if exists public.confirm_ticket_payment(text, text, text);
drop function if exists public.rls_auto_enable();

-- 3. Change Trigger & Utility Functions to SECURITY INVOKER (Eliminates Definer warnings)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.compute_expiry(p_ticket_type_id uuid, p_from timestamptz)
returns timestamptz
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when t.validity_type = 'duration' and t.duration_hours is not null
      then p_from + (t.duration_hours || ' hours')::interval
    when t.validity_type = 'fixed_time' and t.valid_until is not null
      then (p_from::date + t.valid_until)::timestamptz
    when t.validity_type = 'calendar_day'
      then (date_trunc('day', p_from) + interval '1 day' - interval '1 second')::timestamptz
    else null
  end
  from public.ticket_types t
  where t.id = p_ticket_type_id;
$$;

create or replace function public.extension_terms(p_ticket_type_id uuid)
returns table(allowed boolean, duration_hours integer, price numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(allow_extension, false) as allowed,
    extension_duration_hours as duration_hours,
    extension_price as price
  from public.ticket_types
  where id = p_ticket_type_id;
$$;

create or replace function public.overstay_due(p_transaction_id uuid)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tx record;
  v_grace interval;
  v_overstay interval;
  v_chargeable_units integer;
  v_unit_interval interval;
begin
  select t.*, tt.validity_type, tt.overstay_rate, tt.overstay_unit_minutes, tt.overstay_grace_minutes
  into v_tx
  from public.transactions t
  join public.ticket_types tt on tt.id = t.ticket_type_id
  where t.id = p_transaction_id;

  if not found or v_tx.valid_until is null or v_tx.overstay_rate is null or v_tx.overstay_rate <= 0 then
    return 0;
  end if;

  if now() <= v_tx.valid_until then
    return 0;
  end if;

  v_grace := (coalesce(v_tx.overstay_grace_minutes, 0) || ' minutes')::interval;
  if now() <= (v_tx.valid_until + v_grace) then
    return 0;
  end if;

  v_overstay := now() - v_tx.valid_until;
  v_unit_interval := (coalesce(v_tx.overstay_unit_minutes, 60) || ' minutes')::interval;

  v_chargeable_units := ceil(
    extract(epoch from v_overstay) / extract(epoch from v_unit_interval)
  )::integer;

  return v_chargeable_units * v_tx.overstay_rate;
end;
$$;
