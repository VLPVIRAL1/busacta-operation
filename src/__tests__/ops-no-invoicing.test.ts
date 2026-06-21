import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * BusAcTa Operations blueprint guard:
 *   /ops/* is downstream-execution only.
 *   It must never advertise Invoicing, Budgeting, project/firm creation,
 *   or expose pricing/rate fields. Those concerns belong to /finance and
 *   /clients respectively.
 *
 * This test scans the Ops route subtree + the OpsOperatingCycle component
 * and fails if any forbidden term appears in user-visible text.
 */

const ROUTES_DIR = "src/routes";
const FORBIDDEN = [
  /\binvoice\b/i,
  /\bproforma\b/i,
  /\bbudget\b/i,
  /\bcreate\s+project\b/i,
  /\bcreate\s+firm\b/i,
  /\bhourly\s+rate\b/i,
  /\bflat\s+price\b/i,
];

// Blueprint debt cleared: previous Create Firm / Create Project dialogs in
// ops.firms.index.tsx, ops.firms.$firmId.index.tsx, and ops.projects.index.tsx
// have been removed. The allowlist is now empty — every Ops file must pass.
const ALLOWLIST = new Set<string>([]);

function listOpsFiles(): string[] {
  const out: string[] = [];
  // Top-level legacy dot-files: ops.*.tsx
  for (const f of readdirSync(ROUTES_DIR)) {
    if (f.startsWith("ops.") && (f.endsWith(".tsx") || f.endsWith(".ts"))) {
      out.push(join(ROUTES_DIR, f));
    }
  }
  // Hub-folder layout: src/routes/ops/**
  const opsDir = join(ROUTES_DIR, "ops");
  try {
    for (const f of readdirSync(opsDir)) {
      if (f.endsWith(".tsx") || f.endsWith(".ts")) {
        out.push(join(opsDir, f));
      }
    }
  } catch {
    /* dir may not exist */
  }
  out.push("src/components/ops/ops-operating-cycle.tsx");
  return out;
}

describe("Ops hub blueprint compliance", () => {
  it("contains no Invoicing / Budgeting / project-creation language", () => {
    const violations: string[] = [];
    for (const file of listOpsFiles()) {
      if (ALLOWLIST.has(file)) continue;
      let body: string;
      try {
        body = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      // Strip block + line comments so we only inspect runtime code/JSX.
      const stripped = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      for (const re of FORBIDDEN) {
        const m = stripped.match(re);
        if (m) violations.push(`${file}: matched ${re} → "${m[0]}"`);
      }
    }
    if (violations.length) {
      throw new Error(
        "Ops subtree must not reference Invoicing/Budget/Create Project/pricing.\n" +
          "These belong to /finance and /clients per the BusAcTa Operations blueprint.\n\n" +
          violations.map((v) => "  • " + v).join("\n"),
      );
    }
    expect(violations).toEqual([]);
  });

  it("Ops route directory exists and is non-empty", () => {
    expect(listOpsFiles().length).toBeGreaterThan(1);
    expect(statSync("src/components/ops/ops-operating-cycle.tsx").isFile()).toBe(true);
  });
});
