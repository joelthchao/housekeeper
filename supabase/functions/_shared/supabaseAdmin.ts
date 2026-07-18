// ============================================================
// supabaseAdmin.ts — service role client（繞過 RLS，供排程 / callback 使用）
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function must(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`缺少環境變數 ${key}`);
  return v;
}

/** service role client：可繞過 RLS，僅用於伺服器端 function。 */
export function adminClient(): SupabaseClient {
  return createClient(must("SUPABASE_URL"), must("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** 用 anon client 驗證使用者的 access token，回傳 user（失敗回 null）。 */
export async function getUserFromToken(accessToken: string) {
  const anon = createClient(must("SUPABASE_URL"), must("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return data.user;
}
