// LINE Login OAuth 2.1 callback.
// The frontend passes the user's Supabase access token as `state`. Here we:
//   1. identify the Supabase user from `state`
//   2. exchange `code` for an id_token and read the LINE user id (sub)
//   3. store it on the user's profile (service role)
//   4. redirect back to the frontend
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

// Verify the LINE id_token (HS256, signed with the Login channel secret).
async function verifyLineIdToken(
  idToken: string,
  channelId: string,
  channelSecret: string,
): Promise<LineIdPayload> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("malformed id_token");
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
  if (!ok) throw new Error("bad id_token signature");

  const payload = JSON.parse(
    new TextDecoder().decode(base64urlToBytes(p)),
  ) as LineIdPayload;

  if (payload.iss !== "https://access.line.me") throw new Error("bad iss");
  if (payload.aud !== channelId) throw new Error("bad aud");
  if (payload.exp * 1000 < Date.now()) throw new Error("id_token expired");
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
    const user = await getUserFromToken(stateToken);
    if (!user) return redirectBack("err");

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
      console.error("LINE token exchange failed", await tokenRes.text());
      return redirectBack("err");
    }
    const token = await tokenRes.json();
    if (!token.id_token) return redirectBack("err");

    const payload = await verifyLineIdToken(
      token.id_token,
      env("LINE_LOGIN_CHANNEL_ID"),
      env("LINE_LOGIN_CHANNEL_SECRET"),
    );

    // line_user_id is unique; fails here if already bound to another account.
    const sb = adminClient();
    const { error } = await sb
      .from("profiles")
      .update({
        line_user_id: payload.sub,
        line_display_name: payload.name ?? null,
      })
      .eq("id", user.id);
    if (error) {
      console.error("profile update failed", error.message);
      return redirectBack("err");
    }
    return redirectBack("ok");
  } catch (e) {
    console.error("line-callback error", e instanceof Error ? e.message : e);
    return redirectBack("err");
  }
});
