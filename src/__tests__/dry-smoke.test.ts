/**
 * DRY regression smoke test.
 *
 * Runs on every `bun test`. Cheap, no JSX rendering. Guards:
 *
 *   1. Every Golden Master file still exists on disk.
 *   2. Every Golden Master file still exports its registered component name.
 *   3. No Golden Master file imports the newly-introduced shared primitives
 *      (AssigneeStack, FilterBar) — proves no accidental refactor crept in.
 *   4. Every DRY_ORIGINALS canonical path resolves to a real file that
 *      exports a matching `export function|const <Name>`.
 *
 * Runtime UI smoke (render + click) lives in `e2e/dry-smoke.spec.ts` and
 * runs only with the seed env (same pattern as other Playwright specs).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

// ─── Registry (keep in sync with eslint.config.js DRY_ORIGINALS) ───────────
const DRY_ORIGINALS = [
  { name: "PageHeader", canonical: "src/components/shell/app-shell.tsx" },
  { name: "EmptyState", canonical: "src/components/shared/empty-state.tsx" },
  { name: "ExportMenu", canonical: "src/components/shared/export-menu.tsx" },
  { name: "DateRangeFilter", canonical: "src/components/shared/date-range-filter.tsx" },
  { name: "AssigneeStack", canonical: "src/components/shared/assignee-stack.tsx" },
  { name: "FilterBar", canonical: "src/components/shared/filter-bar.tsx" },
  { name: "PeoplePicker", canonical: "src/components/shared/people-picker.tsx" },
  { name: "SinglePersonPicker", canonical: "src/components/shared/single-person-picker.tsx" },
  { name: "MultiPersonPicker", canonical: "src/components/shared/multi-person-picker.tsx" },
  { name: "TaskNotesPanel", canonical: "src/components/ops/task-notes-panel.tsx" },
  { name: "TaskActionItemsPanel", canonical: "src/components/ops/task-action-items-panel.tsx" },
  { name: "SubtaskList", canonical: "src/components/ops/subtask-list.tsx" },
  { name: "DocumentManager", canonical: "src/components/ops/document-manager.tsx" },
  { name: "ThreadChat", canonical: "src/components/ops/communication/thread-chat.tsx" },
  { name: "TaskLinksPanel", canonical: "src/components/ops/task-links-panel.tsx" },
  { name: "TaskTimerControl", canonical: "src/components/ops/timer-widget.tsx" },
];

// ─── Golden Masters: files that MUST stay byte-for-byte stable ────────────
const GOLDEN_MASTERS = [
  // Task View
  { file: "src/routes/ops/tasks.$taskId.tsx", expects: [] as string[] },
  { file: "src/components/ops/task-notes-panel.tsx", expects: ["TaskNotesPanel"] },
  { file: "src/components/ops/task-action-items-panel.tsx", expects: ["TaskActionItemsPanel"] },
  { file: "src/components/ops/subtask-list.tsx", expects: ["SubtaskList"] },
  { file: "src/components/ops/task-edit-sheet.tsx", expects: [] },
  { file: "src/components/ops/timer-widget.tsx", expects: ["TaskTimerControl", "TimerWidget"] },
  // Communication
  { file: "src/routes/ops/communication.tsx", expects: [] },
  { file: "src/components/ops/direct-messages-page.tsx", expects: [] },
  { file: "src/components/ops/communication/inbox-toolbar.tsx", expects: [] },
];

// Newly introduced shared primitives that Golden Master files MUST NOT import.
const FORBIDDEN_IN_GOLDEN = [
  "@/components/shared/assignee-stack",
  "@/components/shared/filter-bar",
];

function readSource(rel: string): string | null {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf8");
}

describe("DRY: Golden Master files", () => {
  for (const gm of GOLDEN_MASTERS) {
    describe(gm.file, () => {
      it("exists on disk", () => {
        expect(existsSync(path.join(ROOT, gm.file))).toBe(true);
      });

      it("still exports its registered component name(s)", () => {
        const src = readSource(gm.file);
        expect(src).not.toBeNull();
        for (const name of gm.expects) {
          const re = new RegExp(
            `export\\s+(?:function|const|default\\s+function)\\s+${name}\\b|export\\s+\\{[^}]*\\b${name}\\b`,
          );
          expect(re.test(src!), `Expected export of ${name} in ${gm.file}`).toBe(true);
        }
      });

      it("does NOT import newly-introduced shared primitives", () => {
        const src = readSource(gm.file) ?? "";
        for (const forbidden of FORBIDDEN_IN_GOLDEN) {
          expect(
            src.includes(forbidden),
            `${gm.file} must not import ${forbidden} (Golden Master)`,
          ).toBe(false);
        }
      });
    });
  }
});

describe("DRY: registry integrity", () => {
  for (const entry of DRY_ORIGINALS) {
    it(`${entry.name} is exported from ${entry.canonical}`, () => {
      const src = readSource(entry.canonical);
      expect(src, `${entry.canonical} should exist`).not.toBeNull();
      const re = new RegExp(
        `export\\s+(?:function|const|default\\s+function)\\s+${entry.name}\\b|export\\s+\\{[^}]*\\b${entry.name}\\b`,
      );
      expect(re.test(src!), `${entry.canonical} must export ${entry.name}`).toBe(true);
    });
  }
});

// ─── Deliverable 1 — Embedded-Golden contract (To-Do split pane) ──────────
//
// `todos-detail-pane.tsx` is the single legitimate non-Golden consumer of the
// Task View body components. Lock its imports to canonical paths so a future
// edit can't silently substitute a re-implementation.
describe("DRY: todos-detail-pane embeds Golden components from canonical paths", () => {
  const FILE = "src/components/ops/todos/todos-detail-pane.tsx";
  const REQUIRED_IMPORTS: Array<{ name: string; canonical: string; barrel?: string }> = [
    { name: "SubtaskList", canonical: "@/components/ops/subtask-list" },
    { name: "TaskActionItemsPanel", canonical: "@/components/ops/task-action-items-panel" },
    { name: "DocumentManager", canonical: "@/components/ops/document-manager" },
    { name: "ThreadChat", canonical: "@/components/ops/communication/thread-chat" },
    { name: "TaskTimerControl", canonical: "@/components/ops/timer-widget" },
    { name: "TaskLinksPanel", canonical: "@/components/ops/task-links-panel" },
  ];

  it("exists", () => {
    expect(existsSync(path.join(ROOT, FILE))).toBe(true);
  });

  for (const { name, canonical, barrel } of REQUIRED_IMPORTS) {
    it(`imports ${name} from ${canonical}${barrel ? ` (or ${barrel})` : ""}`, () => {
      const src = readSource(FILE) ?? "";
      const escCanon = canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(`import\\s+\\{[^}]*\\b${name}\\b[^}]*\\}\\s+from\\s+["']${escCanon}["']`),
      ];
      if (barrel) {
        const escBarrel = barrel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        patterns.push(
          new RegExp(`import\\s+\\{[^}]*\\b${name}\\b[^}]*\\}\\s+from\\s+["']${escBarrel}["']`),
        );
      }
      expect(
        patterns.some((re) => re.test(src)),
        `${FILE} must import ${name} from its registered canonical path (${canonical})`,
      ).toBe(true);
    });
  }
});

// ─── Deliverable 2 — Filter call-site manifest ─────────────────────────────
//
// We won't force-swap these to FilterBar (see plan.md "Path A audit"), but we
// pin each surface's CURRENT filter primitive so silent drift is caught.
describe("DRY: filter call-site manifest", () => {
  const FILTER_SURFACES: Array<{
    file: string;
    expects: RegExp[];
    label: string;
    golden?: boolean;
  }> = [
    {
      file: "src/routes/admin/activity-audit.tsx",
      label: "uses native Select + date Inputs",
      expects: [/from\s+["']@\/components\/ui\/select["']/, /type=["']date["']/],
    },
    {
      file: "src/components/ops/todos-table.tsx",
      label: "uses todos-people-filter",
      expects: [/todos-people-filter|TodosPeopleFilter/],
    },
    {
      file: "src/components/ops/communication/inbox-toolbar.tsx",
      label: "GOLDEN — inline inbox toolbar",
      expects: [/./],
      golden: true,
    },
  ];

  for (const surface of FILTER_SURFACES) {
    describe(surface.file, () => {
      it(`exists and ${surface.label}`, () => {
        const src = readSource(surface.file);
        expect(src, `${surface.file} should exist`).not.toBeNull();
        for (const re of surface.expects) {
          expect(re.test(src!), `${surface.file} should match ${re}`).toBe(true);
        }
      });

      if (surface.golden) {
        it("GOLDEN surface does NOT import FilterBar", () => {
          const src = readSource(surface.file) ?? "";
          expect(src.includes("@/components/shared/filter-bar")).toBe(false);
        });
      }
    });
  }
});

/* ============================================================
   Phase 2 — Client Portal Task View security contract
   ============================================================ */
describe("Phase 2: Client Portal task view contract", () => {
  const FILE = "src/routes/portal/tasks.$taskId.tsx";

  it("route file exists", () => {
    const src = readSource(FILE);
    expect(src, `${FILE} should exist`).not.toBeNull();
  });

  it("imports ThreadChat from the canonical Golden path", () => {
    const src = readSource(FILE) ?? "";
    expect(/from\s+["']@\/components\/ops\/communication\/thread-chat["']/.test(src)).toBe(true);
  });

  it("renders ThreadChat with lockClientVisible set", () => {
    const src = readSource(FILE) ?? "";
    // Single regex tolerant of formatting:
    //   <ThreadChat ... lockClientVisible ... />
    expect(/<ThreadChat[\s\S]*?lockClientVisible[\s\S]*?\/>/.test(src)).toBe(true);
  });

  it("does NOT import the internal DocumentManager Golden", () => {
    const src = readSource(FILE) ?? "";
    expect(src.includes("@/components/ops/document-manager")).toBe(false);
  });

  it("does NOT render internal-only panels (Notes, ActionItems, Subtasks, Links, Timer)", () => {
    const src = readSource(FILE) ?? "";
    const forbidden = [
      "TaskNotesPanel",
      "TaskActionItemsPanel",
      "SubtaskList",
      "TaskLinksPanel",
      "TaskTimerControl",
    ];
    for (const name of forbidden) {
      expect(src.includes(name), `${FILE} must not render <${name}>`).toBe(false);
    }
  });

  it("uses the read-only PortalTaskFiles panel", () => {
    const src = readSource(FILE) ?? "";
    expect(src.includes("PortalTaskFiles")).toBe(true);
  });
});

describe("Phase 2: PortalTaskFiles is read-only and visibility-locked", () => {
  const FILE = "src/components/portal/portal-task-files.tsx";

  it("exists", () => {
    expect(readSource(FILE)).not.toBeNull();
  });

  it("filters task_attachments by is_client_visible = true", () => {
    const src = readSource(FILE) ?? "";
    expect(/from\(["']task_attachments["']\)/.test(src)).toBe(true);
    expect(/\.eq\(["']is_client_visible["'],\s*true\)/.test(src)).toBe(true);
  });

  it("contains no mutating Supabase calls (insert/update/delete/upsert)", () => {
    const src = readSource(FILE) ?? "";
    for (const op of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(src.includes(op), `PortalTaskFiles must not call ${op}`).toBe(false);
    }
  });

  it("does NOT import DocumentManager", () => {
    const src = readSource(FILE) ?? "";
    expect(src.includes("@/components/ops/document-manager")).toBe(false);
  });
});

describe("Phase 2: ThreadChat exposes lockClientVisible prop", () => {
  it("declares the prop on ThreadChatProps", () => {
    const src = readSource("src/components/ops/communication/thread-chat.tsx") ?? "";
    expect(/lockClientVisible\?\:\s*boolean/.test(src)).toBe(true);
  });

  it("forces clientVisible to true when lockClientVisible is set", () => {
    const src = readSource("src/components/ops/communication/thread-chat.tsx") ?? "";
    expect(/lockClientVisible\s*\?\s*true\s*:\s*clientVisibleState/.test(src)).toBe(true);
  });

  it("hides the toggle when lockClientVisible is set", () => {
    const src = readSource("src/components/ops/communication/thread-chat.tsx") ?? "";
    expect(/!props\.lockClientVisible/.test(src)).toBe(true);
  });
});

describe("Phase 3: Portal layout renders <Outlet/> and gates non-clients", () => {
  const FILE = "src/routes/portal.tsx";
  it("exists", () => {
    expect(readSource(FILE)).not.toBeNull();
  });

  it("renders <Outlet /> so child routes mount", () => {
    const src = readSource(FILE) ?? "";
    expect(src.includes("<Outlet />")).toBe(true);
  });

  it("redirects users with any non-client role to /global-dashboard", () => {
    const src = readSource(FILE) ?? "";
    expect(/r\s*!==\s*["']client["']/.test(src)).toBe(true);
    expect(/to:\s*["']\/global-dashboard["']/.test(src)).toBe(true);
  });

  it("bypasses the auth gate on /portal/upload/ magic links", () => {
    const src = readSource(FILE) ?? "";
    expect(src.includes("/portal/upload/")).toBe(true);
  });
});

describe("Phase 3: Portal projects list", () => {
  const FILE = "src/routes/portal.projects.index.tsx";
  it("exists and queries projects by firm_id", () => {
    const src = readSource(FILE) ?? "";
    expect(/from\(["']projects["']\)/.test(src)).toBe(true);
    expect(/\.eq\(["']firm_id["']/.test(src)).toBe(true);
  });
  it("only links into /portal/projects/$projectId (no internal /ops links)", () => {
    const src = readSource(FILE) ?? "";
    expect(src.includes("/portal/projects/$projectId")).toBe(true);
    expect(src.includes("/ops/")).toBe(false);
  });
});

describe("Phase 3: Portal project detail", () => {
  const FILE = "src/routes/portal.projects.$projectId.tsx";
  it("filters per-task message metadata by is_client_visible = true", () => {
    const src = readSource(FILE) ?? "";
    expect(/from\(["']task_messages["']\)/.test(src)).toBe(true);
    expect(/\.eq\(["']is_client_visible["'],\s*true\)/.test(src)).toBe(true);
  });
  it("links task rows to /portal/tasks/$taskId", () => {
    const src = readSource(FILE) ?? "";
    expect(src.includes("/portal/tasks/$taskId")).toBe(true);
  });
  it("verifies project.firm_id matches the portal contact's firm", () => {
    const src = readSource(FILE) ?? "";
    expect(/project\.firm_id\s*===\s*firmId/.test(src)).toBe(true);
  });
});

describe("Phase 3: Portal inbox", () => {
  const FILE = "src/routes/portal.inbox.tsx";
  it("filters task_messages by is_client_visible = true", () => {
    const src = readSource(FILE) ?? "";
    expect(/from\(["']task_messages["']\)/.test(src)).toBe(true);
    expect(/\.eq\(["']is_client_visible["'],\s*true\)/.test(src)).toBe(true);
  });
  it("subscribes to a realtime postgres_changes channel scoped to is_client_visible=eq.true", () => {
    const src = readSource(FILE) ?? "";
    expect(src.includes("portal-inbox-")).toBe(true);
    expect(/postgres_changes/.test(src)).toBe(true);
    expect(src.includes("is_client_visible=eq.true")).toBe(true);
  });
  it("contains no mutating Supabase calls", () => {
    const src = readSource(FILE) ?? "";
    for (const op of [".insert(", ".update(", ".delete(", ".upsert("]) {
      expect(src.includes(op), `portal inbox must not call ${op}`).toBe(false);
    }
  });
});

describe("Phase 3: Portal nav exposes only client surfaces", () => {
  const FILE = "src/components/portal/portal-nav.tsx";
  it("exists", () => {
    expect(readSource(FILE)).not.toBeNull();
  });
  it("only links to /portal, /portal/projects, /portal/inbox", () => {
    const src = readSource(FILE) ?? "";
    expect(src.includes("/portal/projects")).toBe(true);
    expect(src.includes("/portal/inbox")).toBe(true);
    // No internal hub links sneaking in.
    for (const forbidden of ["/ops", "/clients", "/hr", "/learning", "/growth"]) {
      expect(src.includes(`to=\"${forbidden}\"`), `portal nav must not link to ${forbidden}`).toBe(
        false,
      );
    }
  });
});

describe("Phase C: Firm onboarding wizard + shared FEATURE_MATRIX", () => {
  it("FEATURE_MATRIX lives in the shared module", () => {
    const src = readSource("src/lib/shared/firm-features.ts") ?? "";
    expect(src.includes("export const FEATURE_MATRIX")).toBe(true);
    expect(src.includes("buildDefaultFeatureFlags")).toBe(true);
  });
  it("firm-hub detail page imports FEATURE_MATRIX from the shared module (no local duplicate)", () => {
    const src = readSource("src/routes/clients/firm.$firmId.index.tsx") ?? "";
    expect(src.includes('from "@/lib/shared/firm-features"')).toBe(true);
    // No local re-declaration:
    expect(/const FEATURE_MATRIX(?!:)/.test(src)).toBe(false);
  });
  it("wizard exists and uses FEATURE_MATRIX + createPortalUser server fn", () => {
    const src = readSource("src/components/firm-hub/onboarding/firm-wizard.tsx") ?? "";
    expect(src.includes("FirmOnboardingWizard")).toBe(true);
    expect(src.includes('from "@/lib/shared/firm-features"')).toBe(true);
    expect(src.includes("createPortalUser")).toBe(true);
  });
  it("wizard performs rollback delete on partial failure", () => {
    const src = readSource("src/components/firm-hub/onboarding/firm-wizard.tsx") ?? "";
    expect(src.includes('.from("firms").delete()')).toBe(true);
  });
  it("/clients list page replaces the inline dialog with the wizard", () => {
    const src = readSource("src/routes/clients/index.tsx") ?? "";
    expect(src.includes("<FirmOnboardingWizard")).toBe(true);
    expect(src.includes('.from("firms").insert(')).toBe(false);
  });
});

describe("Plan A: Portal unified access-denied + breadcrumb", () => {
  it("PortalAccessDenied component exists with stable testid + variant attr", () => {
    const src = readSource("src/components/portal/portal-access-denied.tsx") ?? "";
    expect(src.includes("PortalAccessDenied")).toBe(true);
    expect(src.includes('data-testid="portal-access-denied"')).toBe(true);
    expect(src.includes("data-variant")).toBe(true);
  });
  it("PortalBreadcrumb component exists and labels itself as breadcrumb", () => {
    const src = readSource("src/components/portal/portal-breadcrumb.tsx") ?? "";
    expect(src.includes("PortalBreadcrumb")).toBe(true);
    expect(src.includes('aria-label="breadcrumb"')).toBe(true);
  });
  it("portal task route renders PortalBreadcrumb + PortalAccessDenied (no inline Card fallbacks)", () => {
    const src = readSource("src/routes/portal/tasks.$taskId.tsx") ?? "";
    expect(src.includes("<PortalBreadcrumb")).toBe(true);
    expect(src.includes('variant="foreign-task"')).toBe(true);
    expect(src.includes('variant="no-access"')).toBe(true);
    // No leftover inline "Task not available" copy in this file.
    expect(src.includes("Task not available")).toBe(false);
  });
  it("portal project detail route renders PortalBreadcrumb + foreign-project denial", () => {
    const src = readSource("src/routes/portal.projects.$projectId.tsx") ?? "";
    expect(src.includes("<PortalBreadcrumb")).toBe(true);
    expect(src.includes('variant="foreign-project"')).toBe(true);
    expect(src.includes("Project not available")).toBe(false);
  });
  it("portal index, projects list, and inbox use PortalAccessDenied no-access variant", () => {
    for (const file of [
      "src/routes/portal.index.tsx",
      "src/routes/portal.projects.index.tsx",
      "src/routes/portal.inbox.tsx",
    ]) {
      const src = readSource(file) ?? "";
      expect(
        src.includes('variant="no-access"'),
        `${file} should render PortalAccessDenied no-access`,
      ).toBe(true);
      expect(
        src.includes("Portal access not enabled"),
        `${file} should not inline the old copy`,
      ).toBe(false);
    }
  });
});
