# Smoke report — 2026-05-19

## Phase 1 — Hierarchy History filters & export

**Files changed**

- `src/lib/hr/hierarchy.server.ts` — added `search` filter (resolves matching profile ids by name/email ILIKE) and `unlimited` mode (caps at 5000, no pagination); date-range `to` extended to end-of-day for `YYYY-MM-DD` inputs.
- `src/lib/hr/hierarchy.functions.ts` — `listHierarchyHistory` now accepts `search`; added new `exportHierarchyHistory` server fn with `scope: "filtered" | "all"`.
- `src/components/hr/hierarchy-history-panel.tsx` — rewrote with filter bar (search box, employee chip, "changed by" chip, date-range picker, Reset), and Download dropdown offering **Export filtered (N)** and **Download all**. Accepts `nodes` prop for chip option lists.
- `src/routes/hr/hierarchy.tsx` — passes the loaded org tree to the panel.

**Manual verification path**

1. `/hr/hierarchy → History` — filter bar renders above the table.
2. Apply employee filter → list narrows; `Export filtered (N)` matches displayed total.
3. Apply date range → SQL `gte/lte` filters apply; end date is inclusive.
4. Search "vir" — matches employees or actors whose name/email contains "vir".
5. `Download all` → server returns up to 5000 rows ignoring filters; CSV named `org-hierarchy-history-all-YYYY-MM-DD.csv`.

## Phase 2 — Temporary MFA enforcement toggle

**DB migration**

- Seeded `app_settings` row `security = {"mfa_enforcement_enabled": true}`.
- Rewrote `public.mfa_enforcement_status()` to read the flag and return `compliant=true` when the flag is off.

**Files changed**

- `src/routes/admin/compliance.tsx` — added "MFA enforcement" card with a Switch (admin-only). On toggle, upserts into `app_settings`; existing `audit_row_changes` trigger writes the change to the audit log automatically. Visual treatment turns amber when disabled and includes a "Temporary — re-enable before launch" reminder.

**Path:** `/admin/compliance` → MFA enforcement card → toggle off → confirmation toast → audit log row appears in the "Audit log (latest 100)" table below.

App-level sign-in gate (`AuthGuard`) was already disabled in code; the toggle now controls the _server-reported_ enforcement state and any future re-enablement point.

## Phase 3 — Petty Cash reporting wiring

**Audit result: PASS — no rewires needed.**

Every petty-cash report already reads from the consolidated tables:

- `petty_cash_transactions` — `usePcTransactions`, `usePcTransactionsBefore`, dashboard, by-account report.
- `petty_cash_transaction_lines` — `usePcLines`, by-account split breakdown.
- `chart_of_accounts` filtered to `account_type='petty_cash'` for the account picker (per Core memory rule).

Reports verified to be live against canonical tables: P&L (`/petty-cash/pl`), Cash Flow (`/petty-cash/cash-flow`), By-Account (`/petty-cash/accounts`), Ledger (`/petty-cash/ledger`), GL (`/petty-cash/gl`), Dashboard (`/petty-cash`).

No legacy `petty_cash_entries`/`petty_cash_payments`/`petty_cash_ledger` references exist in the codebase. If specific report tiles are still missing in your environment, send their names and I'll add them in a follow-up.

## Phase 6 — Golden Master smoke checks (deferred)

Will run end-to-end after you exercise the Phase 1–3 changes in preview and confirm they behave as expected. Holding off so I don't conflate fresh-edit issues with Golden Master regressions.
