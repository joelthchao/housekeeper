-- ============================================================
-- seed.sql — 本機開發測試資料（僅供 `supabase db reset` 本機使用）
-- 建立一個測試使用者 + 一個「已到期」的品項，方便測 dispatch-notifications。
-- ⚠️ 請勿在正式環境執行。
-- ============================================================

-- 固定測試 UUID
-- 使用者：00000000-0000-0000-0000-0000000000aa
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-0000000000aa',
  'authenticated', 'authenticated', 'demo@example.com',
  crypt('demo-password', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}'
)
on conflict (id) do nothing;

-- handle_new_user() trigger 會自動建立 profile；補上 LINE 綁定與通知開關。
-- （line_user_id 為假值，僅供 dry-run；真送需真實的 LINE userId）
update public.profiles
set line_user_id = 'Udemotestuser0000000000000000000',
    line_display_name = 'Demo User',
    notify_enabled = true
where id = '00000000-0000-0000-0000-0000000000aa';

-- 一個「已到期」的品項：created_at 設在很久以前 + 30 天週期 → next_due 早已過。
insert into public.items (user_id, title, source_url, interval_days, created_at)
values (
  '00000000-0000-0000-0000-0000000000aa',
  '測試品項：貓砂',
  'https://www.example.com/product/cat-litter',
  30,
  '2020-01-01T00:00:00Z'
)
on conflict do nothing;
