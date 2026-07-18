// ============================================================
// dispatch-notifications — 每日排程推播（由 Supabase Cron 呼叫）
//
// 流程：
//   1. 驗證呼叫者帶了 service role key
//   2. 撈出到期且啟用的品項（next_due_at <= now），對應到有綁 LINE、
//      且開啟通知的使用者
//   3. 需要時解析分潤連結（可插拔抽象層）
//   4. 依免費額度護欄，將同一使用者的多品項合併成一則 LINE 推播
//   5. 成功後更新 last_notified_at（trigger 重算 next_due_at）並寫 log
//
// 支援 dry_run：只回報將發送的內容，不真的送 LINE、不改資料。
//   POST body: {"dry_run": true}  或  ?dry_run=1
// ============================================================
import { adminClient } from "../_shared/supabaseAdmin.ts";
import { buildReminderText, getNotifier } from "../_shared/notifier.ts";
import { resolveAffiliateUrl } from "../_shared/affiliate.ts";

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
  // 1. 授權：只接受帶 service role key 的呼叫（Cron 會帶）
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

  // 2a. 撈到期且啟用的品項
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

  // 2b. 撈這些使用者中「開啟通知」的 profile
  //     line provider 需已綁定 line_user_id；log provider 不需要。
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

  // 依使用者分組（只留可通知的）
  const byUser = new Map<string, DueItem[]>();
  for (const it of dueItems) {
    if (!profileMap.has(it.user_id)) continue;
    if (!byUser.has(it.user_id)) byUser.set(it.user_id, []);
    byUser.get(it.user_id)!.push(it);
  }
  summary.users_considered = byUser.size;

  // 當月已成功送出的訊息數（額度護欄）
  const { count: sentThisMonth } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", startOfMonthUtcIso());
  let sentCount = sentThisMonth ?? 0;

  const preview: Record<string, string[]> = {};

  for (const [uid, userItems] of byUser) {
    const profile = profileMap.get(uid)!;

    // 3. 解析分潤連結（缺 affiliate_url 或仍是 fallback 且有原連結時重試）
    const linkItems: { title: string; url: string | null }[] = [];
    for (const it of userItems) {
      let url = it.affiliate_url;
      if ((!url || it.affiliate_status === "fallback") && it.source_url) {
        const r = await resolveAffiliateUrl(it.source_url, env);
        url = r.url;
        if (!dryRun) {
          await sb.from("items").update({
            affiliate_url: r.url,
            affiliate_provider: r.provider,
            affiliate_status: r.status,
          }).eq("id", it.id);
        }
      }
      linkItems.push({ title: it.title, url: url ?? it.source_url });
    }

    const text = buildReminderText(linkItems);

    // 4. 額度護欄：每位使用者 1 則
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

    // 5. 送出（依 NOTIFIER_PROVIDER：log 只印 log、line 真的推播）
    const result = await notifier.send(profile.line_user_id, text);

    if (result.ok) {
      sentCount++;
      summary.messages_sent++;
      // 推進每個品項的 last_notified_at（trigger 會重算 next_due_at）
      const ids = userItems.map((i) => i.id);
      await sb.from("items").update({ last_notified_at: nowIso }).in("id", ids);
      await sb.from("notifications").insert({
        user_id: uid,
        status: "sent",
        line_message_id: result.id ?? null,
      });
    } else {
      summary.failed++;
      // 失敗不推進 next_due_at，下次排程會再試
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
