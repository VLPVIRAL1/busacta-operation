/**
 * Keyset (cursor) pagination helpers for high-volume ops tables.
 *
 * At 5M+ rows OFFSET pagination is O(N). Keyset is O(log N): we order by
 * `(<order-col> DESC, id DESC)` and the "next page" cursor is just the
 * last row's `(ts, id)` pair. Pages are size-bounded (default 200) so each
 * request returns a tiny, indexed slice no matter how big the table is.
 *
 * See migration: indexes `<table>_<order-col>_id_desc` enable this.
 */

import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";

export type Cursor = { ts: string; id: string } | null;

export const PAGE_SIZE = 200;

/** True if there are likely more rows after the page we just fetched. */
export function hasMore<T>(rows: T[], limit: number): boolean {
  return rows.length >= limit;
}

/** Build the next cursor from the last row of the current page. */
export function nextCursorFrom<T>(
  rows: T[],
  tsField: keyof T,
  idField: keyof T = "id" as keyof T,
): Cursor {
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1] as Record<string, unknown>;
  const ts = last[tsField as string];
  const id = last[idField as string];
  if (!ts || !id) return null;
  return { ts: String(ts), id: String(id) };
}

/**
 * Apply a DESC keyset filter: returns rows where `(ts, id) < (cursor.ts, cursor.id)`.
 * Implemented as `ts < cursor.ts OR (ts = cursor.ts AND id < cursor.id)`.
 *
 * Supabase's PostgREST builder doesn't have a clean tuple-compare, so we use
 * `.or()` with the equivalent expression. This still uses the composite
 * `(ts DESC, id DESC)` index.
 */
export function applyKeysetDesc<
  // Loose typing — Supabase's builder is over-generic for our purposes here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Q extends PostgrestFilterBuilder<any, any, any, any, any>,
>(query: Q, tsCol: string, idCol: string, cursor: Cursor): Q {
  if (!cursor) return query;
  // ts < c.ts OR (ts = c.ts AND id < c.id)
  return query.or(
    `${tsCol}.lt.${cursor.ts},and(${tsCol}.eq.${cursor.ts},${idCol}.lt.${cursor.id})`,
  ) as Q;
}
