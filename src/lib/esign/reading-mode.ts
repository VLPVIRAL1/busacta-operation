/**
 * Pure helpers for the e-sign signer "reading mode" (B4).
 *
 * Kept framework-free so they can be unit-tested and reused by the signer
 * route (`routes/sign/$token.tsx`) and the cockpit chrome.
 */

/** localStorage key persisting the signer's reading-mode preference. */
export const READING_MODE_KEY = "esign:reading-mode";

/** Serialize the reading-mode flag for localStorage. */
export function readingModeStorageValue(on: boolean): string {
  return on ? "1" : "0";
}

/** Parse a persisted reading-mode preference. Defaults to false. */
export function parseReadingModePref(raw: string | null | undefined): boolean {
  return raw === "1";
}

/**
 * Advance a wrap-around cursor by `dir` (+1 next / -1 prev) within
 * `[0, length)`. Returns 0 when the list is empty.
 */
export function nextRequiredCursor(current: number, dir: 1 | -1, length: number): number {
  if (length <= 0) return 0;
  let next = current + dir;
  if (next < 0) next = length - 1;
  if (next >= length) next = 0;
  return next;
}
