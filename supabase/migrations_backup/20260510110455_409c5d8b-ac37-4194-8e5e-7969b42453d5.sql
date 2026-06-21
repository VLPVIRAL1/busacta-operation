-- Forex on invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS is_forex boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fx_rate numeric,
  ADD COLUMN IF NOT EXISTS usd_total numeric,
  ADD COLUMN IF NOT EXISTS usd_subtotal numeric,
  ADD COLUMN IF NOT EXISTS usd_tax numeric;

-- Forex on payments
ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS is_forex boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fx_rate numeric,
  ADD COLUMN IF NOT EXISTS usd_amount numeric;

-- Forex on journal entries
ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS is_forex boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fx_rate numeric;

-- Forex on journal lines (per-line USD)
ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS usd_debit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS usd_credit numeric NOT NULL DEFAULT 0;

-- Extend budget_scope enum with account-level scopes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.budget_scope'::regtype AND enumlabel = 'account') THEN
    ALTER TYPE public.budget_scope ADD VALUE 'account';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'public.budget_scope'::regtype AND enumlabel = 'firm_account') THEN
    ALTER TYPE public.budget_scope ADD VALUE 'firm_account';
  END IF;
END$$;

-- Direct linkage columns on budgets (alongside scope_ref text)
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS firm_id uuid,
  ADD COLUMN IF NOT EXISTS account_id uuid;

CREATE INDEX IF NOT EXISTS idx_budgets_firm ON public.budgets(firm_id);
CREATE INDEX IF NOT EXISTS idx_budgets_account ON public.budgets(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_forex ON public.invoices(is_forex);
CREATE INDEX IF NOT EXISTS idx_je_forex ON public.journal_entries(is_forex);