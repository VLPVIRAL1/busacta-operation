import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * The Operations hub must be self-contained. Operational users do not have
 * access to other hubs (Firm Hub, HR, Admin),
 * so no link inside src/routes/ops.* may navigate the user out of /ops.
 *
 * This test scans every ops route file and fails if any cross-hub URL appears
 * in a navigation/anchor context.
 */

const ROUTES_DIR = path.resolve(__dirname, "..", "routes");
const FORBIDDEN_PREFIXES = ["/clients", "/hr", "/admin"];

function opsRouteFiles(): { rel: string; abs: string }[] {
  const out: { rel: string; abs: string }[] = [];
  for (const f of readdirSync(ROUTES_DIR)) {
    if (f.startsWith("ops.") && (f.endsWith(".tsx") || f.endsWith(".ts"))) {
      out.push({ rel: f, abs: path.join(ROUTES_DIR, f) });
    }
  }
  const opsDir = path.join(ROUTES_DIR, "ops");
  try {
    for (const f of readdirSync(opsDir)) {
      if (f.endsWith(".tsx") || f.endsWith(".ts")) {
        out.push({ rel: `ops/${f}`, abs: path.join(opsDir, f) });
      }
    }
  } catch {
    /* dir may not exist */
  }
  return out;
}

describe("Operations hub does not link to other hubs", () => {
  for (const file of opsRouteFiles()) {
    it(`${file.rel} contains no cross-hub navigation`, () => {
      const src = readFileSync(file.abs, "utf8");
      const offenders: string[] = [];
      for (const prefix of FORBIDDEN_PREFIXES) {
        const patterns = [
          new RegExp(`to=["']${prefix}(/|["'])`),
          new RegExp(`to:\\s*["']${prefix}(/|["'])`),
          new RegExp(`href=["']${prefix}(/|["'])`),
        ];
        for (const re of patterns) {
          if (re.test(src)) offenders.push(`${prefix} (${re.source})`);
        }
      }
      expect(
        offenders,
        `Forbidden cross-hub link(s) in ${file.rel}: ${offenders.join(", ")}`,
      ).toEqual([]);
    });
  }
});
