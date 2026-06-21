/**
 * Keyset cursor stability tests.
 *
 * Validates that `nextCursorFrom` + `hasMore` form a correct, gap-free,
 * duplicate-free walk through a deterministic dataset of 5,000 rows even
 * when there are ties on the order column (forcing the `(ts, id)` tiebreak
 * path to matter).
 */
import { describe, it, expect } from "vitest";
import { hasMore, nextCursorFrom, PAGE_SIZE, type Cursor } from "../keyset";

interface Row {
  id: string;
  created_at: string;
}

/**
 * Build 5,000 rows. Every 7 rows share a `created_at` so the (ts, id)
 * tiebreaker is exercised, then the bucket advances by one second.
 */
function buildDataset(n = 5_000): Row[] {
  const base = Date.UTC(2024, 0, 1, 0, 0, 0);
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const bucket = Math.floor(i / 7);
    const ts = new Date(base + bucket * 1_000).toISOString();
    // id zero-padded so lexical compare matches numeric compare.
    rows.push({ id: String(n - i).padStart(8, "0"), created_at: ts });
  }
  // Sort DESC by (created_at, id) to mimic what the DB returns.
  rows.sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  });
  return rows;
}

/**
 * Simulate what the server does: return the next page of rows strictly
 * after the cursor in DESC `(created_at, id)` order.
 */
function fetchPage(all: Row[], cursor: Cursor, limit: number): Row[] {
  let startIdx = 0;
  if (cursor) {
    // Find first row strictly less-than the cursor in DESC order.
    startIdx = all.findIndex(
      (r) => r.created_at < cursor.ts || (r.created_at === cursor.ts && r.id < cursor.id),
    );
    if (startIdx === -1) return [];
  }
  return all.slice(startIdx, startIdx + limit);
}

describe("keyset pagination", () => {
  it("walks a 5,000-row dataset with no duplicates and no gaps", () => {
    const all = buildDataset(5_000);
    const seen = new Set<string>();
    const collected: Row[] = [];
    let cursor: Cursor = null;
    let pageNum = 0;

    while (true) {
      pageNum++;
      const page = fetchPage(all, cursor, PAGE_SIZE);
      for (const r of page) {
        expect(seen.has(r.id), `duplicate id ${r.id} on page ${pageNum}`).toBe(false);
        seen.add(r.id);
        collected.push(r);
      }
      if (!hasMore(page, PAGE_SIZE)) break;
      cursor = nextCursorFrom(page, "created_at", "id");
      expect(cursor, `cursor null after full page ${pageNum}`).not.toBeNull();
      // Safety: bail if the walk somehow loops.
      if (pageNum > Math.ceil(all.length / PAGE_SIZE) + 2) {
        throw new Error("walk did not terminate");
      }
    }

    expect(collected).toHaveLength(all.length);
    // Monotonically non-increasing on (created_at, id).
    for (let i = 1; i < collected.length; i++) {
      const a = collected[i - 1];
      const b = collected[i];
      const ok = a.created_at > b.created_at || (a.created_at === b.created_at && a.id > b.id);
      expect(ok, `non-monotonic at ${i}: ${a.id}@${a.created_at} -> ${b.id}@${b.created_at}`).toBe(
        true,
      );
    }
  });

  it("returns null cursor on an empty page", () => {
    expect(nextCursorFrom<Row>([], "created_at", "id")).toBeNull();
  });

  it("hasMore is true only when the page filled the limit", () => {
    expect(hasMore([1, 2, 3], 3)).toBe(true);
    expect(hasMore([1, 2], 3)).toBe(false);
    expect(hasMore([], 3)).toBe(false);
  });

  it("resetting the cursor mid-walk (filter change) restarts from the head", () => {
    const all = buildDataset(1_000);
    let cursor: Cursor = null;
    // Walk 3 pages.
    for (let i = 0; i < 3; i++) {
      const page = fetchPage(all, cursor, PAGE_SIZE);
      cursor = nextCursorFrom(page, "created_at", "id");
    }
    expect(cursor).not.toBeNull();

    // Filter change: cursor MUST be reset by the caller.
    cursor = null;
    const head = fetchPage(all, cursor, PAGE_SIZE);
    expect(head[0]).toEqual(all[0]);
    expect(head).toHaveLength(PAGE_SIZE);
  });

  it("single-row dataset: returns the row and stops", () => {
    const all = buildDataset(1);
    const page = fetchPage(all, null, PAGE_SIZE);
    expect(page).toHaveLength(1);
    expect(hasMore(page, PAGE_SIZE)).toBe(false);
    expect(nextCursorFrom(page, "created_at", "id")).not.toBeNull();
    // Next page after the only row should be empty.
    const cursor = nextCursorFrom(page, "created_at", "id");
    const next = fetchPage(all, cursor, PAGE_SIZE);
    expect(next).toHaveLength(0);
    expect(hasMore(next, PAGE_SIZE)).toBe(false);
  });

  it("dataset of exactly PAGE_SIZE rows: hasMore true then empty follow-up", () => {
    const all = buildDataset(PAGE_SIZE);
    const page = fetchPage(all, null, PAGE_SIZE);
    expect(page).toHaveLength(PAGE_SIZE);
    // hasMore returns true (page is full), but the follow-up is empty.
    expect(hasMore(page, PAGE_SIZE)).toBe(true);
    const cursor = nextCursorFrom(page, "created_at", "id");
    const next = fetchPage(all, cursor, PAGE_SIZE);
    expect(next).toHaveLength(0);
    expect(hasMore(next, PAGE_SIZE)).toBe(false);
  });

  it("nextCursorFrom returns null when rows lack the timestamp field", () => {
    const rows = [{ id: "00000001", created_at: "" }];
    // Empty string is falsy — should return null.
    expect(nextCursorFrom(rows, "created_at", "id")).toBeNull();
  });

  it("walk under a filter predicate produces a disjoint set vs its complement", () => {
    const all = buildDataset(2_000);
    const even = all.filter((_r, i) => i % 2 === 0);
    const odd = all.filter((_r, i) => i % 2 !== 0);

    const walk = (subset: Row[]) => {
      const out: Row[] = [];
      let cursor: Cursor = null;
      while (true) {
        const page = fetchPage(subset, cursor, PAGE_SIZE);
        out.push(...page);
        if (!hasMore(page, PAGE_SIZE)) break;
        cursor = nextCursorFrom(page, "created_at", "id");
      }
      return out;
    };

    const a = walk(even);
    const b = walk(odd);
    const ids = new Set(a.map((r) => r.id));
    for (const r of b) expect(ids.has(r.id)).toBe(false);
    expect(a.length + b.length).toBe(all.length);
  });
});
