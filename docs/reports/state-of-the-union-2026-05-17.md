# State of the Union — BusAcTa Operations

Audit date: 2026-05-17. Scope: full repo (`src/`, `supabase/`, `.lovable/plan.md`
history), 122 public DB tables, 11-hub product blueprint.

---

## 1. COMPLETED & LOCKED (The Foundation)

These surfaces are feature-complete, visually polished, and **byte-for-byte
locked** by the DRY Guardrails (Vitest registry asserts + ESLint registry
guard + codemod Golden patterns).

| Surface                                                                                             | Files / scope                                                                                                                                                                                            | Lock mechanism                                                                             |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Task View** (Notes, Open Points / Action Items, Subtasks, Files, Communication, Task Information) | `src/routes/ops/tasks.$taskId.tsx` + `src/components/ops/task-notes-panel.tsx`, `task-action-items-panel.tsx`, `subtask-list.tsx`, `document-manager.tsx`, `task-links-panel.tsx`, `task-edit-sheet.tsx` | Registered Originals; smoke asserts exports                                                |
| **Communication Hub** (inbox, threads, DM, composer, pinned/starred, reactions, snoozes, presence)  | `src/routes/ops/communication.tsx` + entire `src/components/ops/communication/` folder + `direct-messages-page.tsx`                                                                                      | Whole folder Golden in codemod; smoke asserts FilterBar not imported                       |
| **Open Points** (filter row, scope list, dialog)                                                    | `src/components/ops/open-points/`                                                                                                                                                                        | Golden; inline filter preserved                                                            |
| **Petty Cash** (ledger, accounts, payment, reconciliation, P&L, by-account, vendors, audit)         | entire `src/components/petty-cash/` + `src/routes/petty-cash/`                                                                                                                                           | Whole tree Golden in codemod                                                               |
| **Finance Chart of Accounts**                                                                       | `src/components/finance/chart-of-accounts-page.tsx`                                                                                                                                                      | Golden; smoke asserts file present                                                         |
| **Task Timer** (start/stop, multi-person, effective-hours dialog, recovery)                         | `src/components/ops/timer-widget.tsx`, `timer-group.tsx`, `effective-hours-stop-dialog.tsx`, `subtask-timer-button.tsx`, `floating-timer.tsx`                                                            | `TaskTimerControl` registered                                                              |
| **DRY UI Shells**                                                                                   | `PageHeader`, `EmptyState`, `ExportMenu`, `DateRangeFilter`, `AssigneeStack`, `FilterBar`, `PeoplePicker` / `SinglePersonPicker` / `MultiPersonPicker`                                                   | Registry of 17 Originals; 64/64 Vitest asserts                                             |
| **To-Do split pane** (Phase B reuse contract)                                                       | `src/components/ops/todos/todos-detail-pane.tsx`                                                                                                                                                         | Embedded-Golden import contract locked in smoke test                                       |
| **Auth & MFA**                                                                                      | login, forgot/reset password, MFA setup + backup codes, trusted-device, invitations, captcha, device-limit gate                                                                                          | `src/lib/auth/*`, `src/components/auth/*`                                                  |
| **Realtime infrastructure**                                                                         | `notif-<userId>`, `firm-realtime-<firmId>` topics with `realtime.messages` RLS                                                                                                                           | Core rule pinned in memory                                                                 |
| **Mobile / desktop shells**                                                                         | Capacitor mobile shell, Electron desktop release pipeline + signed update URLs                                                                                                                           | `electron/`, `mobile/`, `src/lib/desktop/`                                                 |
| **Compliance docs**                                                                                 | Privacy, Security, Acceptable Use, Access Control, BCP, BYOD, Change Mgmt, Incident Response, Onboarding/Offboarding, Vendor Mgmt                                                                        | `docs/compliance/*`                                                                        |
| **DRY tooling**                                                                                     | ESLint registry guard, codemod (468 files, 0 rewrites), in-app DRY Checklist Modal                                                                                                                       | `eslint.config.js`, `scripts/dry-codemod.ts`, `src/components/dev/dry-checklist-modal.tsx` |
| **Regression safety net**                                                                           | Vitest smoke (64 asserts) + Playwright skip-by-default E2E (Goldens + filter surfaces)                                                                                                                   | `src/__tests__/dry-smoke.test.ts`, `e2e/dry-smoke.spec.ts`                                 |

---

## 2. PARTIALLY COMPLETE (Needs Polish or Wiring)

Pages that render but are missing backend wiring, UX polish, or a documented
integration step.

### 2a. Task communication (the two items at the end of your message)

- **"Share with Client" toggle per task message** — schema is ready
  (`task_messages.is_client_visible boolean default false`), but the
  composer in `task-action-items-panel` / task thread doesn't expose a
  per-message toggle. Default-Internal is already the DB default; needs
  a UI control + portal-side filter that respects the flag.
- **File attachments inside the task thread message panel** — schema
  ready (`task_attachments.message_id` FK), upload helper exists
  (`document-manager`), but the task-thread composer doesn't have an
  attach button wired to it. Drag-and-drop overlay exists in
  Communication (`dropzone-overlay.tsx`) — pattern can be mirrored.

### 2b. Filter call sites (deferred from Batch 2/3)

- `projects.index.tsx` — `MultiSelectCombobox` + URL search params; functional, not on `FilterBar`.
- `activity-audit.tsx` — native `<Select>` + date inputs; no date-range slot on `FilterBar` yet.
- `todos-table.tsx` — 1,760 lines; people-filter + bulk-bar; high blast radius.
- Smoke manifest pins them so drift is detected, but they are not consolidated.

### 2c. Finance

- **Invoicing** — invoice list, detail, create, proforma, payment routes present;
  needs end-to-end QA against the "ONE project per invoice" rule and the
  Task-Based vs Hourly billing engine.
- **Budgets** (`finance/budgets.tsx`) and **Forecasts** (`finance/forecasts.tsx`) — routes exist with `budgets` + `budget_actuals` tables; UI completeness unknown without deeper QA.
- **Reports** — AR, Balance Sheet, Cash Flow, Client Billing, P&L, Revenue per Client, Unbilled — routes scaffolded; data wiring depth varies.
- **Ledgers** — `client-ledger.tsx`, `general.tsx` scaffolded; journal_entries / journal_lines tables exist; double-entry coverage to verify.
- **Vendor management** — list + detail routes exist but VendorDialog is registered as Petty-Cash-canonical; Finance vendor flows may duplicate.

### 2d. Firm Hub

- `firm-hub/index.tsx`, `$firmId.tsx`, `$firmId.index.tsx`, `$firmId.projects.$projectId.tsx`, `$firmId.return-types.tsx`, `folder-library.tsx`, `matrix.tsx`, `projects.tsx` — CEO-only segregation enforced. Project creation + pricing wiring depth unverified end-to-end.
- `project-pricing-rules`, `project_custom_field_defs/values`, `project_return_types`, `project_pipeline_stages`, `project_feature_toggles` — rich schema; UI coverage incomplete.

### 2e. Ops "Heavy" pages

- `ops/projects.index.tsx` (596 lines) — works but bypasses several DRY primitives by design (Batch 3 Path A audit).
- `ops/firms.$firmId.*` tabs (pipeline, sops, timesheet, communication, client-info, clients, activity) — full tab set scaffolded; depth varies per tab.
- `ops/templates.tsx`, `ops/reports.tsx`, `ops/time-logs.tsx`, `ops/activity.tsx` — Tier-C4/C5 surfaces, render but UX polish pending.

### 2f. Admin

- `admin/team.tsx`, `roles.tsx`, `hub-permissions.tsx` — role + hub-permission management exists; final UX for invite + role-assignment flow needs verification.
- `admin/compliance.tsx`, `go-live.tsx`, `restore-drill.tsx`, `rls-check.tsx`, `security-issues.tsx`, `incident-response.tsx` — compliance dashboards present; depth varies.

### 2g. Document Manager

- Canonical `DocumentManager` is embedded in Task View + To-Do detail pane and works there. Project-level Files tab on the project workspace and the firm-hub Project Documents tab need confirmation they reuse the same component (vs. shipping a parallel viewer).

---

## 3. THE BACKLOG (Pending / Untouched Modules)

Major hubs/features from the 11-Hub blueprint that are either deferred or
exist only as route stubs.

### 3a. HR Hub (per blueprint: no training, CSV-import only for punches)

- `hr/index.tsx`, `attendance.tsx`, `attendance.import.tsx`, `employees.tsx`, `tardiness.tsx` — routes exist; schema present (`attendance_logs`, `attendance_entries`, `staff_compensation`, `leave_requests`, `company_hr_settings`).
- `hr/training.tsx` exists but blueprint says HR has NO training — this likely needs to be **removed from HR** (training belongs to `/learning`).
- No `EmployeePicker` Original exists yet (Batch 2 left this out of scope).

### 3b. Learning Hub (independent Tier-1)

- `learning/index.tsx`, `learning/courses.tsx` — routes exist.
- `training_courses`, `training_assignments` tables present.
- Certifications page from the blueprint not yet scaffolded.

### 3c. Client Portal

- `portal.tsx` + `portal/upload.$token.tsx` exist (token-gated file request upload works).
- Full portal experience (task visibility filtered by `is_client_visible`, document delivery, signed file-request links, portal-side messaging) is largely unbuilt.
- Portal users table (`portal_users.functions.ts`) and invitations exist; client-facing UI shells minimal.

### 3d. Firm-Hub Client Entity creation

- `client_entities`, `clients`, `firm_contacts`, `firm_contact_capabilities`, `firm_internal_team`, `firm_member_capabilities`, `firm_lifecycle_events`, `entity_notes` — full schema present.
- CEO-side firm + entity + project creation flow exists (`/firm-hub`) but end-to-end "create firm → entities → project → assign team → set pricing" is not consolidated into a guided wizard.

### 3e. Advanced Billing / Ledgers

- Double-entry primitives exist (`journal_entries`, `journal_lines`).
- Invoicing-to-GL posting, payment-to-GL reconciliation, multi-currency, tax handling — not visibly wired.
- AR aging, dunning, recurring invoices — backlog.

### 3f. Growth Hub

- `growth/index.tsx`, `growth/leads.tsx`, `growth/marketing.tsx` — routes exist; `leads`, `lead_activities` tables present. Pipeline + conversion flow minimal.

### 3g. Internal Hub

- `internal/index.tsx`, `assets.tsx`, `keys.tsx`, `tickets.tsx` — `internal_assets`, `office_keys`, `office_key_assignments`, `internal_tickets`, `internal_ticket_comments` present. Internal ops UX is bare-bones.

### 3h. Dashboard (personal landing)

- `dashboard.tsx` exists; blueprint says it should hold condensed report widgets. Widget set vs. blueprint not yet enumerated.

### 3i. Notifications & Push

- `notifications`, `notification_prefs`, `thread_notification_prefs`, `device_push_tokens`, `send-push.functions.ts` exist. Per-channel routing rules and preference UI depth unknown.

### 3j. Workflow Templates

- `workflow_templates`, `workflow_template_projects`, `workflow_template_firms`, `template_checklist_items`, `project_task_options`, `folder_library_templates` — heavy schema. `/ops/templates` route exists; full template authoring + deployment UX is backlog.

---

## 4. PROPOSED NEXT STEPS — Three Strategic Paths

### Path A — "Client-Facing Surface" (Portal + Task-Message Visibility)

**Scope:** Implement the two trailing asks in your message as a single coherent slice, then extend to the Client Portal.

1. Add `<ClientShareToggle>` to the task-thread composer. Default "Internal Only" (matches DB default `is_client_visible=false`). Persist on send. Render an "Internal / Shared" pill on each message bubble in Task View.
2. Add file attachments to the task-thread composer: paperclip + drag-drop (reuse Communication's `dropzone-overlay.tsx` pattern). Insert into `task_attachments` with `message_id`. Render thumbnails inline.
3. Build the portal task view that respects `is_client_visible`. Surface shared messages + shared attachments to portal users only.
4. Portal navigation, branding (per-firm), and notification routing for client replies.

- **Business value:** unlocks the entire external-client workflow — the product's revenue-facing surface. The CEO can finally ship-to-client without screen-sharing.
- **Engineering effort:** Medium. DB schema is ready. Task View is Golden so the composer additions land in the embedded panels, not in `tasks.$taskId.tsx` body (Guardrail-safe).
- **Why it follows now:** the two trailing asks are the unblocker; the portal is the natural extension that justifies them.

### Path B — "Finance & Billing Hardening"

**Scope:** Take the existing finance routes from "scaffolded" to "audit-ready".

1. End-to-end test the Task-Based vs Hourly billing engine through invoice creation, line-item generation, and payment recording.
2. Wire invoice/payment posting to `journal_entries` + `journal_lines` so the GL, P&L, and Balance Sheet reports reconcile.
3. Polish the report pages (AR, Cash Flow, Revenue per Client, Unbilled) with the existing DRY `DateRangeFilter`, `ExportMenu`, `PageHeader` primitives.
4. Decide Vendor canonicalization (Petty Cash vs Finance) and consolidate via the registered `VendorDialog` Original.

- **Business value:** turns the app from operational into bookkeep-able; this is the data the CEO uses to make decisions and that an external accountant audits.
- **Engineering effort:** Medium-High. Schema mostly present; risk lives in posting logic + the "ONE project per invoice" + Task/Hourly invariants. No Golden Master conflicts.
- **Why it follows now:** Petty Cash + Finance COA are already locked Originals; this builds the rest of the finance stack on top of stable foundations.

### Path C — "Firm Hub Wizard + Workflow Templates"

**Scope:** Make the CEO-side setup hub feel like a guided product.

1. Build a "Create Firm → Entities → Project → Team → Pricing" wizard on `/firm-hub` that uses the existing `client_entities`, `firm_contacts`, `firm_internal_team`, `project_pricing_rules` tables.
2. Ship the Workflow Templates authoring UI on `/ops/templates`: template → checklist items → folder library → deploy to project. All tables exist.
3. Add the Project Custom Fields editor (`project_custom_field_defs/values`) so the CEO can extend project shape without code.
4. Project Documents tab on firm-hub and Project workspace — reuse the canonical `DocumentManager` (already DRY-locked).

- **Business value:** dramatically reduces time-to-first-project for new firms; turns power-user setup work into one-click templates. This is the leverage feature.
- **Engineering effort:** High (wizard + template authoring is real UI work) but very low risk — entirely new surfaces, no Golden Masters touched.
- **Why it follows now:** the Ops execution layer is locked; Firm Hub is where work originates. Without a smooth setup, the locked Ops surfaces stay underused.

---

## Recommendation

If you want the **fastest visible win** that also closes the two trailing asks
in your message → **Path A**.
If you want the **biggest financial-control unlock** → **Path B**.
If you want the **highest long-term leverage on adoption** → **Path C**.

The Defensive Guardrails remain permanently active for all three.
