# housekeeper — 定期購物補貨通知

讓使用者登記想定期補貨的品項／電商連結、設定補貨週期，系統每天挑出「差不多該補貨」的人，透過 **LINE** 推播提醒，並在購物連結附掛**聯盟行銷分潤連結**。

**技術上完全依賴 Supabase 一個平台**（Postgres + Auth + Edge Functions + Cron），前端也由 Edge Function 直接回傳 HTML，不需要另外的前端主機。

> 🚀 **想直接把 MVP 跑起來？** 照著 [`docs/mvp-runbook.md`](./docs/mvp-runbook.md) 做（Tier 0：雲端 + log 通知，零外部帳號即可端到端驗證）。

---

## 架構

```
瀏覽器 ── GET ──▶ Edge Function: web ──▶ 單頁 HTML/JS SPA（CDN 載入 supabase-js）
   │  anon key + RLS 直接讀寫自己的資料
   ▼
Supabase Postgres (RLS) + Auth (Email Magic Link)
   ▲                                  ▲
   │ 綁定 LINE                         │ 每天排程 (pg_cron + pg_net)
   │ Edge Function: line-callback      ▼
   │ (LINE Login OAuth)          Edge Function: dispatch-notifications
   │                              撈到期品項 → 解析分潤連結 → LINE push → 更新狀態
```

| 元件 | 位置 |
|---|---|
| 資料表 / RLS / trigger | `supabase/migrations/` |
| 每日排程（雲端一次性腳本） | `supabase/scripts/enable_cron.sql` |
| 前端 SPA | `supabase/functions/web/` |
| LINE 綁定 callback | `supabase/functions/line-callback/` |
| 排程推播 | `supabase/functions/dispatch-notifications/` |
| 分潤抽象層 / 通知抽象層 / LINE 傳輸 / admin client | `supabase/functions/_shared/` |

## 資料模型

- **profiles**：對應 `auth.users`，存 `line_user_id`、通知開關、時區。
- **items**：補貨品項，含 `source_url`、`affiliate_url`、`interval_days`、`last_notified_at`、`next_due_at`。
- **notifications**：推播 log，用於防重複與觀察免費額度。

`next_due_at = coalesce(last_notified_at, created_at) + interval_days`（由 trigger 自動維護）。

## 分潤（聯盟行銷）

`_shared/affiliate.ts` 是可插拔抽象層，用 `AFFILIATE_PROVIDER` 環境變數切換：
- `passthrough`（預設 / MVP）：直接回傳原連結，`status='fallback'`。
- `affiliatesone`（預留）：拿到聯盟網 API KEY / Site ID 後啟用，產生真正的分潤連結。

## 通知（LINE，可插拔）

`_shared/notifier.ts` 同樣是可插拔抽象層，用 `NOTIFIER_PROVIDER` 環境變數切換：
- `log`（預設 / MVP）：只把要送的內容印到 function log，**不需 LINE、不需使用者綁定**，方便還沒申請 LINE 前就能測整條排程流程。
- `line`：透過 LINE Messaging API 真的推播（需 `LINE_CHANNEL_ACCESS_TOKEN`、使用者需已綁定 `line_user_id`）。

切換 provider 時 `dispatch-notifications` 完全不用改。

## 前置準備與部署

> 詳細步驟見本檔最後的「部署指南」章節（實作完成後補齊）。

需要你自行完成（都需要你自己的帳號）：
1. 建立 Supabase 專案。
2. 建立 **LINE 官方帳號 + Messaging API channel**（推播用）。
3. 建立 **LINE Login channel** 並與官方帳號連結（綁定 userId 用）。
4. （之後）與 [Affiliates.One 聯盟網](https://www.affiliates.one/zh-tw) 簽約取得 API 憑證。

環境變數清單見 [`.env.example`](./.env.example)。

## 本機開發

```bash
supabase start                    # 起本機 Postgres / Auth / Studio / Inbucket(信箱)
supabase db reset                 # 套用 migrations + seed.sql（含測試資料）
supabase functions serve          # 本機跑所有 Edge Functions
```

- 前端：瀏覽 `http://127.0.0.1:54321/functions/v1/web`
- 登入信（Magic Link）會寄到本機 Inbucket：`http://127.0.0.1:54324`
- 每日排程（`pg_cron`/`pg_net`）**不在 migrations 裡**，是雲端一次性腳本（`supabase/scripts/enable_cron.sql`），所以本機 `db reset` 不會因為缺 `pg_net` 卡住。

---

## 部署指南

> 需要 **Supabase CLI**（`brew install supabase/tap/supabase` 或 `npm i -g supabase`）。
> 只想快速把 MVP 跑起來、先不接 LINE，直接照 [`docs/mvp-runbook.md`](./docs/mvp-runbook.md)（Tier 0）即可；本節是完整（含 LINE）的部署參考。

### 1. 建立 Supabase 專案
到 [supabase.com](https://supabase.com) 建專案，記下 **Project URL**、**anon key**、**service_role key**（Project Settings → API）。

### 2. 申請 LINE（兩個 channel）
> LINE Notify 已於 2025/3/31 終止，改用 Messaging API。

1. **Messaging API channel（官方帳號，負責推播）**
   - 在 [LINE Developers Console](https://developers.line.biz/) 建立 Provider → Messaging API channel。
   - 取得 **Channel access token（long-lived）** 與 **Channel secret**。
2. **LINE Login channel（負責綁定 userId）**
   - 同一 Provider 下建立 LINE Login channel。
   - 在 channel 設定裡 **連結（link）到上面的 Messaging API 官方帳號**（如此登入時可用 `bot_prompt=aggressive` 順帶加好友，推播才送得出去）。
   - Callback URL 填：`https://<project-ref>.functions.supabase.co/line-callback`
   - 取得 **Channel ID** 與 **Channel secret**。

### 3. 設定 Edge Function secrets
```bash
supabase secrets set \
  PUBLIC_APP_URL="https://<project-ref>.functions.supabase.co/web" \
  NOTIFIER_PROVIDER="log" \
  LINE_CHANNEL_ACCESS_TOKEN="..." \
  LINE_CHANNEL_SECRET="..." \
  LINE_LOGIN_CHANNEL_ID="..." \
  LINE_LOGIN_CHANNEL_SECRET="..." \
  LINE_LOGIN_REDIRECT_URI="https://<project-ref>.functions.supabase.co/line-callback" \
  AFFILIATE_PROVIDER="passthrough" \
  LINE_MONTHLY_QUOTA="200"
```
> MVP 先用 `NOTIFIER_PROVIDER=log`（只印 log）。要真的送 LINE 時改成 `line`：
> `supabase secrets set NOTIFIER_PROVIDER=line` 再重新部署 `dispatch-notifications`。
> `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 由平台自動注入，不用手動設定。

也到 **Auth → URL Configuration** 把 Site URL / Redirect URLs 設為 `PUBLIC_APP_URL`（Magic Link 才會導回前端）。

### 4. 套用資料庫 + 部署 functions
```bash
supabase db push                                    # 套用 migrations
supabase functions deploy web line-callback dispatch-notifications
```

### 5. 啟用每日排程（Cron）
排程需要 function URL 與 service role key，存在 Vault（不寫死在 git）。在 **SQL Editor** 執行：
```sql
-- 1) 先建立兩個 Vault 機密
select vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/dispatch-notifications', 'dispatch_url');
select vault.create_secret('<your-service-role-key>', 'service_role_key');
```
接著把 `supabase/scripts/enable_cron.sql` 全文貼進 SQL Editor 執行（它會啟用 `pg_cron`/`pg_net` 並建立 `schedule_dispatch()`），最後：
```sql
select public.schedule_dispatch();   -- 註冊每天 UTC 01:00（台北 09:00）的排程
select * from cron.job;              -- 確認已註冊
```

## 驗證

1. **前端流程**：開 `PUBLIC_APP_URL` → Email 登入 → 新增品項並設週期 → 到「設定」綁定 LINE → 回品項頁確認「下次提醒」日期。
2. **排程 dry-run（不真送）**：
   ```bash
   curl -X POST "https://<project-ref>.functions.supabase.co/dispatch-notifications?dry_run=1" \
     -H "Authorization: Bearer <service-role-key>"
   ```
   會回傳 JSON：到期品項數、將通知的使用者、preview 內容，但不送 LINE、不改資料。
3. **log 模式（MVP，不需 LINE）**：`NOTIFIER_PROVIDER=log` 時，去掉 `?dry_run=1` 打一次 → 要送的內容會印在 function log（`supabase functions logs dispatch-notifications` 或 Dashboard），`notifications` 記為 `sent`、品項 `last_notified_at` / `next_due_at` 會更新。
4. **真送一則**：把 `NOTIFIER_PROVIDER` 設成 `line`、自己的帳號綁定 LINE 並加官方帳號好友，建立一個已到期的品項，再打一次 → LINE 應收到含購物連結的提醒。
5. **Cron 狀態**：`select * from cron.job;` 與 `select * from cron.job_run_details order by start_time desc limit 5;`。
6. **抽象層單元測試**：
   ```bash
   deno test supabase/functions/_shared/
   # 或： node --experimental-strip-types supabase/functions/_shared/affiliate.test.ts
   #      node --experimental-strip-types supabase/functions/_shared/notifier.test.ts
   ```

## 之後：接真正的分潤連結
與 [Affiliates.One 聯盟網](https://www.affiliates.one/zh-tw) 簽約、通過品牌審核後拿到 API KEY / Site ID：
1. 在 `supabase/functions/_shared/affiliate.ts` 的 `AffiliatesOneProvider.resolve()` 依其 API 文件實作 deeplink 產生。
2. `supabase secrets set AFFILIATE_PROVIDER=affiliatesone AFFILIATESONE_API_KEY=... AFFILIATESONE_SITE_ID=...`
3. 重新部署 `dispatch-notifications`。呼叫端不需改動。

---

> ⚠️ **關於 LINE 通知**：LINE Notify 已於 2025/3/31 停止服務，本專案改用 LINE Messaging API 的 push message，免費方案每月 200 則（超過會由 `dispatch-notifications` 的額度護欄擋下、記為 `skipped_quota`）。
