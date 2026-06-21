ALTER TABLE public.chart_of_accounts DROP COLUMN IF EXISTS designated_holder_user_id;
ALTER TABLE public.petty_cash_reconciliations DROP COLUMN IF EXISTS holder_user_id;