// Send a single test reminder to the logged-in user's own LINE.
// Called from the app with the user's auth token; a user can only notify
// themselves, so no service-role key is exposed to the browser.
import { adminClient, getUserFromToken } from "../_shared/supabaseAdmin.ts";
import { buildReminderText, getNotifier } from "../_shared/notifier.ts";

const env = (k: string) => Deno.env.get(k) ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const authz = req.headers.get("Authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  const user = token ? await getUserFromToken(token) : null;
  if (!user) return json({ ok: false, error: "unauthorized" }, 401);

  const sb = adminClient();
  const { data: profile } = await sb
    .from("profiles")
    .select("line_user_id")
    .eq("id", user.id)
    .maybeSingle();

  const notifier = getNotifier(env);
  if (notifier.requiresBinding && !profile?.line_user_id) {
    return json({ ok: false, error: "not_bound" });
  }

  const text = buildReminderText([{ title: "測試品項", url: null }]);
  const result = await notifier.send(profile?.line_user_id ?? null, text);
  return json({ ok: result.ok, provider: result.provider, error: result.error });
});
