// 通知抽象層單元測試（不觸網路，只測 log provider 與 registry）。
// Deno：  deno test supabase/functions/_shared/notifier.test.ts
// Node ：  node --experimental-strip-types supabase/functions/_shared/notifier.test.ts
import {
  buildReminderText,
  getNotifier,
  LogNotifier,
} from "./notifier.ts";

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  passed++;
}
const envOf = (m: Record<string, string>) => (k: string) => m[k];

// 預設 provider = log
{
  const n = getNotifier(envOf({}));
  assert(n.name === "log", "未設定時預設 log");
  assert(n.requiresBinding === false, "log 不需綁定");
}

// 可切換成 line
{
  const n = getNotifier(envOf({ NOTIFIER_PROVIDER: "line" }));
  assert(n.name === "line", "NOTIFIER_PROVIDER 可切成 line");
  assert(n.requiresBinding === true, "line 需要綁定");
}

// log provider：無論有無收件人都回 ok（不觸網路）
{
  const n = new LogNotifier();
  const r1 = await n.send("Uxxx", "hello");
  assert(r1.ok && r1.provider === "log", "log 對已綁定回 ok");
  const r2 = await n.send(null, "hello");
  assert(r2.ok, "log 對未綁定也回 ok");
}

// 訊息組字：含品項與連結
{
  const text = buildReminderText([
    { title: "貓砂", url: "https://shop/1" },
    { title: "藥水", url: null },
  ]);
  assert(text.includes("貓砂") && text.includes("https://shop/1"), "含品項與連結");
  assert(text.includes("藥水"), "無連結品項仍列出");
}

console.log(`ok - ${passed} assertions passed`);
