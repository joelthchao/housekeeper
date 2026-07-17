// ============================================================
// line.ts — LINE Messaging API push message 傳輸層（純 LINE 呼叫）
// 由 notifier.ts 的 LineNotifier 使用；訊息組字在 notifier.ts。
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
