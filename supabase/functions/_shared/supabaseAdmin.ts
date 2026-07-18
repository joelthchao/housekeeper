// Service-role client (bypasses RLS) for server-side functions only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function must(key: string): string {
  const v = Deno.env.get(key);
  if (!v) throw new Error(`missing env ${key}`);
  return v;
}

export function adminClient(): SupabaseClient {
  return createClient(must("SUPABASE_URL"), must("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Validate a user's access token; returns the user, or null if invalid.
export async function getUserFromToken(accessToken: string) {
  const anon = createClient(must("SUPABASE_URL"), must("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.getUser(accessToken);
  if (error || !data?.user) return null;
  return data.user;
}
