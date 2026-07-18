# Deploy & verify runbook

End-to-end setup: frontend on GitHub Pages, backend on Supabase, notifications
in `log` mode (no LINE, no affiliate account needed). The last section covers
switching to real LINE.

Placeholders: `<ref>` = Supabase project ref, `<your-user>` = GitHub username.

## Prerequisites
- A Supabase account (free tier is fine).
- This repo on GitHub, made **public** (free GitHub Pages requires a public repo).
- Supabase CLI: `brew install supabase/tap/supabase` (or `npm i -g supabase`).

## 1. Create the Supabase project
Dashboard → New project. Note (Settings → API): project ref, project URL,
publishable key, and service role key.

## 2. Frontend (GitHub Pages)
1. Repo Settings → Pages → Source: **GitHub Actions**.
2. Edit `frontend/config.js`: set `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   (publishable key), and `APP_URL` (`https://<your-user>.github.io/housekeeper/`).
3. Push to `main` (or run the "Deploy frontend to GitHub Pages" workflow). The
   site goes live at `https://<your-user>.github.io/housekeeper/`.

## 3. Backend (Supabase)
Enable the GitHub integration's **Deploy to production** (Settings →
Integrations → GitHub), production branch `main`. Merging to `main` then
auto-applies migrations and deploys the Edge Functions.

Set function secrets (log mode needs no LINE):
```bash
supabase link --project-ref <ref>
supabase secrets set \
  PUBLIC_APP_URL="https://<your-user>.github.io/housekeeper/" \
  NOTIFIER_PROVIDER="log" \
  AFFILIATE_PROVIDER="passthrough" \
  LINE_MONTHLY_QUOTA="200"
```
Set the production auth URLs: Authentication → URL Configuration → Site URL and
Redirect URLs = `https://<your-user>.github.io/housekeeper/`.

Email: Supabase's built-in sender is rate-limited (a couple per hour, test only).
For real delivery, configure custom SMTP (e.g. Resend) under Authentication → SMTP.

## 4. Verify
1. Open the site, log in by email, add an item — proves frontend + auth + DB + RLS.
2. Make it due and trigger dispatch (SQL Editor; `<service_role_key>` stays server-side):
   ```sql
   update public.items set next_due_at = now() - interval '1 day';
   create extension if not exists pg_net;
   select net.http_post(
     url := 'https://<ref>.supabase.co/functions/v1/dispatch-notifications',
     headers := jsonb_build_object('Content-Type','application/json',
       'Authorization','Bearer <service_role_key>'),
     body := '{}'::jsonb
   );
   ```
3. Check Edge Functions → dispatch-notifications → Logs for the `[notifier:log]`
   output, and confirm `items.last_notified_at` advanced and a `notifications`
   row with `status = sent` exists.

## 5. Schedule it daily
```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/dispatch-notifications', 'dispatch_url');
select vault.create_secret('<service_role_key>', 'service_role_key');
```
Run `supabase/scripts/enable_cron.sql`, then `select public.schedule_dispatch();`.
Confirm with `select jobname, schedule, active from cron.job;`. Runs daily at
01:00 UTC (09:00 Asia/Taipei).

## Switch to real LINE
1. Create a LINE Official Account + Messaging API channel and a LINE Login
   channel, and link them. Set the Login channel callback to
   `https://<ref>.supabase.co/functions/v1/line-callback`.
2. Update secrets and flip the provider:
   ```bash
   supabase secrets set \
     NOTIFIER_PROVIDER="line" \
     LINE_CHANNEL_ACCESS_TOKEN="..." \
     LINE_CHANNEL_SECRET="..." \
     LINE_LOGIN_CHANNEL_ID="..." \
     LINE_LOGIN_CHANNEL_SECRET="..." \
     LINE_LOGIN_REDIRECT_URI="https://<ref>.supabase.co/functions/v1/line-callback"
   ```
3. Set `LINE_LOGIN_CHANNEL_ID` and `LINE_LOGIN_REDIRECT_URI` in
   `frontend/config.js` and push.
4. In the app's settings, bind LINE and add the Official Account as a friend,
   then re-run dispatch — the reminder arrives on your phone.
