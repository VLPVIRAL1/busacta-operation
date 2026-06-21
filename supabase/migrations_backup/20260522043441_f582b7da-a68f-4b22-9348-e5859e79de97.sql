
-- ============================================================================
-- Banking: enums
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.bank_feed_status AS ENUM ('pending','posted','excluded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- bank_accounts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid REFERENCES public.firms(id) ON DELETE SET NULL,
  bank_name text NOT NULL,
  nickname text NOT NULL,
  masked_number text,
  currency text NOT NULL DEFAULT 'INR',
  opening_balance numeric(18,2) NOT NULL DEFAULT 0,
  opening_balance_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_accounts_firm_idx ON public.bank_accounts(firm_id) WHERE firm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS bank_accounts_active_idx ON public.bank_accounts(is_active);

DROP TRIGGER IF EXISTS bank_accounts_touch ON public.bank_accounts;
CREATE TRIGGER bank_accounts_touch BEFORE UPDATE ON public.bank_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_accounts_read ON public.bank_accounts
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
  OR public.has_role(auth.uid(), 'employee')
);

CREATE POLICY bank_accounts_write ON public.bank_accounts
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
);

-- ============================================================================
-- bank_import_batches
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bank_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  filename text NOT NULL,
  row_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  imported_by uuid,
  imported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_import_batches_account_idx
  ON public.bank_import_batches(account_id, imported_at DESC);

ALTER TABLE public.bank_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_import_batches_read ON public.bank_import_batches
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
);

CREATE POLICY bank_import_batches_write ON public.bank_import_batches
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
);

-- ============================================================================
-- bank_feed_lines
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bank_feed_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  import_batch_id uuid REFERENCES public.bank_import_batches(id) ON DELETE SET NULL,
  txn_date date NOT NULL,
  description text NOT NULL,
  description_hash text NOT NULL,
  amount numeric(18,2) NOT NULL,        -- signed: + received, - spent
  balance_after numeric(18,2),
  status public.bank_feed_status NOT NULL DEFAULT 'pending',
  vendor_id uuid,
  category_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  book_tag public.book_tag NOT NULL DEFAULT 'both',
  memo text,
  matched_invoice_id uuid,
  matched_invoice_no text,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  posted_at timestamptz,
  posted_by uuid,
  suggested_vendor_id uuid,
  suggested_category_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  suggested_book_tag public.book_tag,
  suggested_rule_id uuid,
  source text NOT NULL DEFAULT 'import',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bank_feed_lines_dedupe_idx
  ON public.bank_feed_lines (account_id, txn_date, amount, description_hash);

CREATE INDEX IF NOT EXISTS bank_feed_lines_status_idx
  ON public.bank_feed_lines (account_id, status, txn_date DESC);

DROP TRIGGER IF EXISTS bank_feed_lines_touch ON public.bank_feed_lines;
CREATE TRIGGER bank_feed_lines_touch BEFORE UPDATE ON public.bank_feed_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bank_feed_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_feed_lines_read ON public.bank_feed_lines
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
  OR public.has_role(auth.uid(), 'employee')
);

CREATE POLICY bank_feed_lines_write ON public.bank_feed_lines
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
);

-- ============================================================================
-- bank_feed_splits
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bank_feed_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id uuid NOT NULL REFERENCES public.bank_feed_lines(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  book_tag public.book_tag NOT NULL DEFAULT 'both',
  amount numeric(18,2) NOT NULL,
  memo text,
  vendor_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_feed_splits_line_idx
  ON public.bank_feed_splits (line_id, sort_order);

ALTER TABLE public.bank_feed_splits ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_feed_splits_read ON public.bank_feed_splits
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
  OR public.has_role(auth.uid(), 'employee')
);

CREATE POLICY bank_feed_splits_write ON public.bank_feed_splits
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
);

-- ============================================================================
-- bank_match_rules
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bank_match_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid REFERENCES public.firms(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  conditions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_count integer NOT NULL DEFAULT 0,
  last_matched_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_match_rules_account_idx
  ON public.bank_match_rules (account_id, is_active, priority);

DROP TRIGGER IF EXISTS bank_match_rules_touch ON public.bank_match_rules;
CREATE TRIGGER bank_match_rules_touch BEFORE UPDATE ON public.bank_match_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.bank_match_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_match_rules_read ON public.bank_match_rules
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
);

CREATE POLICY bank_match_rules_write ON public.bank_match_rules
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
);

-- ============================================================================
-- bank_match_rule_hits
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bank_match_rule_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.bank_match_rules(id) ON DELETE CASCADE,
  line_id uuid NOT NULL REFERENCES public.bank_feed_lines(id) ON DELETE CASCADE,
  auto_posted boolean NOT NULL DEFAULT false,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bank_match_rule_hits_rule_idx
  ON public.bank_match_rule_hits (rule_id, applied_at DESC);

ALTER TABLE public.bank_match_rule_hits ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_match_rule_hits_read ON public.bank_match_rule_hits
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
);

CREATE POLICY bank_match_rule_hits_write ON public.bank_match_rule_hits
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'finance_manager')
);
