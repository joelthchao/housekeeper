-- ============================================================
-- 0002_rls.sql — Row Level Security
-- 使用者只能存取自己的資料；service role（排程 function）繞過 RLS。
-- ============================================================

alter table public.profiles      enable row level security;
alter table public.items         enable row level security;
alter table public.notifications enable row level security;

-- ------------------------------------------------------------
-- profiles：本人可讀寫自己那筆（id = auth.uid()）
-- ------------------------------------------------------------
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 註冊時由 handle_new_user() trigger 建立 profile；
-- 保留 insert policy 以防手動補建。
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ------------------------------------------------------------
-- items：本人 CRUD 自己的品項
-- ------------------------------------------------------------
create policy "items_select_own"
  on public.items for select
  using (auth.uid() = user_id);

create policy "items_insert_own"
  on public.items for insert
  with check (auth.uid() = user_id);

create policy "items_update_own"
  on public.items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "items_delete_own"
  on public.items for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- notifications：本人唯讀自己的推播紀錄；寫入僅限 service role
-- ------------------------------------------------------------
create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);
