// ─────────────────────────────────────────────────────────────
// 前端公開設定。這裡的值都是「公開金鑰」，可以安全提交進 repo、
// 也一定會出現在瀏覽器裡——安全性靠資料庫 RLS，不是靠藏這些值。
// ⚠️ 千萬不要把 service_role key、任何 channel secret 放進來。
//    那些秘密只放在 Supabase Edge Functions（supabase secrets set）。
// ─────────────────────────────────────────────────────────────
window.APP_CONFIG = {
  // Supabase 專案（Settings → API）
  SUPABASE_URL: "https://YOUR-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-KEY",

  // 本前端在 GitHub Pages 上的網址（Magic Link 登入會導回這裡）
  // 專案站點通常是 https://<你的帳號>.github.io/housekeeper/
  APP_URL: "https://YOUR-USER.github.io/housekeeper/",

  // LINE Login channel ID（Tier 1 綁定 LINE 才需要；Tier 0 用 log 通知可留空）
  LINE_LOGIN_CHANNEL_ID: "",

  // LINE 綁定 callback = 你的 Supabase Edge Function（不是這個前端）
  LINE_LOGIN_REDIRECT_URI: "https://YOUR-REF.supabase.co/functions/v1/line-callback",
};
