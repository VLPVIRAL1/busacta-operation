/**
 * Public download URLs for the BusAcTa Operations desktop app.
 *
 * The ZIPs are produced by `bun run desktop:build` and then uploaded to the
 * `desktop-releases` Lovable Cloud storage bucket under `latest/`. The bucket
 * is public-read and admin-write (see migration). URLs are derived from
 * VITE_SUPABASE_URL so they automatically point at the right environment.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";

const BUCKET = "desktop-releases";
const FOLDER = "latest";

function publicUrl(filename: string): string {
  if (!SUPABASE_URL) return "#";
  return `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${FOLDER}/${filename}`;
}

export const WIN_FILENAME = "BusAcTaOne-win32-x64.zip";
export const MAC_FILENAME = "BusAcTaOne-darwin-x64.zip";

export const WIN_DOWNLOAD_URL = publicUrl(WIN_FILENAME);
export const MAC_DOWNLOAD_URL = publicUrl(MAC_FILENAME);

export type DesktopOs = "windows" | "macos" | "other";

/** Best-effort OS sniff for the "We detected …" hint on /download. */
export function detectOs(): DesktopOs {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "macos";
  return "other";
}

/** True when the page is rendered inside the Electron desktop shell itself. */
export function isElectronShell(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.toLowerCase().includes("electron");
}
