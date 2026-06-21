
-- 1. Drop legacy budgeting (no historical data to preserve)
DROP TABLE IF EXISTS public.budget_actuals CASCADE;
DROP TABLE IF EXISTS public.budgets CASCADE;
DROP TYPE IF EXISTS public.budget_scope CASCADE;
DROP TYPE IF EXISTS public.budget_period CASCADE;
DROP TYPE IF EXISTS public.budget_status CASCADE;

-- 2. Add 'payroll' to Chart of Accounts type enum
ALTER TYPE public.coa_account_type ADD VALUE IF NOT EXISTS 'payroll';

-- 3. Budget Journal enums
DO $$ BEGIN
  CREATE TYPE public.budget_reporting_book AS ENUM ('both','tax_only','actual_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.budget_journal_status AS ENUM ('draft','posted','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.budget_line_sub_type AS ENUM ('client_revenue','payroll','expense');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.budget_line_entity_type AS ENUM ('customer','employee','vendor','none');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Parent table
CREATE TABLE public.budget_journals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL CHECK (length(trim(title)) >= 3),
  start_date      date NOT NULL,
  end_date        date NOT NULL,
  reporting_book  public.budget_reporting_book NOT NULL DEFAULT 'both',
  status          public.budget_journal_status NOT NULL DEFAULT 'draft',
  notes           text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT budget_journals_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_budget_journals_date ON public.budget_journals (start_date, end_date);
CREATE INDEX idx_budget_journals_status ON public.budget_journals (status);

-- 5. Child table
CREATE TABLE public.budget_journal_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_journal_id  uuid NOT NULL REFERENCES public.budget_journals(id) ON DELETE CASCADE,
  line_no            int  NOT NULL,
  sub_type           public.budget_line_sub_type NOT NULL,
  entity_type        public.budget_line_entity_type NOT NULL,
  entity_id          uuid,
  account_id         uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  description        text,
  amount             numeric(18,2) NOT NULL CHECK (amount > 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (budget_journal_id, line_no),
  CONSTRAINT budget_line_entity_presence CHECK (
    (entity_type = 'none' AND entity_id IS NULL)
    OR (entity_type <> 'none' AND entity_id IS NOT NULL)
  )
);

CREATE INDEX idx_budget_lines_journal ON public.budget_journal_lines (budget_journal_id, line_no);
CREATE INDEX idx_budget_lines_subtype ON public.budget_journal_lines (sub_type);
CREATE INDEX idx_budget_lines_entity ON public.budget_journal_lines (entity_type, entity_id);
CREATE INDEX idx_budget_lines_account ON public.budget_journal_lines (account_id);

-- 6. Validation trigger: sub_type ↔ entity_type ↔ account_type matrix + entity existence
CREATE OR REPLACE FUNCTION public.validate_budget_journal_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_acct_type public.coa_account_type;
  v_exists boolean;
BEGIN
  -- (a) sub_type ↔ entity_type mapping
  IF NEW.sub_type = 'client_revenue' AND NEW.entity_type <> 'customer' THEN
    RAISE EXCEPTION 'Client Revenue lines require entity_type = customer';
  ELSIF NEW.sub_type = 'payroll' AND NEW.entity_type <> 'employee' THEN
    RAISE EXCEPTION 'Payroll lines require entity_type = employee';
  ELSIF NEW.sub_type = 'expense' AND NEW.entity_type NOT IN ('vendor','none') THEN
    RAISE EXCEPTION 'Expense lines require entity_type = vendor or none';
  END IF;

  -- (b) entity existence (polymorphic FK check)
  IF NEW.entity_type = 'customer' THEN
    SELECT EXISTS(SELECT 1 FROM public.firms WHERE id = NEW.entity_id)
        OR EXISTS(SELECT 1 FROM public.direct_clients WHERE id = NEW.entity_id)
      INTO v_exists;
    IF NOT v_exists THEN
      RAISE EXCEPTION 'Customer % not found (firms or direct_clients)', NEW.entity_id;
    END IF;
  ELSIF NEW.entity_type = 'employee' THEN
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = NEW.entity_id) INTO v_exists;
    IF NOT v_exists THEN
      RAISE EXCEPTION 'Employee % not found', NEW.entity_id;
    END IF;
  ELSIF NEW.entity_type = 'vendor' THEN
    SELECT EXISTS(SELECT 1 FROM public.vendors WHERE id = NEW.entity_id) INTO v_exists;
    IF NOT v_exists THEN
      RAISE EXCEPTION 'Vendor % not found', NEW.entity_id;
    END IF;
  END IF;

  -- (c) account_type ↔ sub_type matrix
  SELECT account_type INTO v_acct_type FROM public.chart_of_accounts
    WHERE id = NEW.account_id AND is_active = true;
  IF v_acct_type IS NULL THEN
    RAISE EXCEPTION 'Account % not found or inactive', NEW.account_id;
  END IF;

  IF NEW.sub_type = 'client_revenue' AND v_acct_type <> 'revenue' THEN
    RAISE EXCEPTION 'Client Revenue lines require a Revenue account (got %)', v_acct_type;
  ELSIF NEW.sub_type = 'payroll' AND v_acct_type <> 'payroll' THEN
    RAISE EXCEPTION 'Payroll lines require a Payroll account (got %)', v_acct_type;
  ELSIF NEW.sub_type = 'expense' AND v_acct_type <> 'expense' THEN
    RAISE EXCEPTION 'Expense lines require an Expense account (got %)', v_acct_type;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_budget_journal_line
  BEFORE INSERT OR UPDATE ON public.budget_journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.validate_budget_journal_line();

-- 7. updated_at triggers
CREATE TRIGGER trg_budget_journals_updated_at
  BEFORE UPDATE ON public.budget_journals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_budget_journal_lines_updated_at
  BEFORE UPDATE ON public.budget_journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. RLS
ALTER TABLE public.budget_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance can manage budget journals"
  ON public.budget_journals FOR ALL
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
    OR public.has_role(auth.uid(),'finance_manager'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
    OR public.has_role(auth.uid(),'finance_manager'::public.app_role)
  );

CREATE POLICY "Employees can read budget journals"
  ON public.budget_journals FOR SELECT
  USING (
    public.has_role(auth.uid(),'employee'::public.app_role)
    OR public.has_role(auth.uid(),'hr_manager'::public.app_role)
  );

CREATE POLICY "Finance can manage budget journal lines"
  ON public.budget_journal_lines FOR ALL
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
    OR public.has_role(auth.uid(),'finance_manager'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR public.has_role(auth.uid(),'super_admin'::public.app_role)
    OR public.has_role(auth.uid(),'finance_manager'::public.app_role)
  );

CREATE POLICY "Employees can read budget journal lines"
  ON public.budget_journal_lines FOR SELECT
  USING (
    public.has_role(auth.uid(),'employee'::public.app_role)
    OR public.has_role(auth.uid(),'hr_manager'::public.app_role)
  );
