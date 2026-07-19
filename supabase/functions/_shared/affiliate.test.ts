// Run: deno test affiliate.test.ts
//   or node --experimental-strip-types affiliate.test.ts
import {
  getAffiliateProvider,
  isHttpUrl,
  resolveAffiliateUrl,
  searchUrl,
} from "./affiliate.ts";

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FAIL: " + msg);
  passed++;
}

const envOf = (m: Record<string, string>) => (k: string) => m[k];

assert(isHttpUrl("https://shop.example/p/1"), "https is valid");
assert(isHttpUrl("http://shop.example"), "http is valid");
assert(!isHttpUrl("ftp://x"), "ftp is not valid");
assert(!isHttpUrl("not a url"), "garbage is not valid");
assert(!isHttpUrl(""), "empty is not valid");
assert(!isHttpUrl(null), "null is not valid");

{
  const p = getAffiliateProvider(envOf({}));
  assert(p.name === "passthrough", "defaults to passthrough");
}

{
  const r = await resolveAffiliateUrl("https://shop.example/p/1", envOf({}));
  assert(r.url === "https://shop.example/p/1", "passthrough returns original url");
  assert(r.status === "fallback", "passthrough status is fallback");
}

{
  const p = getAffiliateProvider(envOf({ AFFILIATE_PROVIDER: "affiliatesone" }));
  assert(p.name === "affiliatesone", "provider is switchable via env");
}

{
  const r = await resolveAffiliateUrl(
    "https://shop.example/p/2",
    envOf({ AFFILIATE_PROVIDER: "affiliatesone" }),
  );
  assert(r.status === "fallback", "falls back without credentials");
  assert(r.url === "https://shop.example/p/2", "keeps original url on fallback");
}

{
  const r = await resolveAffiliateUrl("javascript:alert(1)", envOf({}));
  assert(r.status === "fallback", "non-http url falls back");
}

{
  const u = searchUrl("貓砂", envOf({}));
  assert(u.indexOf("keyword=") >= 0, "search url has a keyword param");
  assert(u.indexOf(encodeURIComponent("貓砂")) >= 0, "query is url-encoded");
  assert(isHttpUrl(u), "search url is a valid http url");
}
{
  const u = searchUrl("cat litter", envOf({ SEARCH_URL_TEMPLATE: "https://x.test/s?q={q}" }));
  assert(u === "https://x.test/s?q=cat%20litter", "template is overridable");
}

console.log(`ok - ${passed} assertions passed`);
