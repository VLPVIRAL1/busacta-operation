/**
 * Resolves the origin to use for auth-email links (password reset / invite)
 * built from server functions.
 *
 * Unlike `resolvePublicOrigin` (esign), this MIRRORS the host the request
 * came from — so a reset triggered from localhost links back to localhost,
 * from one.busacta.com links back to one.busacta.com, etc. This is what the
 * recipient (the person who requested it) can actually reach.
 *
 * Priority:
 *   1. Current request host (dynamic — matches the live domain in use)
 *   2. `PUBLIC_SITE_URL` env (explicit override, e.g. background/cron contexts)
 *   3. Canonical production origin
 *
 * NOTE: Supabase only honours a `redirectTo` whose origin is in the project's
 * Auth "Redirect URLs" allow-list. Any origin returned here must be allow-listed
 * in the Supabase dashboard, or Supabase silently falls back to the Site URL.
 */
import { getRequestHost } from "@tanstack/react-start/server";

const FALLBACK_ORIGIN = "https://one.busacta.com";

export function resolveRequestOrigin(): string {
  try {
    const host = getRequestHost();
    if (host) {
      const isLocal =
        host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("0.0.0.0");
      const proto = isLocal ? "http" : "https";
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  } catch {
    // No request context (e.g. background job) — fall through.
  }

  const envOverride = process.env.PUBLIC_SITE_URL?.trim();
  if (envOverride) return envOverride.replace(/\/+$/, "");

  return FALLBACK_ORIGIN;
}

/** Full URL recipients land on to choose a new password. */
export function resolvePasswordResetUrl(): string {
  return `${resolveRequestOrigin()}/reset-password`;
}
