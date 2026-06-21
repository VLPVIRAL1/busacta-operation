# HR QA Audit Report — 2026-05-19

Walked the four modules against the team's checklist. Status legend: ✅ PASS · ⚠️ PARTIAL · ❌ FAIL · 🔧 FIXED THIS PASS.

## Module 1 — Employee Directory (`/hr/employees`)

| Item                                                                                                              | Status | Notes                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Route loads                                                                                                       | ✅     | Mounts inside `AppShell` with HR breadcrumbs.                                                                                                          |
| `h-screen` lock, scroll inside data area                                                                          | ✅     | Page chrome handled by `AppShell`; body scroll disabled per project core rules.                                                                        |
| Sticky filter bar with Search / Department / Position / Role                                                      | ⚠️     | Sticky bar present with Search + Department + Position + Status + Firm. **Role filter not surfaced** (role is set only at create time).                |
| Grid ↔ List toggle                                                                                                | ✅     | Icon toggle (LayoutGrid / List) on the right of the filter bar.                                                                                        |
| `+ Add Employee` top-right                                                                                        | ✅     | Plus + label, primary button in PageHeader actions.                                                                                                    |
| Slide-out drawer (Sheet) for create                                                                               | ✅     | `EmployeeCreateSheet`, right side, `sm:max-w-xl`.                                                                                                      |
| Form grouped Basic / Job / System Access                                                                          | ✅     | Three `<Section>` blocks in that order.                                                                                                                |
| Required fields complete                                                                                          | ✅     | First / Last / Email / Phone / Employee ID / Department / Position / Position title / Employment type / Join date / Role / Assigned firm.              |
| Role dropdown excludes `client`                                                                                   | ✅     | `ROLE_OPTIONS` = employee · hr_manager · finance_manager · admin · super_admin. Inline alert reminds creators that client provisioning is portal-only. |
| Created employee appears in Admin → Team                                                                          | ✅     | `createEmployee` writes `profiles` + `user_roles` — same source Admin/Team Management reads.                                                           |
| Kebab actions: Edit / Audit / Verify lockout / View attendance / Resend invite / Send password reset / Deactivate | ✅     | All present in `EmployeeRowActions`. (Checklist asked for 3 — we ship 7.)                                                                              |
| Deactivate flips status, no delete                                                                                | ✅     | `deactivateEmployee` sets `status = 'inactive'`; row stays in list (Status filter defaults to Active, so re-set to "All" to see it).                   |

## Module 2 — Attendance Import (`/hr/attendance/import`)

| Item                                       | Status | Notes                                                                                                                                                         |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route opens without 404/blank              | ✅     | Fixed earlier — renamed to `attendance.import.index.tsx`.                                                                                                     |
| Large file (1000+ rows) responsive         | ✅     | XLSX parsed in `src/workers/xlsx-parser.worker.ts`; CSV streamed via PapaParse with progress reporting.                                                       |
| Header-mapping presets                     | ✅     | `PresetBar` component (save/load/set-default). Default preset auto-applies on file load.                                                                      |
| Per-field validation flags                 | ✅     | `validateMapping` → `mappingIssuesByField`; each select shows red border + inline error before Step 3 is enabled.                                             |
| Manual override for low-confidence matches | ✅     | `MatchResolver` panel groups unmatched / fuzzy_name rows with a picker.                                                                                       |
| Policy-rule summary on preview             | ✅     | `ValidationSummary` lists Late, Early, Below half/full day, Invalid date/time, Missing name, Unmatched, DB insert error — each with the triggering threshold. |
| Post-commit success CSV download           | ✅     | `ImportResultsPanel` exposes succeeded-row CSV.                                                                                                               |
| Failures panel with reasons                | ✅     | Same panel — failures list with per-row error message.                                                                                                        |
| Error CSV + one-click Retry                | ✅     | "Export errors" + "Retry failed rows" buttons; retry creates a new run with `parent_run_id` linking back.                                                     |
| Historical log of runs                     | ✅     | `/hr/attendance/import/history` lists file name, timestamp, row counts; per-run detail at `/hr/attendance/import/history/$runId`.                             |

## Module 3 — Employee Hierarchy (`/hr/hierarchy`)

| Item                                              | Status | Notes                                                                                                                                                                                           |
| ------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route loads                                       | ✅     | Verified against `Nick@busacta.com` — Tree/List/History tabs render.                                                                                                                            |
| Pan (drag/scroll)                                 | ✅     | Outer scroller has `overflow-auto`.                                                                                                                                                             |
| **Zoom in/out**                                   | 🔧     | Added zoom controls (− / % readout / + / Fit) and ⌘+wheel zoom inside `OrgChartCanvas`. Range 40 %–200 %, step 10 %.                                                                            |
| Node card shows avatar, name, title, dept, status | ✅     | `OrgChartNode` renders all five.                                                                                                                                                                |
| Focus state: highlight chain + reports, dim rest  | ✅     | `focusChain` (ancestors) + `highlightedIds` (direct reports) + `opacity-30` on others.                                                                                                          |
| Edit button hidden for employees                  | ✅     | `canEdit = roles ∋ {hr_manager, super_admin, admin}`; button only rendered when `canEdit`.                                                                                                      |
| Single root with no manager                       | ✅     | `roots = byParent.get(null)`; renders any number of roots side-by-side.                                                                                                                         |
| Edit dropdown lists active profiles only          | ✅     | `getOrgTreeServer` filters to active profiles; popover further excludes self + descendants.                                                                                                     |
| Circular loop prevented                           | ✅     | Two-layer guard: client excludes descendants from picker; Postgres `prevent_reporting_cycle` trigger walks up to 100 levels and raises on cycle. Surfaces as a toast via `useMutation.onError`. |
| Tree updates without hard refresh                 | ✅     | Mutation invalidates `["hr","org-tree"]` and `["hr","descendants"]`.                                                                                                                            |
| History tab logs before/after + actor             | ✅     | `HierarchyHistoryPanel` reads `profiles_hierarchy_history`.                                                                                                                                     |

## Module 4 — Bulk Operations & Security

| Item                                        | Status | Notes                                                                                                                                                                                                                                     |
| ------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Template download on `/hr/employees/import` | ✅     | `downloadEmployeeTemplate()` in `employee-import-wizard.tsx`.                                                                                                                                                                             |
| Retry failed rows on bulk import            | ✅     | `RotateCcw` button; new run linked by `parent_run_id`.                                                                                                                                                                                    |
| Audit page filter by date + event type      | ✅     | `From` / `To` date inputs + `FacetedMultiChip` of 11 event types.                                                                                                                                                                         |
| Audit page CSV export of filtered set       | ✅     | `exportEmployeeAuditCsv` server fn with 50 000-row cap warning.                                                                                                                                                                           |
| Resend invitation in row menu               | ✅     | `resendEmployeeInvite({ kind: "invite" })` — 60 s throttle, success toast with target email.                                                                                                                                              |
| Send password reset in row menu             | ✅     | Same fn with `kind: "recovery"`.                                                                                                                                                                                                          |
| Resend / reset surfaced on audit page       | ⚠️     | Audit rows show events, not employee handles, so per-row resend is not directly applicable. Resend remains on the employee row in the directory and on `EmployeeAuditTimeline` accessed via the per-employee "View audit history" dialog. |

## Fix applied this pass

- **`src/components/hr/org-chart-canvas.tsx`**: Added an overlay zoom toolbar (−, % readout, +, Fit) and ⌘/Ctrl + wheel zoom. Scales the inner tree with `transform: scale()` and `origin-top-left`, preserving scroll-based pan.

## Recommended follow-ups (out of this pass)

1. **Role filter on `/hr/employees`** — would require joining `user_roles` into the directory query. Small addition; skipped here to keep scope tight.
2. **Resend action from audit page rows** — audit rows reference `target_user_id`; could add a dropdown jump-to-employee with resend baked in.
