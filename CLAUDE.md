# CLAUDE.md

Guidance for working in this repository.

## Development principles

1. **English first.** Write code, comments, commit messages, and docs in English.
2. **No author information.** Do not put names, emails, or personal identifiers in code, comments, or docs.
3. **Clear code over comments.** Prefer readable code to explanation. Only comment on the non-obvious (why, not what). Delete comments that restate the code.
4. **Build only what a feature needs.** No speculative abstractions, dead code, or gold-plating. Keep it simple; remove more than you add when you can.

## What this is

A recurring restock-reminder service. Users register items (with an optional shopping URL) and a cadence; a daily job picks items that are due and sends a reminder that includes an affiliate link.

## Architecture

Frontend is a static SPA on GitHub Pages. Backend is entirely Supabase.

```
Browser ── loads ──▶ GitHub Pages (frontend/: index.html, app.js, config.js)
   │  talks to Supabase directly with the publishable key; RLS scopes every row to its owner
   ▼
Supabase
   ├─ Postgres + RLS      data + per-user access control
   ├─ Auth                email magic link
   ├─ Edge Functions      line-callback (LINE bind), dispatch-notifications (the job)
   └─ pg_cron + pg_net    triggers dispatch daily
```

Secrets (service role key, LINE channel secrets, SMTP) live only in Supabase, never in the repo. The frontend holds public values only.

## Layout

| Path | Purpose |
|---|---|
| `frontend/` | Static SPA served by GitHub Pages (`.github/workflows/pages.yml` deploys it) |
| `supabase/migrations/` | Schema, RLS, triggers — auto-applied on merge to `main` |
| `supabase/functions/dispatch-notifications/` | Daily job: find due items → resolve link → notify → update |
| `supabase/functions/line-callback/` | LINE Login OAuth callback that stores the user's LINE id |
| `supabase/functions/test-notify/` | Sends a test reminder to the caller's own LINE (in-app "test" button) |
| `supabase/functions/_shared/` | Shared modules (see below) |
| `supabase/scripts/enable_cron.sql` | One-off cloud script to schedule the daily job |

## Pluggable providers

Two swap points, selected by env var, so the same call site works for the MVP stub and the real integration:

- **Notifier** (`_shared/notifier.ts`, `NOTIFIER_PROVIDER`): `log` (default, prints) or `line` (LINE push).
- **Affiliate** (`_shared/affiliate.ts`, `AFFILIATE_PROVIDER`): `passthrough` (default, original URL) or `affiliatesone`. Items without an explicit link fall back to a shopping-site search URL built from the name (`searchUrl`, `SEARCH_URL_TEMPLATE`).

## Data model

- `profiles` — one row per `auth.users`; LINE id, notify toggle, timezone.
- `items` — restock items; `interval_days`, `next_due_at` (maintained by trigger), affiliate fields.
- `notifications` — send log, used to enforce the monthly free-tier quota.

`next_due_at = coalesce(last_notified_at, created_at) + interval_days`.

## Workflow

- **Schema changes**: add a timestamped file in `supabase/migrations/` (`YYYYMMDDHHMMSS_name.sql`), keep it re-runnable (`create or replace`, `drop ... if exists`), open a PR. Merging to `main` auto-applies migrations and deploys Edge Functions (Supabase GitHub integration, "Deploy to production").
- **Secrets**: set in the Supabase dashboard or Vault; never commit them.
- **Frontend**: edit `frontend/`, push to `main`; the Pages workflow redeploys. `frontend/config.js` holds public config only.

## Local development

```bash
supabase start
supabase db reset                          # applies migrations + seed.sql
supabase functions serve                   # line-callback, dispatch-notifications
cd frontend && python3 -m http.server 8000 # serve the SPA
```

## Tests

```bash
deno test supabase/functions/_shared/
# or, without Deno:
node --experimental-strip-types supabase/functions/_shared/affiliate.test.ts
node --experimental-strip-types supabase/functions/_shared/notifier.test.ts
```
