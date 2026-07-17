// 分潤抽象層單元測試。
// 可用 Deno 執行：  deno test supabase/functions/_shared/affiliate.test.ts
// 或用 Node 22 執行： node --experimental-strip-types supabase/functions/_shared/affiliate.test.ts
import {
  getAffiliateProvider,
  isHttpUrl,
  resolveAffiliateUrl,
} from "./affiliate.ts";

// 極簡斷言（不依賴測試框架，Deno / Node 皆可跑）
let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  passed++;
}

const envOf = (m: Record<string, string>) => (k: string) => m[k];

// isHttpUrl
assert(isHttpUrl("https://shop.example/p/1"), "https 視為有效");
assert(isHttpUrl("http://shop.example"), "http 視為有效");
assert(!isHttpUrl("ftp://x"), "ftp 非有效");
assert(!isHttpUrl("not a url"), "亂字串非有效");
assert(!isHttpUrl(""), "空字串非有效");
assert(!isHttpUrl(null), "null 非有效");

// 預設 provider = passthrough
{
  const p = getAffiliateProvider(envOf({}));
  assert(p.name === "passthrough", "未設定時預設 passthrough");
}

// passthrough：回傳原連結 + fallback
{
  const r = await resolveAffiliateUrl("https://shop.example/p/1", envOf({}));
  assert(r.url === "https://shop.example/p/1", "passthrough 回傳原連結");
  assert(r.status === "fallback", "passthrough 狀態為 fallback");
  assert(r.provider === "passthrough", "provider 名稱正確");
}

// 切換 env 可換 provider
{
  const p = getAffiliateProvider(envOf({ AFFILIATE_PROVIDER: "affiliatesone" }));
  assert(p.name === "affiliatesone", "AFFILIATE_PROVIDER 可切換 provider");
}

// affiliatesone 無憑證時安全退回 fallback
{
  const r = await resolveAffiliateUrl(
    "https://shop.example/p/2",
    envOf({ AFFILIATE_PROVIDER: "affiliatesone" }),
  );
  assert(r.status === "fallback", "無憑證時退回 fallback");
  assert(r.url === "https://shop.example/p/2", "退回時保留原連結");
}

// 非 http 連結一律 fallback，不丟例外
{
  const r = await resolveAffiliateUrl("javascript:alert(1)", envOf({}));
  assert(r.status === "fallback", "非 http 連結 fallback");
}

console.log(`ok - ${passed} assertions passed`);
