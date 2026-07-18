# MVP Runbook — Tier 0（前端 GitHub Pages · 後端 Supabase · log 通知 · 零外部帳號）

目標：把整條流程跑通、自己端到端驗證。架構：
- **前端**：靜態站 `frontend/`，放 **GitHub Pages**
- **後端**：**Supabase**（Postgres + Auth + Edge Functions）
- 通知用 `NOTIFIER_PROVIDER=log`（只印 log，**不需要 LINE**）
- 分潤用 `AFFILIATE_PROVIDER=passthrough`（原連結直傳，**不需要聯盟網**）

跑通後再照最後一節升級到 Tier 1（接真 LINE）。

---

## 你需要
- 一個 Supabase 帳號（免費方案即可）
- 這個 repo（已在你的 GitHub 上）
- 本機安裝 **Supabase CLI**：`brew install supabase/tap/supabase`（或 `npm i -g supabase`）

---

## 步驟

### 1. 建立 Supabase 專案
Dashboard → **New project**。建好後記下（Settings → API）：
- **Project ref**（例：`abcdefghijklmnop`）
- **Project URL**：`https://<ref>.supabase.co`
- **anon key**、**service_role key**

### 2. 開啟 GitHub Pages + 填前端設定
1. GitHub repo → **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
2. 編輯 `frontend/config.js`，填入：
   - `SUPABASE_URL`：`https://<ref>.supabase.co`
   - `SUPABASE_ANON_KEY`：你的 anon key
   - `APP_URL`：`https://<你的帳號>.github.io/housekeeper/`
   - （Tier 0 先不用管 LINE 兩個欄位）
3. commit 並 push 到 `main`（或在 Actions 手動跑 **Deploy frontend to GitHub Pages**）。完成後前端會在 `https://<你的帳號>.github.io/housekeeper/`。
   > 這些都是公開值，放進 repo 沒有安全問題；秘密金鑰不在這。

### 3. 連結 repo 到雲端專案 + 設定 secrets（Tier 0 不需要 LINE）
```bash
supabase login
supabase link --project-ref <ref>

supabase secrets set \
  PUBLIC_APP_URL="https://<你的帳號>.github.io/housekeeper/" \
  NOTIFIER_PROVIDER="log" \
  AFFILIATE_PROVIDER="passthrough" \
  LINE_MONTHLY_QUOTA="200"
```
> `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` 由平台自動注入，不用設。

### 4. 設定 Auth 導回網址
Dashboard → **Authentication → URL Configuration**：
- **Site URL**：`https://<你的帳號>.github.io/housekeeper/`
- **Redirect URLs**：也加入同一個網址（Magic Link 才會導回前端）

### 5. 套用資料庫 + 部署 functions
```bash
supabase db push
supabase functions deploy line-callback dispatch-notifications
```

### 6. 端到端驗證
1. 瀏覽器開 `https://<你的帳號>.github.io/housekeeper/`
2. 用你的 Email 登入 → 收登入信點連結（雲端內建寄信，低量測試 OK；沒收到見下方「Email 注意」）
3. 新增一個品項（週期先設短一點方便測）
4. **讓它到期**：Dashboard → Table editor → `items`，把該列 `next_due_at` 改成過去時間（或把 `created_at` 改成很久以前，trigger 會重算）
5. **dry-run**（不真送、不改資料，先確認撈得到）：
   ```bash
   curl -X POST "https://<ref>.supabase.co/functions/v1/dispatch-notifications?dry_run=1" \
     -H "Authorization: Bearer <service_role_key>"
   ```
   回傳 JSON 應該 `due_items > 0` 且 `preview` 列出品項。
6. **真跑**（log 模式：把訊息印到 function log，並更新資料）：
   ```bash
   curl -X POST "https://<ref>.supabase.co/functions/v1/dispatch-notifications" \
     -H "Authorization: Bearer <service_role_key>"
   ```
7. **看 log**：`supabase functions logs dispatch-notifications`（或 Dashboard → Edge Functions → Logs），應看到：
   ```
   [notifier:log] → <line_user_id 或 (未綁定)>
   🛒 該補貨囉！以下品項差不多該回購了：
   ・<你的品項> ...
   ```
8. 回 Table editor 確認：`items.last_notified_at` 已更新、`next_due_at` 往後推；`notifications` 多一列 `status=sent`。

✅ 到這裡代表整條「登記 → 挑到期 → 產生提醒（含分潤連結）→ 送出 → 更新狀態」都跑通了。

### 7.（選配）啟用每日自動排程
Tier 0 用手動 `curl` 就能驗證；要自動化再做：
```sql
-- SQL Editor 執行
select vault.create_secret('https://<ref>.supabase.co/functions/v1/dispatch-notifications', 'dispatch_url');
select vault.create_secret('<service_role_key>', 'service_role_key');
```
再貼上並執行 `supabase/scripts/enable_cron.sql` 全文，然後：
```sql
select public.schedule_dispatch();   -- 每天 UTC 01:00（台北 09:00）
select * from cron.job;              -- 確認排程已註冊
```

---

## Email 注意
Supabase 內建寄信有速率限制，預設較適合少量/自己測試。要給多人使用時，到
**Authentication → Emails → SMTP** 設定自己的寄信服務（例如 Resend / SendGrid）。

---

## Tier 0 → Tier 1：接真 LINE
1. 申請 **LINE 官方帳號 + Messaging API channel** 與 **LINE Login channel**（見 [README](../README.md) 「部署指南」第 2 步），Login channel 與官方帳號互相連結。
2. LINE Login channel 的 **Callback URL** 設為 `https://<ref>.supabase.co/functions/v1/line-callback`。
3. 補設 secrets 並把 provider 翻成 `line`：
   ```bash
   supabase secrets set \
     NOTIFIER_PROVIDER="line" \
     LINE_CHANNEL_ACCESS_TOKEN="..." \
     LINE_CHANNEL_SECRET="..." \
     LINE_LOGIN_CHANNEL_ID="..." \
     LINE_LOGIN_CHANNEL_SECRET="..." \
     LINE_LOGIN_REDIRECT_URI="https://<ref>.supabase.co/functions/v1/line-callback"
   ```
4. 重新部署 functions：`supabase functions deploy dispatch-notifications line-callback`
5. **更新前端** `frontend/config.js` 的 `LINE_LOGIN_CHANNEL_ID` 與 `LINE_LOGIN_REDIRECT_URI`（= `https://<ref>.supabase.co/functions/v1/line-callback`），push 讓 GitHub Pages 重新發佈。
6. 在網頁「設定」綁定自己的 LINE、加官方帳號好友，讓品項到期後重跑 dispatch → **手機收到提醒**。

> 之後要真的賺分潤（Tier 2）：與 Affiliates.One 簽約拿到憑證，實作 `AffiliatesOneProvider.resolve()`，把 `AFFILIATE_PROVIDER` 設成 `affiliatesone`，重新部署即可，其餘不動。
