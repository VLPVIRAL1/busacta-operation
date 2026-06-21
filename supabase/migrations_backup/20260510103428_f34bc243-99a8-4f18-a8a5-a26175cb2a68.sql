
-- ============== ENUMS ==============
CREATE TYPE public.coa_account_type AS ENUM ('asset','liability','equity','revenue','expense');
CREATE TYPE public.journal_source AS ENUM ('manual','invoice','payment','petty_cash');
CREATE TYPE public.petty_cash_direction AS ENUM ('in','out');
CREATE TYPE public.invoice_type AS ENUM ('invoice','proforma');
CREATE TYPE public.invoice_status AS ENUM ('draft','sent','partial','paid','void');
CREATE TYPE public.invoice_line_source AS ENUM ('time_log','task','manual');

-- ============== CHART OF ACCOUNTS ==============
CREATE TABLE public.chart_of_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  gl_code text NOT NULL UNIQUE,
  is_group boolean NOT NULL DEFAULT false,
  parent_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  account_type public.coa_account_type NOT NULL,
  description text,
  enable_for_petty_cash boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coa_parent ON public.chart_of_accounts(parent_id);
CREATE INDEX idx_coa_type ON public.chart_of_accounts(account_type);
ALTER TABLE public.chart_of_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage COA" ON public.chart_of_accounts FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'));

CREATE TRIGGER trg_coa_updated BEFORE UPDATE ON public.chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== JOURNAL ENTRIES ==============
CREATE SEQUENCE public.journal_entry_no_seq START 1;

CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_no text NOT NULL UNIQUE DEFAULT ('JE-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.journal_entry_no_seq')::text,5,'0')),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  narration text,
  source public.journal_source NOT NULL DEFAULT 'manual',
  source_ref text,
  posted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage journal entries" ON public.journal_entries FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'));

CREATE TRIGGER trg_je_updated BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== JOURNAL LINES ==============
CREATE TABLE public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  debit numeric(14,2) NOT NULL DEFAULT 0,
  credit numeric(14,2) NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_jl_one_side CHECK ((debit = 0 AND credit > 0) OR (credit = 0 AND debit > 0))
);
CREATE INDEX idx_jl_entry ON public.journal_lines(entry_id);
CREATE INDEX idx_jl_account ON public.journal_lines(account_id);
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage journal lines" ON public.journal_lines FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'));

-- Trigger: when posting (posted_at set), debit total must equal credit total
CREATE OR REPLACE FUNCTION public.enforce_journal_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d numeric; c numeric;
BEGIN
  IF NEW.posted_at IS NOT NULL AND (OLD.posted_at IS NULL OR OLD.posted_at IS DISTINCT FROM NEW.posted_at) THEN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO d, c
      FROM public.journal_lines WHERE entry_id = NEW.id;
    IF d <> c OR d = 0 THEN
      RAISE EXCEPTION 'Journal entry % is unbalanced (debit % vs credit %)', NEW.entry_no, d, c;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_je_balance BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_journal_balance();

-- ============== PETTY CASH TRANSACTIONS (new, linked to COA) ==============
CREATE TABLE public.petty_cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  direction public.petty_cash_direction NOT NULL,
  description text NOT NULL,
  recipient text,
  reference text,
  receipt_url text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.petty_cash_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage petty_cash_transactions" ON public.petty_cash_transactions FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'));

CREATE TRIGGER trg_pct_updated BEFORE UPDATE ON public.petty_cash_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== INVOICES ==============
CREATE SEQUENCE public.invoice_no_seq START 1;
CREATE SEQUENCE public.proforma_no_seq START 1;

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL UNIQUE,
  type public.invoice_type NOT NULL DEFAULT 'invoice',
  firm_id uuid REFERENCES public.firms(id) ON DELETE RESTRICT,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  currency text NOT NULL DEFAULT 'INR',
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  tax numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  amount_paid numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_firm ON public.invoices(firm_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage invoices" ON public.invoices FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'));

CREATE TRIGGER trg_inv_updated BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-fill invoice_no if blank
CREATE OR REPLACE FUNCTION public.assign_invoice_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.invoice_no IS NULL OR NEW.invoice_no = '' THEN
    IF NEW.type = 'proforma' THEN
      NEW.invoice_no := 'PRO-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.proforma_no_seq')::text,5,'0');
    ELSE
      NEW.invoice_no := 'INV-' || to_char(now(),'YYYY') || '-' || lpad(nextval('public.invoice_no_seq')::text,5,'0');
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_invoices_no BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_no();

-- ============== INVOICE LINE ITEMS ==============
CREATE TABLE public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(14,2) NOT NULL DEFAULT 1,
  rate numeric(14,2) NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  source_type public.invoice_line_source NOT NULL DEFAULT 'manual',
  source_ref text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ili_invoice ON public.invoice_line_items(invoice_id);
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage invoice line items" ON public.invoice_line_items FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'));

-- ============== INVOICE PAYMENTS ==============
CREATE TABLE public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method text,
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_invp_invoice ON public.invoice_payments(invoice_id);
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance manage invoice payments" ON public.invoice_payments FOR ALL
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'finance_manager'));

-- ============== PROFILE: hourly_rate ==============
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hourly_rate numeric(14,2) DEFAULT 0;

-- ============== TASKS: fixed_fee + billed_invoice_id (only if tasks table exists) ==============
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tasks') THEN
    EXECUTE 'ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS fixed_fee numeric(14,2) DEFAULT 0';
    EXECUTE 'ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS billed_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='time_logs') THEN
    EXECUTE 'ALTER TABLE public.time_logs ADD COLUMN IF NOT EXISTS billed_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL';
  END IF;
END $$;
