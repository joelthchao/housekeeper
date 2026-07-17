// ============================================================
// line.ts — LINE Messaging API push message 封裝
// 文件：https://developers.line.biz/en/reference/messaging-api/#send-push-message
// 免費方案每月 200 則；1 次 push 給 1 位使用者算 1 則。
// ============================================================

export interface LineTextMessage {
  type: "text";
  text: string;
}

export interface PushResult {
  ok: boolean;
  status: number;
  requestId?: string;
  error?: string;
}

/** 推播一則（或多則）訊息給單一使用者。 */
export async function pushMessage(
  to: string,
  messages: LineTextMessage[],
  channelAccessToken: string,
): Promise<PushResult> {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + channelAccessToken,
    },
    body: JSON.stringify({ to, messages }),
  });

  const requestId = res.headers.get("x-line-request-id") ?? undefined;
  if (res.ok) return { ok: true, status: res.status, requestId };

  let error = `HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (body?.message) error = body.message;
  } catch { /* 忽略非 JSON 回應 */ }
  return { ok: false, status: res.status, requestId, error };
}

/** 把一位使用者的多個到期品項組成一則提醒文字訊息。 */
export function buildReminderText(
  items: { title: string; url: string | null }[],
): string {
  const lines = ["🛒 該補貨囉！以下品項差不多該回購了：", ""];
  for (const it of items) {
    lines.push("・" + it.title);
    if (it.url) lines.push(it.url);
  }
  lines.push("");
  lines.push("— 定期補貨提醒");
  return lines.join("\n");
}
