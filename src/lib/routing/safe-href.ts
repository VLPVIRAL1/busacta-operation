/**
 * Returns the URL only if it uses an allowed safe protocol (http, https, mailto, tel).
 * Prevents javascript: / data: URI injection when rendering user-supplied URLs.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = String(url).trim();
  if (!trimmed) return undefined;
  try {
    // Use a base so relative URLs don't throw; we still validate the resolved protocol.
    const u = new URL(trimmed, "https://invalid.local/");
    if (["https:", "http:", "mailto:", "tel:"].includes(u.protocol)) {
      return trimmed;
    }
  } catch {
    /* fallthrough */
  }
  return undefined;
}
