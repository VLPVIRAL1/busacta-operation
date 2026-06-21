-- Transaction type taxonomy + consistent GL posting for all recording modes.
--
-- Every way of recording a transaction (manual journal, invoice, customer
-- receipt, vendor payment, bank feed, payroll, petty cash) should produce a
-- journal_entries row tagged with a specific source, so the ledger is uniform
-- and edit screens can show "how this was recorded".

-- 1. Extend the journal_source enum. 'manual' is shown as "Journal".
--    (ADD VALUE is idempotent and safe to re-run.)
ALTER TYPE public.journal_source ADD VALUE IF NOT EXISTS 'receipt';
ALTER TYPE public.journal_source ADD VALUE IF NOT EXISTS 'payroll';
ALTER TYPE public.journal_source ADD VALUE IF NOT EXISTS 'bank';

-- 2. Link a payroll run to the journal entry it posts (mirrors invoices.invoice_id
--    and bank_feed_lines.journal_entry_id).
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

-- 3. Payroll GL account mapping on the existing global finance_gl_defaults row.
--    Bank-feed posting needs no extra map: it uses bank_accounts.gl_account_id
--    (bank side) and bank_feed_lines.category_account_id (contra side).
ALTER TABLE public.finance_gl_defaults
  ADD COLUMN IF NOT EXISTS salary_expense_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS net_salary_payable_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pf_payable_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pt_payable_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS tds_payable_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS other_deductions_payable_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT;
