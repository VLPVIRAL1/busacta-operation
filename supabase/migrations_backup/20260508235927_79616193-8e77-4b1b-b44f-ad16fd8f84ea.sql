
DO $$ BEGIN
  CREATE TYPE public.petty_cash_entry_type AS ENUM ('issuance','top_up','refund','adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.petty_cash_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  entry_type public.petty_cash_entry_type NOT NULL DEFAULT 'issuance',
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  description text NOT NULL,
  category text,
  recipient text,
  reference text,
  receipt_url text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS petty_cash_entries_date_idx ON public.petty_cash_entries (entry_date DESC, created_at DESC);

ALTER TABLE public.petty_cash_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Finance can view petty cash" ON public.petty_cash_entries;
CREATE POLICY "Finance can view petty cash" ON public.petty_cash_entries
  FOR SELECT USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'finance_manager')
  );

DROP POLICY IF EXISTS "Finance can insert petty cash" ON public.petty_cash_entries;
CREATE POLICY "Finance can insert petty cash" ON public.petty_cash_entries
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'finance_manager')
  );

DROP POLICY IF EXISTS "Finance can update petty cash" ON public.petty_cash_entries;
CREATE POLICY "Finance can update petty cash" ON public.petty_cash_entries
  FOR UPDATE USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'finance_manager')
  );

DROP POLICY IF EXISTS "Finance can delete petty cash" ON public.petty_cash_entries;
CREATE POLICY "Finance can delete petty cash" ON public.petty_cash_entries
  FOR DELETE USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'finance_manager')
  );

DROP TRIGGER IF EXISTS trg_petty_cash_updated_at ON public.petty_cash_entries;
CREATE TRIGGER trg_petty_cash_updated_at
  BEFORE UPDATE ON public.petty_cash_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
