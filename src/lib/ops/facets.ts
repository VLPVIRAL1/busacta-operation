/**
 * Generic faceted filter helper.
 *
 * For each facet key, counts how many rows would still match the predicate
 * set with all OTHER facet predicates applied (industry-standard behavior:
 * selecting a value in facet X does not collapse X's own counts to one
 * option).
 */
export type FacetExtractor<T> = (row: T) => string | string[] | null | undefined;
export type FacetPredicate<T> = (row: T) => boolean;

export function computeFacets<T>(
  rows: T[],
  predicates: Record<string, FacetPredicate<T>>,
  extractors: Record<string, FacetExtractor<T>>,
): Record<string, Map<string, number>> {
  const out: Record<string, Map<string, number>> = {};
  const facetKeys = Object.keys(extractors);
  for (const fk of facetKeys) {
    const otherPreds = Object.entries(predicates)
      .filter(([k]) => k !== fk)
      .map(([, p]) => p);
    const m = new Map<string, number>();
    for (const row of rows) {
      let ok = true;
      for (const p of otherPreds) {
        if (!p(row)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      const v = extractors[fk](row);
      if (v == null) continue;
      const vals = Array.isArray(v) ? v : [v];
      for (const x of vals) {
        if (x == null || x === "") continue;
        m.set(x, (m.get(x) ?? 0) + 1);
      }
    }
    out[fk] = m;
  }
  return out;
}
