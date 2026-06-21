// Per-machine device fingerprint. Stored in a cookie scoped to the registrable
// root domain so all browsers (Chrome, Edge, Firefox) on the same machine
// share ONE id and therefore one device slot. localStorage is used as a
// migration source and a fallback when cookies are blocked.

const COOKIE_KEY = "bao_device_id";
const STORAGE_KEY = "user-device-id";
const TEN_YEARS_SECONDS = 60 * 60 * 24 * 365 * 10;

/**
 * Derive a cookie Domain= value from a hostname.
 * - Bare hosts (localhost, IPs): return null so we omit Domain= (host-only cookie).
 * - Multi-label hosts: return the eTLD+1 with a leading dot, e.g.
 *   `app.busacta-one.com` -> `.busacta-one.com`. We also handle the common
 *   `*.lovable.app` case explicitly.
 */
function deriveCookieDomain(hostname: string): string | null {
  if (!hostname || hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null;
  const parts = hostname.split(".");
  if (parts.length < 2) return null;
  // Known multi-part public suffixes we care about. Add more as needed.
  const multiPartSuffixes = ["co.uk", "co.in", "com.au", "co.jp"];
  const last2 = parts.slice(-2).join(".");
  if (multiPartSuffixes.includes(last2) && parts.length >= 3) {
    return "." + parts.slice(-3).join(".");
  }
  // Default: registrable root = last 2 labels.
  return "." + parts.slice(-2).join(".");
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const found = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : null;
}

function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const domain = deriveCookieDomain(window.location.hostname);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=/`,
    `Max-Age=${TEN_YEARS_SECONDS}`,
    `SameSite=Lax`,
  ];
  if (domain) parts.push(`Domain=${domain}`);
  document.cookie = parts.join("; ") + secure;
}

function clearCookie(name: string): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const domain = deriveCookieDomain(window.location.hostname);
  const base = [`${name}=`, `Path=/`, `Max-Age=0`, `SameSite=Lax`];
  if (domain) base.push(`Domain=${domain}`);
  document.cookie = base.join("; ");
  // Also clear host-only variant just in case it was set earlier.
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "ssr-no-device";

  // 1. Cookie wins — shared across all browsers on this machine.
  let id = readCookie(COOKIE_KEY);

  // 2. Migrate legacy per-browser localStorage value.
  if (!id) {
    try {
      id = localStorage.getItem(STORAGE_KEY);
    } catch {
      id = null;
    }
  }

  // 3. Fresh install — generate.
  if (!id) id = generateId();

  // Always persist to both stores so they stay converged.
  writeCookie(COOKIE_KEY, id);
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode, etc. */
  }

  return id;
}

export function clearDeviceId(): void {
  if (typeof window === "undefined") return;
  clearCookie(COOKIE_KEY);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

import { getDeviceInfo } from "@/lib/shared/device-info";

/** Short, human-friendly device label e.g. "Chrome on macOS". */
export function getDeviceLabel(): string {
  const info = getDeviceInfo();
  const browser = info.browser && info.browser !== "unknown" ? info.browser : "Browser";
  const os = info.os && info.os !== "Unknown" ? info.os : "";
  return os ? `${browser} on ${os}` : browser;
}

export type ActiveDevice = {
  device_id: string;
  label: string | null;
  user_agent: string | null;
  last_seen_at: string;
  last_ip: string | null;
};

export type ClaimResult =
  | { status: "ok" | "reactivated"; device_id: string }
  | { status: "limit_reached"; active: ActiveDevice[] };
