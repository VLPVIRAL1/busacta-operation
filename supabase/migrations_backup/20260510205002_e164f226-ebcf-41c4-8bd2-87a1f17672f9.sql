-- Petty cash reconciliations
CREATE TYPE public.petty_cash_recon_status AS ENUM ('draft','submitted','approved','rejected');

CREATE TABLE public.petty_cash_reconciliations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  holder_user_id uuid,
  reconciliation_date date NOT NULL DEFAULT CURRENT_DATE,
  opening_balance numeric NOT NULL DEFAULT 0,
  system_balance numeric NOT NULL DEFAULT 0,
  counted_amount numeric NOT NULL DEFAULT 0,
  variance numeric NOT NULL DEFAULT 0,
  status public.petty_cash_recon_status NOT NULL DEFAULT 'draft',
  notes text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pcr_account ON public.petty_cash_reconciliations(account_id);
CREATE INDEX idx_pcr_date ON public.petty_cash_reconciliations(reconciliation_date);

ALTER TABLE public.petty_cash_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage petty_cash_reconciliations"
ON public.petty_cash_reconciliations
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'finance_manager'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'finance_manager'::app_role));

CREATE TRIGGER pcr_updated_at
BEFORE UPDATE ON public.petty_cash_reconciliations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();