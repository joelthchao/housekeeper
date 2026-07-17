-- ============================================================
-- 0001_schema.sql — 資料表、trigger、索引
-- ============================================================

-- gen_random_uuid() 在 Postgres 13+ 內建；Supabase 亦提供 pgcrypto
create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------
-- 共用：自動維護 updated_at
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- profiles：對應 auth.users 的使用者設定
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  line_user_id      text unique,
  line_display_name text,
  notify_enabled    boolean not null default true,
  timezone          text not null default 'Asia/Taipei',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 新使用者註冊時自動建立 profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- items：登記的補貨品項
-- ------------------------------------------------------------
create table if not exists public.items (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 200),
  source_url         text,
  affiliate_url      text,
  affiliate_provider text,
  affiliate_status   text check (affiliate_status in ('ok', 'fallback', 'pending')),
  interval_days      int not null check (interval_days > 0 and interval_days <= 3650),
  last_notified_at   timestamptz,
  next_due_at        timestamptz not null default now(),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- next_due_at = coalesce(last_notified_at, created_at) + interval_days 天
create or replace function public.compute_next_due_at()
returns trigger
language plpgsql
as $$
begin
  new.next_due_at :=
    coalesce(new.last_notified_at, new.created_at, now())
    + make_interval(days => new.interval_days);
  return new;
end;
$$;

create trigger trg_items_next_due
  before insert or update of interval_days, last_notified_at, created_at
  on public.items
  for each row execute function public.compute_next_due_at();

create trigger trg_items_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

create index if not exists idx_items_user on public.items (user_id);
-- 排程撈取「到期且啟用」品項的主要索引
create index if not exists idx_items_due on public.items (next_due_at) where active;

-- ------------------------------------------------------------
-- notifications：推播紀錄（防重複 + 觀察免費額度）
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid references public.items (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  sent_at         timestamptz not null default now(),
  line_message_id text,
  -- sent：已送出；failed：LINE 回錯；skipped_quota：額度用罄跳過；dry_run：測試模式
  status          text not null check (status in ('sent', 'failed', 'skipped_quota', 'dry_run')),
  error           text
);

create index if not exists idx_notifications_user_time on public.notifications (user_id, sent_at desc);
-- 計算當月已成功送出則數（免費額度護欄）用
create index if not exists idx_notifications_sent_at on public.notifications (sent_at) where status = 'sent';
