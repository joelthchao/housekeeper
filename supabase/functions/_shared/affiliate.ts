// Pluggable affiliate-link resolution, selected by AFFILIATE_PROVIDER:
//   "passthrough" (default) — return the original URL
//   "affiliatesone"         — turn it into an Affiliates.One deeplink
// Call sites use resolveAffiliateUrl and never depend on the provider.

export type AffiliateStatus = "ok" | "fallback";

export interface AffiliateResult {
  url: string;
  // "ok": a real affiliate link. "fallback": the original URL.
  status: AffiliateStatus;
  provider: string;
}

export interface AffiliateProvider {
  readonly name: string;
  resolve(sourceUrl: string): Promise<AffiliateResult>;
}

// Turn an item name into a shopping-site search URL. No datafeed/scraping —
// the user lands on search results for the term. SEARCH_URL_TEMPLATE overrides
// the site; {q} is the URL-encoded query.
export function searchUrl(
  query: string,
  env: (key: string) => string | undefined,
): string {
  const tmpl = env("SEARCH_URL_TEMPLATE") ||
    "https://www.momoshop.com.tw/search/searchShop.jsp?keyword={q}";
  return tmpl.replace("{q}", encodeURIComponent(query.trim()));
}

export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export class PassthroughProvider implements AffiliateProvider {
  readonly name = "passthrough";
  // deno-lint-ignore require-await
  async resolve(sourceUrl: string): Promise<AffiliateResult> {
    return { url: sourceUrl, status: "fallback", provider: this.name };
  }
}

// Requires AFFILIATESONE_API_KEY / AFFILIATESONE_SITE_ID. Not implemented yet;
// returns the original URL until the deeplink call is added.
export class AffiliatesOneProvider implements AffiliateProvider {
  readonly name = "affiliatesone";
  private readonly apiKey: string;
  private readonly siteId: string;

  constructor(apiKey: string, siteId: string) {
    this.apiKey = apiKey;
    this.siteId = siteId;
  }

  // deno-lint-ignore require-await
  async resolve(sourceUrl: string): Promise<AffiliateResult> {
    return { url: sourceUrl, status: "fallback", provider: this.name };
  }
}

export function getAffiliateProvider(
  env: (key: string) => string | undefined,
): AffiliateProvider {
  const name = (env("AFFILIATE_PROVIDER") ?? "passthrough").toLowerCase();
  switch (name) {
    case "affiliatesone":
      return new AffiliatesOneProvider(
        env("AFFILIATESONE_API_KEY") ?? "",
        env("AFFILIATESONE_SITE_ID") ?? "",
      );
    default:
      return new PassthroughProvider();
  }
}

// Non-http(s) input is never rewritten.
export async function resolveAffiliateUrl(
  sourceUrl: string | null | undefined,
  env: (key: string) => string | undefined,
): Promise<AffiliateResult> {
  const provider = getAffiliateProvider(env);
  if (!isHttpUrl(sourceUrl)) {
    return { url: sourceUrl ?? "", status: "fallback", provider: provider.name };
  }
  return provider.resolve(sourceUrl);
}
