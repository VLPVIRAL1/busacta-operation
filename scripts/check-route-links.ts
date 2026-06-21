#!/usr/bin/env bun
/**
 * scripts/check-route-links.ts
 *
 * Scans every .ts/.tsx file under src/ for hard-coded route literals
 * (`<Link to="..">`, `to: "..."`, `to: \`...\``, `redirect({ to: ... })`,
 * `navigate({ to: ... })`) and verifies each one matches a route registered
 * in src/routeTree.gen.ts. Exits non-zero on the first failure.
 *
 * Run: bun scripts/check-route-links.ts
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SRC = join(ROOT, "src");
const TREE = join(SRC, "routeTree.gen.ts");

// ---- 1. Load registered routes from routeTree.gen.ts -----------------------
const treeSrc = readFileSync(TREE, "utf8");
const routePaths = new Set<string>();
// Match `path: '/something'` declarations.
for (const m of treeSrc.matchAll(/\bpath:\s*'([^']+)'/g)) {
  routePaths.add(m[1]);
}
// Also pick up the absolute URL keys from the generated FullPaths interfaces:
//   '/ops/firms/$firmId': typeof ...
for (const m of treeSrc.matchAll(/'(\/[A-Za-z0-9_/$.\-]*)':\s*typeof/g)) {
  routePaths.add(m[1]);
}
// Always allow the root.
routePaths.add("/");

// Convert each route path into a regex that matches concrete URLs.
// `$param` segments become `[^/]+` and a trailing `/` is optional.
function routeToRegex(p: string): RegExp {
  const escaped = p
    .split("/")
    .map((seg) => {
      if (!seg) return "";
      if (seg.startsWith("$")) return "[^/]+";
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${escaped}/?$`);
}

const routeMatchers = [...routePaths].map((p) => ({ path: p, re: routeToRegex(p) }));

function matchesRoute(literal: string): boolean {
  // Strip query & hash before matching.
  const clean = literal.split(/[?#]/)[0];
  return routeMatchers.some((m) => m.re.test(clean));
}

// ---- 2. Walk src/ ----------------------------------------------------------
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry) && !full.endsWith("routeTree.gen.ts")) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC);

// ---- 3. Extract & verify link literals ------------------------------------
type Finding = { file: string; line: number; literal: string };
const broken: Finding[] = [];

// Match a literal route path inside common navigation/link contexts:
//   to="/path"
//   to={`/path`}
//   to: "/path"
//   to: `/path`
//   href="/path"            (only when starts with "/")
const PATTERNS: RegExp[] = [
  /\bto\s*=\s*"(\/[A-Za-z0-9_/\-$.]*)"/g,
  /\bto\s*=\s*\{\s*`(\/[A-Za-z0-9_/\-$.{}]*)`\s*\}/g,
  /\bto\s*:\s*"(\/[A-Za-z0-9_/\-$.]*)"/g,
  /\bto\s*:\s*`(\/[A-Za-z0-9_/\-$.{}]*)`/g,
];

// `${id}` style template substitutions are normalised to a wildcard segment
// so they match the dynamic-param regex above.
function normaliseLiteral(raw: string): string {
  return raw.replace(/\$\{[^}]+\}/g, "x");
}

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const re of PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const raw = m[1];
        // Skip non-app paths.
        if (raw.startsWith("/api/")) continue;
        const literal = normaliseLiteral(raw);
        if (!matchesRoute(literal)) {
          broken.push({ file: relative(ROOT, file), line: i + 1, literal: raw });
        }
      }
    }
  }
}

// ---- 4. Report -------------------------------------------------------------
if (broken.length > 0) {
  console.error(`✗ ${broken.length} broken route link(s) found:\n`);
  for (const f of broken) {
    console.error(`  ${f.file}:${f.line}  →  ${f.literal}`);
  }
  console.error(`\nKnown routes (${routePaths.size}):`);
  for (const p of [...routePaths].sort()) console.error(`  ${p}`);
  process.exit(1);
}

console.log(
  `✓ All hard-coded route links resolve (${files.length} files scanned, ${routePaths.size} routes registered).`,
);
