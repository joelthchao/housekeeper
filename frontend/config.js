// ─────────────────────────────────────────────────────────────
// 前端公開設定。這裡的值都是「公開金鑰」，可以安全提交進 repo、
// 也一定會出現在瀏覽器裡——安全性靠資料庫 RLS，不是靠藏這些值。
// ⚠️ 千萬不要把 secret key（sb_secret_… / service_role）放進來。
//    那些秘密只放在 Supabase Edge Functions（secrets）。
// ─────────────────────────────────────────────────────────────
window.APP_CONFIG = {
  // Supabase 專案（Settings → API）
  SUPABASE_URL: "https://jqjpgisybdkopscdxocg.supabase.co",
  // publishable key（sb_publishable_…）＝新版公開客戶端金鑰
  SUPABASE_ANON_KEY: "sb_publishable_Ti3WMCUcDGnUASYyu3W13A_1mFXkugl",

  // 本前端在 GitHub Pages 上的網址（Magic Link 登入會導回這裡）
  APP_URL: "https://joelthchao.github.io/housekeeper/",

  // LINE Login channel ID（Tier 1 綁定 LINE 才需要；Tier 0 用 log 通知可留空）
  LINE_LOGIN_CHANNEL_ID: "",

  // LINE 綁定 callback = 你的 Supabase Edge Function（不是這個前端）
  LINE_LOGIN_REDIRECT_URI: "https://jqjpgisybdkopscdxocg.supabase.co/functions/v1/line-callback",
};
