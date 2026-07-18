-- ============================================================
-- enable_cron.sql — 每日排程呼叫 dispatch-notifications
--
-- ⚠️ 這不是 migration，是「雲端一次性腳本」。請在 Supabase Dashboard
--    → SQL Editor 手動執行（不要放進 migrations，因為本機 supabase start
--    不一定有 pg_net，會讓 db reset 卡住）。
--
-- 使用 pg_cron + pg_net；機密（function URL、service role key）存在 Vault，
-- 不寫死在腳本裡。執行前請先建立 Vault 機密（見下方註解與 docs/mvp-runbook.md）。
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ------------------------------------------------------------
-- 依 Vault 內的機密 (re)schedule 排程。
-- 需先在 Vault 建立兩個機密（見 README「部署指南」）：
--   dispatch_url        = https://<project-ref>.functions.supabase.co/dispatch-notifications
--   service_role_key    = <你的 service role key>
-- 之後執行：  select public.schedule_dispatch();
-- ------------------------------------------------------------
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
    raise notice 'Vault 缺少 dispatch_url 或 service_role_key，略過排程。';
    return 'skipped: missing vault secrets';
  end if;

  -- 先移除舊排程（若存在），再重建
  perform cron.unschedule('dispatch-notifications-daily')
    where exists (select 1 from cron.job where jobname = 'dispatch-notifications-daily');

  -- 每天 UTC 01:00（= 台北 09:00）觸發
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

-- 部署時 Vault 機密可能尚未設定，這裡嘗試排程但失敗不擋 migration。
select public.schedule_dispatch();
