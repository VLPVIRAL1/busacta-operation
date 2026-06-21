
-- 1. Add designated custodian field on chart_of_accounts
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS designated_holder_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coa_designated_holder
  ON public.chart_of_accounts(designated_holder_user_id)
  WHERE account_type = 'petty_cash';

-- 2. Drop legacy custodian columns from petty_cash_transactions (destroys legacy custodian data)
ALTER TABLE public.petty_cash_transactions
  DROP COLUMN IF EXISTS holder_user_id,
  DROP COLUMN IF EXISTS to_holder_user_id;
