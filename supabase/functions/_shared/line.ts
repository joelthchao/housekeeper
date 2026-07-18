// LINE Messaging API push transport. Used by LineNotifier.
// https://developers.line.biz/en/reference/messaging-api/#send-push-message
// Free tier: 200 messages/month; one push to one user counts as one.

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
  } catch { /* non-JSON error body */ }
  return { ok: false, status: res.status, requestId, error };
}
