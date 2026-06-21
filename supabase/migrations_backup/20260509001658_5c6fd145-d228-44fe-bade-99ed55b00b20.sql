
CREATE TYPE public.budget_scope AS ENUM ('department', 'project', 'firm', 'general');
CREATE TYPE public.budget_period AS ENUM ('monthly', 'quarterly', 'annual', 'custom');
CREATE TYPE public.budget_status AS ENUM ('draft', 'active', 'closed');

CREATE TABLE public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  scope public.budget_scope NOT NULL DEFAULT 'general',
  scope_ref TEXT,
  period public.budget_period NOT NULL DEFAULT 'monthly',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  planned_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  status public.budget_status NOT NULL DEFAULT 'active',
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage budgets"
  ON public.budgets FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'finance_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'finance_manager')
  );

CREATE TRIGGER budgets_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.budget_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  category TEXT,
  source_ref TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_actuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage actuals"
  ON public.budget_actuals FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'finance_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'finance_manager')
  );

CREATE TRIGGER budget_actuals_updated_at
  BEFORE UPDATE ON public.budget_actuals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX budget_actuals_budget_idx ON public.budget_actuals(budget_id, entry_date DESC);
