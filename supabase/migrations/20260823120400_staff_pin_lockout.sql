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
