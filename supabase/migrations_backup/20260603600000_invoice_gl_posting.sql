-- Invoice GL posting: accrual revenue recognition at invoice issue.
--
-- Background: raising an invoice and clearing payment previously produced ZERO
-- revenue on the P&L. Invoice creation never wrote a journal entry, and the
-- payment posting only did Dr Bank / Cr A/R against an A/R that was never
-- debited. This migration adds the schema needed for the app to post a balanced
-- accrual entry (Dr A/R / Cr Revenue / Cr Tax Payable) when an invoice is sent.

-- 1. Link journal entries to the invoice they post for.
--    The reporting layer (finance-reports.tsx) already filters on
--    journal_entries.invoice_id; this column makes that resolve real rows.
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_je_invoice ON public.journal_entries(invoice_id);

-- 2. Default GL account mapping used when an invoice has no per-invoice override.
--    Nullable firm_id allows a global default (firm_id IS NULL) plus optional
--    per-firm overrides later. Exactly one active row per firm scope.
CREATE TABLE IF NOT EXISTS public.finance_gl_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid REFERENCES public.firms(id) ON DELETE CASCADE,
  ar_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  revenue_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  tax_payable_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One mapping row per firm scope (global row has firm_id IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_gl_defaults_global
  ON public.finance_gl_defaults ((firm_id IS NULL)) WHERE firm_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_gl_defaults_firm
  ON public.finance_gl_defaults (firm_id) WHERE firm_id IS NOT NULL;

ALTER TABLE public.finance_gl_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage gl defaults" ON public.finance_gl_defaults FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'));

CREATE TRIGGER trg_fgd_updated BEFORE UPDATE ON public.finance_gl_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Optional per-invoice account overrides. When null, posting falls back to
--    finance_gl_defaults. Stored on the invoice so reversal is deterministic.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ar_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revenue_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;
