#!/usr/bin/env bun
/**
 * scripts/route-health.ts
 *
 * Two checks in one:
 *  1. Every URL advertised in the app inventory (Tier-1, Tier-2, EXTRA_PAGES,
 *     standalone) must resolve to a registered route.
 *  2. Every hard-coded `<Link to="...">` literal in src/ must also resolve.
 *
 * Exits non-zero on any MISSING (advertised but unregistered) entry or
 * unresolved literal.
 *
 * Run: bun scripts/route-health.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src");

// 1. Refresh the manifest first.
spawnSync("bun", [join(ROOT, "scripts", "generate-route-manifest.ts")], {
  stdio: "inherit",
});

const { ALL_ROUTE_ENTRIES } = await import("../src/lib/route-inventory");
const { REGISTERED_ROUTES } = await import("../src/lib/registered-routes.generated");
const { buildMatchers, findMatchingRoute, normaliseLiteral } =
  await import("../src/lib/route-match");

const matchers = buildMatchers(REGISTERED_ROUTES);

// ---- Inventory check -------------------------------------------------------
type Missing = { hub: string; title: string; url: string; source: string };
const missingInv: Missing[] = [];
const okByHub = new Map<string, number>();

for (const e of ALL_ROUTE_ENTRIES) {
  if (findMatchingRoute(e.url, matchers)) {
    okByHub.set(e.hubLabel, (okByHub.get(e.hubLabel) ?? 0) + 1);
  } else {
    missingInv.push({ hub: e.hubLabel, title: e.title, url: e.url, source: e.source });
  }
}

// ---- Literal scan ----------------------------------------------------------
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry) && !full.endsWith("routeTree.gen.ts")) out.push(full);
  }
  return out;
}

const PATTERNS: RegExp[] = [
  /\bto\s*=\s*"(\/[A-Za-z0-9_/\-$.]*)"/g,
  /\bto\s*=\s*\{\s*`(\/[A-Za-z0-9_/\-${}.]*)`\s*\}/g,
  /\bto\s*:\s*"(\/[A-Za-z0-9_/\-$.]*)"/g,
  /\bto\s*:\s*`(\/[A-Za-z0-9_/\-${}.]*)`/g,
];

type BrokenLit = { file: string; line: number; literal: string };
const brokenLits: BrokenLit[] = [];

for (const file of walk(SRC)) {
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(lines[i])) !== null) {
        const raw = m[1];
        if (raw.startsWith("/api/")) continue;
        const literal = normaliseLiteral(raw);
        if (!findMatchingRoute(literal, matchers)) {
          brokenLits.push({ file: relative(ROOT, file), line: i + 1, literal: raw });
        }
      }
    }
  }
}

// ---- Report ----------------------------------------------------------------
console.log("\n=== Route Health Report ===\n");
console.log(`Registered routes: ${REGISTERED_ROUTES.length}`);
console.log(`Inventory entries: ${ALL_ROUTE_ENTRIES.length}\n`);

console.log("Available per hub:");
for (const [hub, n] of [...okByHub.entries()].sort()) {
  console.log(`  ✓ ${hub.padEnd(32)} ${n}`);
}

if (missingInv.length) {
  console.error(`\n✗ ${missingInv.length} advertised page(s) MISSING a route:`);
  for (const m of missingInv) {
    console.error(`  [${m.hub}] ${m.url}  — ${m.title} (${m.source})`);
  }
}

if (brokenLits.length) {
  console.error(`\n✗ ${brokenLits.length} broken hard-coded link literal(s):`);
  for (const b of brokenLits) {
    console.error(`  ${b.file}:${b.line}  →  ${b.literal}`);
  }
}

if (missingInv.length || brokenLits.length) {
  console.error("\nFAILED");
  process.exit(1);
}
console.log("\n✓ All routes healthy");
