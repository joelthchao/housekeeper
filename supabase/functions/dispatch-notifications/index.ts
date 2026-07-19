// Daily job, triggered by pg_cron.
//   1. require the caller to present the service role key
//   2. find active items whose next_due_at has passed, for users who have
//      notifications enabled (LINE binding required only for the line provider)
//   3. resolve the affiliate link
//   4. send one message per user, respecting the monthly quota
//   5. advance last_notified_at (trigger recomputes next_due_at) and log the send
//
// dry_run (?dry_run=1 or {"dry_run": true}) reports what would be sent without
// sending or writing anything.
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { buildReminderText, getNotifier } from "../_shared/notifier.ts";
import { resolveAffiliateUrl, searchUrl } from "../_shared/affiliate.ts";

const env = (k: string) => Deno.env.get(k) ?? "";

interface DueItem {
  id: string;
  user_id: string;
  title: string;
  source_url: string | null;
  affiliate_url: string | null;
  affiliate_status: string | null;
}

interface Profile {
  id: string;
  line_user_id: string | null;
  notify_enabled: boolean;
}

function startOfMonthUtcIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function isDryRun(req: Request): Promise<boolean> {
  const url = new URL(req.url);
  if (url.searchParams.get("dry_run")) return true;
  try {
    const body = await req.clone().json();
    return body?.dry_run === true;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get("Authorization") ?? "";
  if (auth !== "Bearer " + env("SUPABASE_SERVICE_ROLE_KEY")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const dryRun = await isDryRun(req);
  const sb = adminClient();
  const nowIso = new Date().toISOString();
  const quota = parseInt(env("LINE_MONTHLY_QUOTA") || "200", 10);
  const notifier = getNotifier(env);

  const summary = {
    dry_run: dryRun,
    notifier: notifier.name,
    due_items: 0,
    users_considered: 0,
    messages_sent: 0,
    skipped_quota: 0,
    failed: 0,
  };

  const { data: items, error: itemsErr } = await sb
    .from("items")
    .select("id,user_id,title,source_url,affiliate_url,affiliate_status")
    .eq("active", true)
    .lte("next_due_at", nowIso);
  if (itemsErr) {
    return new Response(JSON.stringify({ error: itemsErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const dueItems = (items ?? []) as DueItem[];
  summary.due_items = dueItems.length;
  if (dueItems.length === 0) {
    return new Response(JSON.stringify(summary), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const userIds = [...new Set(dueItems.map((i) => i.user_id))];
  let profQuery = sb
    .from("profiles")
    .select("id,line_user_id,notify_enabled")
    .in("id", userIds)
    .eq("notify_enabled", true);
  if (notifier.requiresBinding) {
    profQuery = profQuery.not("line_user_id", "is", null);
  }
  const { data: profs } = await profQuery;
  const profileMap = new Map<string, Profile>(
    ((profs ?? []) as Profile[]).map((p) => [p.id, p]),
  );

  const byUser = new Map<string, DueItem[]>();
  for (const it of dueItems) {
    if (!profileMap.has(it.user_id)) continue;
    if (!byUser.has(it.user_id)) byUser.set(it.user_id, []);
    byUser.get(it.user_id)!.push(it);
  }
  summary.users_considered = byUser.size;

  const { count: sentThisMonth } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", startOfMonthUtcIso());
  let sentCount = sentThisMonth ?? 0;

  const preview: Record<string, string[]> = {};

  for (const [uid, userItems] of byUser) {
    const profile = profileMap.get(uid)!;

    // Resolve the link, refreshing rows still on the passthrough fallback.
    // No explicit source_url -> search the item name on a shopping site.
    const linkItems: { title: string; url: string | null }[] = [];
    for (const it of userItems) {
      const base = it.source_url || searchUrl(it.title, env);
      let url = it.affiliate_url;
      if (!url || it.affiliate_status === "fallback") {
        const r = await resolveAffiliateUrl(base, env);
        url = r.url;
        if (!dryRun) {
          await sb.from("items").update({
            affiliate_url: r.url,
            affiliate_provider: r.provider,
            affiliate_status: r.status,
          }).eq("id", it.id);
        }
      }
      linkItems.push({ title: it.title, url: url ?? base });
    }

    const text = buildReminderText(linkItems);

    // One message per user.
    if (sentCount + 1 > quota) {
      summary.skipped_quota++;
      if (!dryRun) {
        await sb.from("notifications").insert({
          user_id: uid,
          status: "skipped_quota",
          error: `monthly quota ${quota} reached`,
        });
      }
      continue;
    }

    if (dryRun) {
      preview[uid] = linkItems.map((l) => l.title);
      continue;
    }

    const result = await notifier.send(profile.line_user_id, text);
    if (result.ok) {
      sentCount++;
      summary.messages_sent++;
      const ids = userItems.map((i) => i.id);
      await sb.from("items").update({ last_notified_at: nowIso }).in("id", ids);
      await sb.from("notifications").insert({
        user_id: uid,
        status: "sent",
        line_message_id: result.id ?? null,
      });
    } else {
      // Leave next_due_at unchanged so the next run retries.
      summary.failed++;
      await sb.from("notifications").insert({
        user_id: uid,
        status: "failed",
        error: result.error ?? `HTTP ${result.status}`,
      });
    }
  }

  return new Response(
    JSON.stringify(dryRun ? { ...summary, preview } : summary, null, 2),
    { headers: { "Content-Type": "application/json" } },
  );
});
