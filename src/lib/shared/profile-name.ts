/**
 * Pure display-name helpers for profile records. Centralises the
 * `full_name || email || fallback` pattern that was duplicated across Ops,
 * Finance, and server function modules. No React / supabase imports so this
 * is safe to use from both client components and `*.functions.ts` modules.
 */

/** Minimal shape needed to render a person's display name. */
export type NameableProfile = { id: string; full_name?: string | null; email?: string | null };

/**
 * Resolve a person's display name from a profiles list by id.
 * A `null`/`undefined` id returns the fallback (e.g. "Unassigned").
 */
export function profileLabel(
  profiles: readonly NameableProfile[] | null | undefined,
  id: string | null | undefined,
  fallback = "Unknown",
): string {
  if (!id) return fallback;
  const p = profiles?.find((x) => x.id === id);
  return p?.full_name || p?.email || fallback;
}

/** Build an id→display-name map once for repeated lookups (tables, feeds). */
export function buildProfileLabelMap(
  profiles: readonly NameableProfile[] | null | undefined,
  fallback = "Unknown",
): Map<string, string> {
  return new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || fallback]));
}
