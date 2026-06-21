// In-memory Graph API token cache.
//
// Caches the app-only access token obtained via the client_credentials flow.
// Tokens are valid for 3600s; we refresh 60s early to avoid races.
//
// Redis upgrade is planned post-launch for VPS deployments (PM2 cluster mode).
// When ready: add `bun add redis`, set REDIS_URL env var, and restore the
// Redis branch — no call-site changes needed (same getCachedToken / setCachedToken API).

const CLOCK_SKEW_SECONDS = 60; // refresh 60s before actual expiry

type CachedToken = { accessToken: string; expiresAt: number };

let memCache: CachedToken | null = null;

export async function getCachedToken(): Promise<string | null> {
  const now = Date.now() / 1000;
  if (memCache && memCache.expiresAt - CLOCK_SKEW_SECONDS > now) {
    return memCache.accessToken;
  }
  return null;
}

export async function setCachedToken(accessToken: string, expiresInSeconds: number): Promise<void> {
  memCache = { accessToken, expiresAt: Date.now() / 1000 + expiresInSeconds };
}

export function invalidateTokenCache(): void {
  memCache = null;
}
