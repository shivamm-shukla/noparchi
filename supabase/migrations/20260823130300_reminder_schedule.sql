-- =============================================================================
-- Schedule the expiry reminder sweep.
--
-- Guarded rather than assumed: pg_cron and pg_net have to be enabled on the
-- project (Database -> Extensions in the Supabase dashboard) and are not on by
-- default. If they are missing this migration does nothing and says so, instead
-- of failing the whole push - the app works without reminders, it just falls
-- back to the "Running out soon" list that staff work manually.
--
-- Before this does anything useful, set the two settings it reads:
--
--   alter database postgres set app.settings.functions_url =
--     'https://YOUR-PROJECT.functions.supabase.co';
--   alter database postgres set app.settings.cron_secret = 'the CRON_SECRET you set';
--
-- Every five minutes is chosen against a thirty-minute lead time: a pass is
-- claimed well within its warning window, and a missed run costs the customer
-- at most five minutes of notice.
-- =============================================================================

do $$
declare
  v_functions_url text;
  v_cron_secret   text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not enabled - expiry reminders will not be scheduled. '
                 'Enable it in Database -> Extensions, then re-run this migration.';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net is not enabled - expiry reminders will not be scheduled. '
                 'Enable it in Database -> Extensions, then re-run this migration.';
    return;
  end if;

  v_functions_url := current_setting('app.settings.functions_url', true);
  v_cron_secret   := current_setting('app.settings.cron_secret', true);

  if v_functions_url is null or v_cron_secret is null then
    raise notice 'app.settings.functions_url or app.settings.cron_secret is unset - '
                 'expiry reminders will not be scheduled. See the comment at the top '
                 'of this migration.';
    return;
  end if;

  -- Unschedule first so re-running this is idempotent rather than stacking
  -- duplicate jobs that would each message the same customer.
  perform cron.unschedule('noparchi-expiry-reminders')
  where exists (select 1 from cron.job where jobname = 'noparchi-expiry-reminders');

  perform cron.schedule(
    'noparchi-expiry-reminders',
    '*/5 * * * *',
    format(
      $job$
      select net.http_post(
        url     := %L,
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'x-cron-secret', %L),
        body    := '{}'::jsonb
      );
      $job$,
      v_functions_url || '/expiry-reminders',
      v_cron_secret
    )
  );

  raise notice 'Expiry reminder sweep scheduled every 5 minutes.';
end $$;
