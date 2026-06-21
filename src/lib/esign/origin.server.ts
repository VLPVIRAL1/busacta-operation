/**
 * Resolves the public origin used to build `/sign/<token>` URLs.
 * Priority:
 *   1. `PUBLIC_SITE_URL` env (explicit override)
 *   2. Current request host — but only if it's not localhost / a sandbox
 *      preview host (those URLs aren't reachable by external signers).
 *   3. Fallback to the project's production custom domain.
 */
import { getRequestHost } from "@tanstack/react-start/server";

const FALLBACK_ORIGIN = "https://one.busacta.com";

function isPublicHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!h) return false;
  if (h.startsWith("localhost")) return false;
  if (h.startsWith("127.0.0.1") || h.startsWith("0.0.0.0")) return false;
  if (h.endsWith(".local")) return false;
  // Lovable sandbox preview hosts aren't intended for external recipients.
  if (h.includes("id-preview--") && h.endsWith(".lovable.app")) return false;
  return true;
}

export function resolvePublicOrigin(): string {
  const envOverride = process.env.PUBLIC_SITE_URL?.trim();
  if (envOverride) return envOverride.replace(/\/+$/, "");

  try {
    const host = getRequestHost();
    if (host && isPublicHost(host)) {
      return `https://${host}`.replace(/\/+$/, "");
    }
  } catch {
    // ignore
  }
  return FALLBACK_ORIGIN;
}
