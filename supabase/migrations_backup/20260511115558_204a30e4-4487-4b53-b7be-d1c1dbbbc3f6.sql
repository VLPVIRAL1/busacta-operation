
-- 1. Add cash_bank to coa_account_type enum
ALTER TYPE public.coa_account_type ADD VALUE IF NOT EXISTS 'cash_bank';

-- 2. Vendor master
CREATE TABLE IF NOT EXISTS public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  email text,
  phone text,
  notes text,
  is_petty_cash_enabled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  firm_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendors_firm ON public.vendors(firm_id);
CREATE INDEX IF NOT EXISTS idx_vendors_petty_cash ON public.vendors(is_petty_cash_enabled) WHERE is_petty_cash_enabled = true;

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage vendors"
  ON public.vendors FOR ALL
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'finance_manager'::app_role) OR has_role(auth.uid(),'hr_manager'::app_role) OR has_role(auth.uid(),'employee'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'finance_manager'::app_role) OR has_role(auth.uid(),'hr_manager'::app_role) OR has_role(auth.uid(),'employee'::app_role));

CREATE POLICY "Staff read vendors"
  ON public.vendors FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER trg_vendors_updated
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Vendor allowed GL accounts pivot
CREATE TABLE IF NOT EXISTS public.vendor_allowed_accounts (
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (vendor_id, account_id)
);

ALTER TABLE public.vendor_allowed_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage vendor_allowed_accounts"
  ON public.vendor_allowed_accounts FOR ALL
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'finance_manager'::app_role) OR has_role(auth.uid(),'hr_manager'::app_role) OR has_role(auth.uid(),'employee'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'finance_manager'::app_role) OR has_role(auth.uid(),'hr_manager'::app_role) OR has_role(auth.uid(),'employee'::app_role));

CREATE POLICY "Staff read vendor_allowed_accounts"
  ON public.vendor_allowed_accounts FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- 4. Petty cash transactions extensions
ALTER TABLE public.petty_cash_transactions
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pct_vendor ON public.petty_cash_transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_pct_draft ON public.petty_cash_transactions(is_draft) WHERE is_draft = true;

-- 5. Reconciliation history / undo
ALTER TABLE public.petty_cash_reconciliations
  ADD COLUMN IF NOT EXISTS is_undone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS undone_at timestamptz,
  ADD COLUMN IF NOT EXISTS undone_by uuid;
