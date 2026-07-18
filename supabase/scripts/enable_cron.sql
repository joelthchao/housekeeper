-- Schedule the daily dispatch job. Run once in the cloud SQL Editor.
-- Not a migration: local `supabase start` may lack pg_net, which would break
-- `db reset`. The function URL and service role key are read from Vault, so no
-- secrets live in this file. Create the Vault secrets first:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/dispatch-notifications', 'dispatch_url');
--   select vault.create_secret('<service_role_key>', 'service_role_key');
-- Then run this file and: select public.schedule_dispatch();

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.schedule_dispatch()
returns text
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'dispatch_url';
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'service_role_key';

  if v_url is null or v_key is null then
    raise notice 'Vault is missing dispatch_url or service_role_key';
    return 'skipped: missing vault secrets';
  end if;

  perform cron.unschedule('dispatch-notifications-daily')
    where exists (select 1 from cron.job where jobname = 'dispatch-notifications-daily');

  -- Daily at 01:00 UTC (09:00 Asia/Taipei).
  perform cron.schedule(
    'dispatch-notifications-daily',
    '0 1 * * *',
    format(
      $job$
      select net.http_post(
        url     := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
      $job$,
      v_url, v_key
    )
  );

  return 'scheduled: dispatch-notifications-daily @ 0 1 * * * (UTC)';
end;
$$;

select public.schedule_dispatch();
