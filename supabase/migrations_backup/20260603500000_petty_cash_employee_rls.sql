-- Confine the Petty Cash hub to petty-cash data for the `employee` role.
--
-- Context: Finance and Petty Cash share one database. A petty-cash post writes
-- five RLS-governed tables from the browser client: petty_cash_transactions,
-- petty_cash_transaction_lines, and the SHARED ledger (journal_entries /
-- journal_lines) with source = 'petty_cash'. To let an `employee` do petty cash
-- but nothing else in Finance, we grant employee write access to the petty-cash
-- tables and scope their ledger access strictly to source = 'petty_cash'.
--
-- These policies are ADDITIVE — existing admin/super_admin/finance_manager
-- policies are untouched, so Finance managers keep full access.
--
-- vendors / vendor_allowed_accounts already grant `employee` ALL access
-- ("Finance manage vendors" / "Finance manage vendor_allowed_accounts"), which
-- satisfies "employee may create vendors" — no change needed here.
-- reconciliations already supports employee petty-cash recon (pcr_* policies) —
-- no change needed. invoices / budgets / banking writes remain finance-only,
-- which is what makes this "petty cash only".

-- ── petty_cash_transactions ────────────────────────────────────────────────
create policy "Employee manage petty_cash_transactions"
  on public.petty_cash_transactions
  for all
  using (has_role(auth.uid(), 'employee'::app_role))
  with check (has_role(auth.uid(), 'employee'::app_role));

-- ── petty_cash_transaction_lines ───────────────────────────────────────────
create policy "Employee manage petty_cash_transaction_lines"
  on public.petty_cash_transaction_lines
  for all
  using (has_role(auth.uid(), 'employee'::app_role))
  with check (has_role(auth.uid(), 'employee'::app_role));

-- ── journal_entries (scoped to petty cash only) ────────────────────────────
create policy "Employee read petty_cash journal_entries"
  on public.journal_entries
  for select
  using (has_role(auth.uid(), 'employee'::app_role) and source = 'petty_cash'::journal_source);

create policy "Employee insert petty_cash journal_entries"
  on public.journal_entries
  for insert
  with check (has_role(auth.uid(), 'employee'::app_role) and source = 'petty_cash'::journal_source);

create policy "Employee update petty_cash journal_entries"
  on public.journal_entries
  for update
  using (has_role(auth.uid(), 'employee'::app_role) and source = 'petty_cash'::journal_source)
  with check (has_role(auth.uid(), 'employee'::app_role) and source = 'petty_cash'::journal_source);

create policy "Employee delete petty_cash journal_entries"
  on public.journal_entries
  for delete
  using (has_role(auth.uid(), 'employee'::app_role) and source = 'petty_cash'::journal_source);

-- ── journal_lines (scoped via parent entry's source) ───────────────────────
create policy "Employee read petty_cash journal_lines"
  on public.journal_lines
  for select
  using (
    has_role(auth.uid(), 'employee'::app_role)
    and exists (
      select 1 from public.journal_entries je
      where je.id = journal_lines.entry_id and je.source = 'petty_cash'::journal_source
    )
  );

create policy "Employee insert petty_cash journal_lines"
  on public.journal_lines
  for insert
  with check (
    has_role(auth.uid(), 'employee'::app_role)
    and exists (
      select 1 from public.journal_entries je
      where je.id = journal_lines.entry_id and je.source = 'petty_cash'::journal_source
    )
  );

create policy "Employee update petty_cash journal_lines"
  on public.journal_lines
  for update
  using (
    has_role(auth.uid(), 'employee'::app_role)
    and exists (
      select 1 from public.journal_entries je
      where je.id = journal_lines.entry_id and je.source = 'petty_cash'::journal_source
    )
  )
  with check (
    has_role(auth.uid(), 'employee'::app_role)
    and exists (
      select 1 from public.journal_entries je
      where je.id = journal_lines.entry_id and je.source = 'petty_cash'::journal_source
    )
  );

create policy "Employee delete petty_cash journal_lines"
  on public.journal_lines
  for delete
  using (
    has_role(auth.uid(), 'employee'::app_role)
    and exists (
      select 1 from public.journal_entries je
      where je.id = journal_lines.entry_id and je.source = 'petty_cash'::journal_source
    )
  );

-- ── chart_of_accounts (read all; create petty-cash-enabled accounts only) ──
create policy "Employee read chart_of_accounts"
  on public.chart_of_accounts
  for select
  using (has_role(auth.uid(), 'employee'::app_role));

create policy "Employee create petty_cash chart_of_accounts"
  on public.chart_of_accounts
  for insert
  with check (has_role(auth.uid(), 'employee'::app_role) and enable_for_petty_cash = true);
-- Intentionally no UPDATE/DELETE for employee on chart_of_accounts: cannot edit
-- or remove core finance accounts (read + limited write).
