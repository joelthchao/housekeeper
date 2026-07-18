// ============================================================
// line-callback — LINE Login OAuth 2.1 導回端點
//
// 前端把使用者的 Supabase access token 當作 state 送去 LINE，
// LINE 完成登入後帶著 code + state 導回這裡。流程：
//   1. 用 state（access token）驗證是哪個 Supabase 使用者
//   2. 用 code 向 LINE 換 id_token，取出 sub = line_user_id
//   3. 用 service role 把 line_user_id 寫回該使用者的 profile
//   4. 導回前端 #/settings?line=ok
// ============================================================
import { adminClient, getUserFromToken } from "../_shared/supabaseAdmin.ts";

const env = (k: string) => Deno.env.get(k) ?? "";

function base64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface LineIdPayload {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  name?: string;
  picture?: string;
}

// 驗證 LINE id_token（HS256，以 Login channel secret 簽章）並回傳 payload。
async function verifyLineIdToken(
  idToken: string,
  channelId: string,
  channelSecret: string,
): Promise<LineIdPayload> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("id_token 格式錯誤");
  const [h, p, sig] = parts;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    base64urlToBytes(sig),
    enc.encode(h + "." + p),
  );
  if (!ok) throw new Error("id_token 簽章驗證失敗");

  const payload = JSON.parse(
    new TextDecoder().decode(base64urlToBytes(p)),
  ) as LineIdPayload;

  if (payload.iss !== "https://access.line.me") throw new Error("iss 不符");
  if (payload.aud !== channelId) throw new Error("aud 不符");
  if (payload.exp * 1000 < Date.now()) throw new Error("id_token 已過期");
  return payload;
}

function redirectBack(status: "ok" | "err"): Response {
  const app = env("PUBLIC_APP_URL");
  return new Response(null, {
    status: 302,
    headers: { Location: `${app}#/settings?line=${status}` },
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateToken = url.searchParams.get("state");
  const lineError = url.searchParams.get("error");

  if (lineError || !code || !stateToken) return redirectBack("err");

  try {
    // 1. state = Supabase access token → 找出使用者
    const user = await getUserFromToken(stateToken);
    if (!user) return redirectBack("err");

    // 2. 用 code 換 LINE token
    const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: env("LINE_LOGIN_REDIRECT_URI"),
        client_id: env("LINE_LOGIN_CHANNEL_ID"),
        client_secret: env("LINE_LOGIN_CHANNEL_SECRET"),
      }),
    });
    if (!tokenRes.ok) {
      console.error("LINE token 交換失敗", await tokenRes.text());
      return redirectBack("err");
    }
    const token = await tokenRes.json();
    if (!token.id_token) return redirectBack("err");

    // 3. 驗證並解出 line_user_id
    const payload = await verifyLineIdToken(
      token.id_token,
      env("LINE_LOGIN_CHANNEL_ID"),
      env("LINE_LOGIN_CHANNEL_SECRET"),
    );

    // 4. service role 寫回 profile
    const sb = adminClient();
    const { error } = await sb
      .from("profiles")
      .update({
        line_user_id: payload.sub,
        line_display_name: payload.name ?? null,
      })
      .eq("id", user.id);

    // line_user_id 具唯一性；若已被別的帳號綁定會在此失敗
    if (error) {
      console.error("寫入 profile 失敗", error.message);
      return redirectBack("err");
    }
    return redirectBack("ok");
  } catch (e) {
    console.error("line-callback 例外", e instanceof Error ? e.message : e);
    return redirectBack("err");
  }
});
