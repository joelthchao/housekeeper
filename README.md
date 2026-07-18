# housekeeper

A recurring restock-reminder service. Users register items (with an optional
shopping URL) and a cadence; a daily job picks items that are due and sends a
reminder that includes an affiliate link.

The backend is entirely Supabase; the frontend is a static site on GitHub Pages.

```
Browser ── loads ──▶ GitHub Pages (frontend/)
   │  talks to Supabase with the publishable key; RLS scopes every row to its owner
   ▼
Supabase
   ├─ Postgres + RLS      data + per-user access control
   ├─ Auth                email magic link
   ├─ Edge Functions      line-callback, dispatch-notifications
   └─ pg_cron + pg_net    runs dispatch daily
```

Notifications and affiliate links are pluggable (env-selected), so the MVP runs
on a `log` notifier and `passthrough` affiliate resolver with zero external
accounts, and swaps to real LINE / affiliate integrations without touching call
sites.

## Docs

- [`CLAUDE.md`](./CLAUDE.md) — architecture, conventions, and dev workflow.
- [`docs/mvp-runbook.md`](./docs/mvp-runbook.md) — end-to-end deploy and verify.
- [`.env.example`](./.env.example) — environment variables.

## Local development

```bash
supabase start
supabase db reset                          # migrations + seed.sql
supabase functions serve                   # line-callback, dispatch-notifications
cd frontend && python3 -m http.server 8000 # serve the SPA
```

## Deploy (summary)

1. Create a Supabase project; fill `frontend/config.js` (public values).
2. Enable GitHub Pages (Settings → Pages → Source: GitHub Actions) and the
   Supabase GitHub integration's "Deploy to production".
3. Merge to `main`: migrations and Edge Functions deploy automatically; the
   Pages workflow publishes the frontend.
4. Schedule the daily job with `supabase/scripts/enable_cron.sql`.

See the runbook for the full walkthrough.

> Note: LINE Notify shut down on 2025-03-31; notifications use the LINE
> Messaging API (free tier: 200 messages/month, guarded by `LINE_MONTHLY_QUOTA`).
