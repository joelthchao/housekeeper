// Pluggable notification sending, selected by NOTIFIER_PROVIDER:
//   "log"  (default) — print the message; no LINE and no user binding required
//   "line"           — push via the LINE Messaging API
// Call sites use getNotifier and never depend on the provider.
import { pushMessage } from "./line.ts";

export interface NotifyResult {
  ok: boolean;
  // Stored in notifications.line_message_id.
  id?: string;
  error?: string;
  provider: string;
}

export interface Notifier {
  readonly name: string;
  // Whether a recipient must be bound (LINE needs it; log does not).
  readonly requiresBinding: boolean;
  send(to: string | null, text: string): Promise<NotifyResult>;
}

export class LogNotifier implements Notifier {
  readonly name = "log";
  readonly requiresBinding = false;
  // deno-lint-ignore require-await
  async send(to: string | null, text: string): Promise<NotifyResult> {
    console.log(
      `[notifier:log] -> ${to ?? "(unbound)"}\n${text}\n----------------------`,
    );
    return { ok: true, id: "log-" + Date.now(), provider: this.name };
  }
}

export class LineNotifier implements Notifier {
  readonly name = "line";
  readonly requiresBinding = true;
  private token: string;
  constructor(channelAccessToken: string) {
    this.token = channelAccessToken;
  }
  async send(to: string | null, text: string): Promise<NotifyResult> {
    if (!to) return { ok: false, error: "missing line_user_id", provider: this.name };
    const r = await pushMessage(to, [{ type: "text", text }], this.token);
    return { ok: r.ok, id: r.requestId, error: r.error, provider: this.name };
  }
}

export function getNotifier(env: (key: string) => string | undefined): Notifier {
  const name = (env("NOTIFIER_PROVIDER") ?? "log").toLowerCase();
  switch (name) {
    case "line":
      return new LineNotifier(env("LINE_CHANNEL_ACCESS_TOKEN") ?? "");
    default:
      return new LogNotifier();
  }
}

// User-facing copy stays in the product's language (zh-Hant).
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
