import { describe, expect, it } from "vitest";
import { OPS_COLUMNS } from "@/lib/ops/operating-cycle-nodes";
import { REGISTERED_ROUTES } from "@/lib/routing/registered-routes.generated";

// Locks the OPS_COLUMNS → shortcut → route invariant so the runtime handler in
// OpsOperatingCycle and the /guide/shortcuts + /guide/workflows legends can
// never drift from one another.
describe("ops operating-cycle shortcut legend", () => {
  const TOP = new Set(["1", "2", "3", "4", "5"]);
  const BOTTOM = new Set(["6", "7", "8", "9", "0"]);

  it("primary tiles use top-row digits 1–5", () => {
    for (const col of OPS_COLUMNS) {
      expect(TOP.has(col.primary.shortcut)).toBe(true);
    }
  });

  it("secondary tiles use bottom-row digits 6–9, 0", () => {
    for (const col of OPS_COLUMNS) {
      if (!col.secondary) continue;
      expect(BOTTOM.has(col.secondary.shortcut)).toBe(true);
    }
  });

  it("all shortcuts are unique", () => {
    const all = OPS_COLUMNS.flatMap((c) =>
      c.secondary ? [c.primary.shortcut, c.secondary.shortcut] : [c.primary.shortcut],
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it("every tile destination is a registered route", () => {
    const registered = new Set(REGISTERED_ROUTES);
    for (const col of OPS_COLUMNS) {
      for (const node of [col.primary, col.secondary]) {
        if (!node) continue;
        // Tiles may deep-link with a query string (e.g. /ops/reports?tab=time-logs);
        // the manifest stores path-only routes, so compare the pathname.
        const path = node.to.split("?")[0];
        expect(
          registered.has(path),
          `Unregistered ops tile route: ${node.to} (${node.title})`,
        ).toBe(true);
      }
    }
  });
});
