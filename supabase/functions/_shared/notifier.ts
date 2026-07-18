// ============================================================
// notifier.ts — 可插拔的「送出通知」抽象層
//
// 用 NOTIFIER_PROVIDER 環境變數切換：
//   - "log"（預設 / MVP）：只把要送的內容印到 log，不真的送，也不需綁定
//   - "line"：透過 LINE Messaging API 真的推播（需綁定 line_user_id）
//
// 跟分潤抽象層一樣：之後只要換 provider，dispatch-notifications 不用改。
// ============================================================
import { pushMessage } from "./line.ts";

export interface NotifyResult {
  ok: boolean;
  /** 成功時的訊息 / 請求識別碼（存進 notifications.line_message_id） */
  id?: string;
  error?: string;
  provider: string;
}

export interface Notifier {
  readonly name: string;
  /** 是否需要使用者已綁定收件人（LINE 需要；log 不需要） */
  readonly requiresBinding: boolean;
  send(to: string | null, text: string): Promise<NotifyResult>;
}

// ------------------------------------------------------------
// log：只印 log（MVP，尚未接 LINE 時用）
// ------------------------------------------------------------
export class LogNotifier implements Notifier {
  readonly name = "log";
  readonly requiresBinding = false;
  // deno-lint-ignore require-await
  async send(to: string | null, text: string): Promise<NotifyResult> {
    console.log(
      `[notifier:log] → ${to ?? "(未綁定)"}\n${text}\n----------------------`,
    );
    return { ok: true, id: "log-" + Date.now(), provider: this.name };
  }
}

// ------------------------------------------------------------
// line：真的透過 LINE Messaging API 推播
// ------------------------------------------------------------
export class LineNotifier implements Notifier {
  readonly name = "line";
  readonly requiresBinding = true;
  private token: string;
  constructor(channelAccessToken: string) {
    this.token = channelAccessToken;
  }
  async send(to: string | null, text: string): Promise<NotifyResult> {
    if (!to) return { ok: false, error: "缺少 line_user_id", provider: this.name };
    const r = await pushMessage(to, [{ type: "text", text }], this.token);
    return { ok: r.ok, id: r.requestId, error: r.error, provider: this.name };
  }
}

/** 依環境變數建立目前選用的 notifier（registry pattern） */
export function getNotifier(env: (key: string) => string | undefined): Notifier {
  const name = (env("NOTIFIER_PROVIDER") ?? "log").toLowerCase();
  switch (name) {
    case "line":
      return new LineNotifier(env("LINE_CHANNEL_ACCESS_TOKEN") ?? "");
    case "log":
    default:
      return new LogNotifier();
  }
}

/** 把一位使用者的多個到期品項組成一則提醒文字（與 provider 無關）。 */
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
