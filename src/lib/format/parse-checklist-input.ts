/**
 * Shared input validator for "To-Do group" / bulk-add inputs.
 *
 * Rules:
 *  - Empty / whitespace-only lines are skipped (counted as `skippedEmpty`).
 *  - Each line is stripped of common bullet/number/checkbox prefixes:
 *      `-`, `*`, `•`, `1.`, `1)`, `[ ]`, `[x]`, `[X]`
 *  - After cleaning, lines shorter than `minLength` chars are dropped
 *    (counted as `skippedShort`).
 *  - The remaining cleaned strings are returned in `valid`.
 */
export interface ChecklistParseResult {
  valid: string[];
  skippedEmpty: number;
  skippedShort: number;
  total: number;
}

const PREFIX_RE = /^\s*(?:[-*•]|\d+[.)]|\[[ xX]\])\s*/;

export function parseChecklistInput(raw: string, minLength = 3): ChecklistParseResult {
  const lines = (raw ?? "").split(/\r?\n/);
  let skippedEmpty = 0;
  let skippedShort = 0;
  const valid: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      skippedEmpty++;
      continue;
    }
    const cleaned = trimmed.replace(PREFIX_RE, "").trim();
    if (cleaned.length < minLength) {
      skippedShort++;
      continue;
    }
    valid.push(cleaned);
  }
  return { valid, skippedEmpty, skippedShort, total: lines.length };
}
