// Microsoft Graph OAuth helpers. SERVER ONLY.
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const MS_GRAPH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
  "MailboxSettings.Read",
];

const AUTHORITY = "https://login.microsoftonline.com/common";

export type MicrosoftCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export function readMicrosoftCredentials(): MicrosoftCredentials | null {
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET;
  const redirectUri = process.env.MS_GRAPH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

// Reads credentials from DB first (integration_credentials table), falls back to env vars.
// Use this in all server fns so credentials survive hosting changes.
export async function readMicrosoftCredentialsAsync(): Promise<MicrosoftCredentials | null> {
  try {
    const { data } = await supabaseAdmin
      .from("integration_credentials" as never)
      .select("config, is_active")
      .eq("integration_key", "microsoft_email_oauth")
      .maybeSingle();
    const row = data as {
      config?: { client_id?: string; client_secret?: string; redirect_uri?: string };
      is_active?: boolean;
    } | null;
    if (
      row?.is_active &&
      row.config?.client_id &&
      row.config?.client_secret &&
      row.config?.redirect_uri
    ) {
      return {
        clientId: row.config.client_id,
        clientSecret: row.config.client_secret,
        redirectUri: row.config.redirect_uri,
      };
    }
  } catch {
    // fall through to env vars
  }
  return readMicrosoftCredentials();
}

function stateSigningKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for OAuth state signing");
  return key;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signOAuthState(payload: { userId: string; nonce?: string; exp?: number }): string {
  const body = {
    u: payload.userId,
    n: payload.nonce ?? b64url(randomBytes(12)),
    e: payload.exp ?? Math.floor(Date.now() / 1000) + 600, // 10 min
  };
  const json = b64url(Buffer.from(JSON.stringify(body)));
  const sig = b64url(createHmac("sha256", stateSigningKey()).update(json).digest());
  return `${json}.${sig}`;
}

export function verifyOAuthState(state: string): { userId: string } | null {
  const [json, sig] = state.split(".");
  if (!json || !sig) return null;
  try {
    const expected = b64url(createHmac("sha256", stateSigningKey()).update(json).digest());
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const body = JSON.parse(fromB64url(json).toString("utf8")) as {
      u: string;
      n: string;
      e: number;
    };
    if (!body.u || body.e < Math.floor(Date.now() / 1000)) return null;
    return { userId: body.u };
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(creds: MicrosoftCredentials, state: string): string {
  const params = new URLSearchParams({
    client_id: creds.clientId,
    response_type: "code",
    redirect_uri: creds.redirectUri,
    response_mode: "query",
    scope: MS_GRAPH_SCOPES.join(" "),
    state,
    prompt: "select_account",
  });
  return `${AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
}

export type TokenSet = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

export async function exchangeCodeForTokens(
  creds: MicrosoftCredentials,
  code: string,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code,
    redirect_uri: creds.redirectUri,
    grant_type: "authorization_code",
    scope: MS_GRAPH_SCOPES.join(" "),
  });
  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Microsoft token exchange failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as TokenSet;
}

export async function refreshAccessToken(
  creds: MicrosoftCredentials,
  refreshToken: string,
): Promise<TokenSet> {
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: MS_GRAPH_SCOPES.join(" "),
  });
  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Microsoft token refresh failed: ${res.status} ${txt}`);
  }
  return (await res.json()) as TokenSet;
}

export async function fetchUserProfile(
  accessToken: string,
): Promise<{ email: string; displayName: string | null }> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to fetch Graph /me: ${res.status} ${txt}`);
  }
  const json = (await res.json()) as {
    mail?: string;
    userPrincipalName?: string;
    displayName?: string;
  };
  const email = (json.mail ?? json.userPrincipalName ?? "").toLowerCase();
  if (!email) throw new Error("Microsoft profile has no email/userPrincipalName");
  return { email, displayName: json.displayName ?? null };
}
