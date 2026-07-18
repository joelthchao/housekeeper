// ============================================================
// affiliate.ts — 可插拔的分潤（聯盟行銷）連結抽象層
//
// 用 AFFILIATE_PROVIDER 環境變數切換 provider：
//   - "passthrough"（預設 / MVP）：原連結直傳，status='fallback'
//   - "affiliatesone"（預留）：呼叫聯盟網 API 產生真正的分潤連結
//
// 拿到聯盟網憑證後，只要新增一個 provider、把 AFFILIATE_PROVIDER 改掉即可，
// 呼叫端（新增品項、排程推播）完全不用改。
// ============================================================

export type AffiliateStatus = "ok" | "fallback";

export interface AffiliateResult {
  /** 最終要給使用者點的連結 */
  url: string;
  /** ok = 真的分潤連結；fallback = 退回原連結 */
  status: AffiliateStatus;
  /** 實際採用的 provider 名稱 */
  provider: string;
}

export interface AffiliateProvider {
  readonly name: string;
  resolve(sourceUrl: string): Promise<AffiliateResult>;
}

/** 判斷是否為合理的 http(s) 連結 */
export function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// passthrough：原連結直傳（MVP 用；尚未有聯盟網憑證時）
// ------------------------------------------------------------
export class PassthroughProvider implements AffiliateProvider {
  readonly name = "passthrough";
  // deno-lint-ignore require-await
  async resolve(sourceUrl: string): Promise<AffiliateResult> {
    return { url: sourceUrl, status: "fallback", provider: this.name };
  }
}

// ------------------------------------------------------------
// affiliatesone：聯盟網 Affiliates.One deeplink（預留骨架）
// 需要 AFFILIATESONE_API_KEY / AFFILIATESONE_SITE_ID。
// 目前無憑證，resolve 失敗時安全退回原連結（fallback）。
// ------------------------------------------------------------
export class AffiliatesOneProvider implements AffiliateProvider {
  readonly name = "affiliatesone";
  private readonly apiKey: string;
  private readonly siteId: string;

  constructor(apiKey: string, siteId: string) {
    this.apiKey = apiKey;
    this.siteId = siteId;
  }

  async resolve(sourceUrl: string): Promise<AffiliateResult> {
    // TODO: 依聯盟網實際 API 規格實作 deeplink 產生。
    // 簽約後窗口會提供 Site ID / API KEY / Offer ID 與端點文件。
    // 在真正串接前，先安全退回原連結，避免給出壞連結。
    try {
      if (!this.apiKey || !this.siteId) {
        return { url: sourceUrl, status: "fallback", provider: this.name };
      }
      // const res = await fetch(`https://api.affiliates.one/deeplink?...`, {...});
      // const data = await res.json();
      // return { url: data.deeplink, status: "ok", provider: this.name };
      return { url: sourceUrl, status: "fallback", provider: this.name };
    } catch {
      return { url: sourceUrl, status: "fallback", provider: this.name };
    }
  }
}

/** 依環境變數建立目前選用的 provider（registry pattern） */
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
    case "passthrough":
    default:
      return new PassthroughProvider();
  }
}

/**
 * 解析分潤連結：給定原始電商連結，回傳要推播的連結與狀態。
 * 非 http(s) 連結一律不處理，直接 fallback。
 */
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
