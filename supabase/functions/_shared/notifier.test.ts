// Covers the log provider and registry only (no network).
import { buildReminderText, getNotifier, LogNotifier } from "./notifier.ts";

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  passed++;
}
const envOf = (m: Record<string, string>) => (k: string) => m[k];

{
  const n = getNotifier(envOf({}));
  assert(n.name === "log", "defaults to log");
  assert(n.requiresBinding === false, "log needs no binding");
}

{
  const n = getNotifier(envOf({ NOTIFIER_PROVIDER: "line" }));
  assert(n.name === "line", "switchable to line via env");
  assert(n.requiresBinding === true, "line requires binding");
}

{
  const n = new LogNotifier();
  const r1 = await n.send("Uxxx", "hello");
  assert(r1.ok && r1.provider === "log", "log succeeds when bound");
  const r2 = await n.send(null, "hello");
  assert(r2.ok, "log succeeds when unbound");
}

{
  const text = buildReminderText([
    { title: "貓砂", url: "https://shop/1" },
    { title: "藥水", url: null },
  ]);
  assert(text.includes("貓砂") && text.includes("https://shop/1"), "includes item and link");
  assert(text.includes("藥水"), "lists item without a link");
}

console.log(`ok - ${passed} assertions passed`);
