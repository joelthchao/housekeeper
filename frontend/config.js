// Public frontend config. These values are safe to commit and are always
// visible in the browser; access control comes from database RLS, not secrecy.
// Never put a service role / secret key here.
window.APP_CONFIG = {
  SUPABASE_URL: "https://jqjpgisybdkopscdxocg.supabase.co",
  // publishable key (sb_publishable_...)
  SUPABASE_ANON_KEY: "sb_publishable_Ti3WMCUcDGnUASYyu3W13A_1mFXkugl",

  // This frontend's own URL (magic-link login redirects back here).
  APP_URL: "https://joelthchao.github.io/housekeeper/",

  // LINE Login channel id (only needed to bind LINE; leave empty otherwise).
  LINE_LOGIN_CHANNEL_ID: "2010756488",

  // LINE bind callback = the Supabase Edge Function (not this frontend).
  LINE_LOGIN_REDIRECT_URI: "https://jqjpgisybdkopscdxocg.supabase.co/functions/v1/line-callback",
};
