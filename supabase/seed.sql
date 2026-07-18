-- Local dev seed (for `supabase db reset`). Do not run against production.
-- Creates one test user and one already-due item so dispatch has something to pick.

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

-- handle_new_user() created the profile; set a placeholder LINE binding.
-- (Fake id: fine for the log notifier / dry runs, not for real pushes.)
update public.profiles
set line_user_id = 'Udemotestuser0000000000000000000',
    line_display_name = 'Demo User',
    notify_enabled = true
where id = '00000000-0000-0000-0000-0000000000aa';

-- Old created_at + 30 day interval => already past due.
insert into public.items (user_id, title, source_url, interval_days, created_at)
values (
  '00000000-0000-0000-0000-0000000000aa',
  'Test item: cat litter',
  'https://www.example.com/product/cat-litter',
  30,
  '2020-01-01T00:00:00Z'
)
on conflict do nothing;
