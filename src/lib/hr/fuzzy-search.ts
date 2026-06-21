// Fuzzy string matching + highlight helpers for the HR directory.
// Lightweight: prefix > substring > subsequence > edit-distance.

export type Match = {
  score: number; // higher is better; 0 = no match
  ranges: Array<[number, number]>; // half-open [start, end) ranges in the candidate
};

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array(b.length + 1);
  const v1 = new Array(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j];
  }
  return v1[b.length];
}

function subsequenceRanges(query: string, text: string): Array<[number, number]> | null {
  // Greedy match: find each query char in order; group consecutive hits into one range.
  const ranges: Array<[number, number]> = [];
  let ti = 0;
  for (let qi = 0; qi < query.length; qi++) {
    while (ti < text.length && text[ti] !== query[qi]) ti++;
    if (ti >= text.length) return null;
    const last = ranges[ranges.length - 1];
    if (last && last[1] === ti) last[1] = ti + 1;
    else ranges.push([ti, ti + 1]);
    ti++;
  }
  return ranges;
}

export function fuzzyMatch(query: string, candidate: string | null | undefined): Match {
  const text = (candidate ?? "").toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return { score: 1, ranges: [] };
  if (!text) return { score: 0, ranges: [] };

  // 1. Prefix
  if (text.startsWith(q)) {
    return { score: 1000, ranges: [[0, q.length]] };
  }
  // 2. Substring
  const idx = text.indexOf(q);
  if (idx >= 0) {
    return { score: 800 - idx, ranges: [[idx, idx + q.length]] };
  }
  // 3. Subsequence
  const sub = subsequenceRanges(q, text);
  if (sub) {
    const span = sub[sub.length - 1][1] - sub[0][0];
    return { score: 400 - span, ranges: sub };
  }
  // 4. Edit distance (only useful for short queries)
  if (q.length >= 3 && q.length <= 20) {
    const d = levenshtein(q, text.slice(0, q.length + 4));
    const tolerance = Math.max(1, Math.floor(q.length * 0.34));
    if (d <= tolerance)
      return { score: 200 - d * 20, ranges: [[0, Math.min(q.length, text.length)]] };
  }
  return { score: 0, ranges: [] };
}

/** Match against many fields; returns best per-field match and an aggregate score. */
export function fuzzyMatchMany(
  query: string,
  fields: Array<{ key: string; text: string | null | undefined; weight?: number }>,
): { score: number; byKey: Record<string, Match> } {
  const byKey: Record<string, Match> = {};
  let total = 0;
  for (const f of fields) {
    const m = fuzzyMatch(query, f.text);
    byKey[f.key] = m;
    total += m.score * (f.weight ?? 1);
  }
  return { score: total, byKey };
}
