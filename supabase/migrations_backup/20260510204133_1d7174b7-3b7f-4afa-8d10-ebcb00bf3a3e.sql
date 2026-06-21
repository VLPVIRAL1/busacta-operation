-- 1. Add 'petty_cash' to chart-of-accounts type enum
ALTER TYPE public.coa_account_type ADD VALUE IF NOT EXISTS 'petty_cash';

-- 2. Extend petty_cash_transactions to support holder, transaction kind, transfers
ALTER TABLE public.petty_cash_transactions
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'expense'
    CHECK (kind IN ('transfer_in','transfer_out','expense')),
  ADD COLUMN IF NOT EXISTS holder_user_id uuid,
  ADD COLUMN IF NOT EXISTS to_account_id uuid,
  ADD COLUMN IF NOT EXISTS to_holder_user_id uuid,
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid;

CREATE INDEX IF NOT EXISTS idx_pct_account ON public.petty_cash_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_pct_holder  ON public.petty_cash_transactions(holder_user_id);
CREATE INDEX IF NOT EXISTS idx_pct_to_account ON public.petty_cash_transactions(to_account_id);

-- 3. Expense split lines (QuickBooks-style)
CREATE TABLE IF NOT EXISTS public.petty_cash_transaction_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.petty_cash_transactions(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pctl_tx ON public.petty_cash_transaction_lines(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pctl_acc ON public.petty_cash_transaction_lines(account_id);

ALTER TABLE public.petty_cash_transaction_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage petty_cash_lines"
  ON public.petty_cash_transaction_lines
  FOR ALL
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
  );