-- ============================================================
-- 1) RENAME petty cash reconciliation tables to generic names
-- ============================================================

ALTER TABLE public.petty_cash_reconciliations RENAME TO reconciliations;
ALTER TABLE public.petty_cash_recon_audit     RENAME TO recon_audit;
ALTER TABLE public.petty_cash_recon_clearings RENAME TO recon_clearings;

-- Constraint renames so future migrations can find them by stable names
ALTER TABLE public.reconciliations
  RENAME CONSTRAINT petty_cash_reconciliations_account_id_fkey TO reconciliations_account_id_fkey;
ALTER TABLE public.reconciliations
  RENAME CONSTRAINT petty_cash_reconciliations_assigned_to_fkey TO reconciliations_assigned_to_fkey;
ALTER TABLE public.recon_audit
  RENAME CONSTRAINT petty_cash_recon_audit_reconciliation_id_fkey TO recon_audit_reconciliation_id_fkey;
ALTER TABLE public.recon_audit
  RENAME CONSTRAINT petty_cash_recon_audit_actor_id_fkey TO recon_audit_actor_id_fkey;
ALTER TABLE public.recon_clearings
  RENAME CONSTRAINT petty_cash_recon_clearings_reconciliation_id_fkey TO recon_clearings_reconciliation_id_fkey;

-- ============================================================
-- 2) Add scope + polymorphic FK on reconciliations
-- ============================================================

ALTER TABLE public.reconciliations
  ADD COLUMN scope text NOT NULL DEFAULT 'petty_cash',
  ADD COLUMN bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE RESTRICT;

-- existing rows are petty cash; account_id stays as is
UPDATE public.reconciliations SET scope = 'petty_cash' WHERE scope IS NULL;

-- account_id is petty-cash only now; allow NULL for bank rows
ALTER TABLE public.reconciliations ALTER COLUMN account_id DROP NOT NULL;

ALTER TABLE public.reconciliations
  ADD CONSTRAINT reconciliations_scope_chk CHECK (scope IN ('petty_cash','bank')),
  ADD CONSTRAINT reconciliations_scope_target_chk CHECK (
    (scope = 'petty_cash' AND account_id IS NOT NULL AND bank_account_id IS NULL)
    OR
    (scope = 'bank' AND bank_account_id IS NOT NULL AND account_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS reconciliations_scope_idx ON public.reconciliations(scope);
CREATE INDEX IF NOT EXISTS reconciliations_bank_account_idx ON public.reconciliations(bank_account_id) WHERE bank_account_id IS NOT NULL;

-- ============================================================
-- 3) Polymorphic clearings: support bank feed lines too
-- ============================================================

-- Drop strict FK on transaction_id; we now allow either pointer
ALTER TABLE public.recon_clearings
  DROP CONSTRAINT IF EXISTS petty_cash_recon_clearings_transaction_id_fkey,
  ALTER COLUMN transaction_id DROP NOT NULL;

ALTER TABLE public.recon_clearings
  ADD COLUMN source_kind text NOT NULL DEFAULT 'petty_cash_transaction',
  ADD COLUMN bank_feed_line_id uuid REFERENCES public.bank_feed_lines(id) ON DELETE CASCADE;

ALTER TABLE public.recon_clearings
  ADD CONSTRAINT recon_clearings_source_chk CHECK (
    source_kind IN ('petty_cash_transaction','bank_feed_line')
  ),
  ADD CONSTRAINT recon_clearings_target_chk CHECK (
    (source_kind = 'petty_cash_transaction' AND transaction_id IS NOT NULL AND bank_feed_line_id IS NULL)
    OR
    (source_kind = 'bank_feed_line' AND bank_feed_line_id IS NOT NULL AND transaction_id IS NULL)
  );

-- Re-add a soft FK on transaction_id for the petty-cash side (no cascade — done by NULL allowed now)
-- Actually keep cascade behaviour from before
ALTER TABLE public.recon_clearings
  ADD CONSTRAINT recon_clearings_transaction_id_fkey
  FOREIGN KEY (transaction_id) REFERENCES public.petty_cash_transactions(id) ON DELETE CASCADE;

-- Drop the old unique constraint that only covered transaction_id, add per-source uniqueness
ALTER TABLE public.recon_clearings
  DROP CONSTRAINT IF EXISTS petty_cash_recon_clearings_reconciliation_id_transaction_id_key;

CREATE UNIQUE INDEX recon_clearings_unique_tx
  ON public.recon_clearings(reconciliation_id, transaction_id)
  WHERE transaction_id IS NOT NULL;
CREATE UNIQUE INDEX recon_clearings_unique_bfl
  ON public.recon_clearings(reconciliation_id, bank_feed_line_id)
  WHERE bank_feed_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS recon_clearings_bfl_idx ON public.recon_clearings(bank_feed_line_id) WHERE bank_feed_line_id IS NOT NULL;

-- ============================================================
-- 4) Recreate RLS policies that referenced the old table names
-- ============================================================

-- recon_audit policies reference the parent table in EXISTS subqueries
DROP POLICY IF EXISTS recon_audit_insert ON public.recon_audit;
DROP POLICY IF EXISTS recon_audit_select ON public.recon_audit;

CREATE POLICY recon_audit_select ON public.recon_audit
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.reconciliations r
      WHERE r.id = recon_audit.reconciliation_id
        AND (r.created_by = auth.uid() OR r.assigned_to = auth.uid())
    )
  );

CREATE POLICY recon_audit_insert ON public.recon_audit
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid() AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'finance_manager'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.reconciliations r
        WHERE r.id = recon_audit.reconciliation_id
          AND r.created_by = auth.uid()
      )
    )
  );

-- ============================================================
-- 5) Recurring Schedules (Invoices + Transactions)
-- ============================================================

CREATE TABLE public.recurring_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('invoice','transaction')),
  template        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- payload used to generate each run
  frequency       text NOT NULL CHECK (frequency IN ('daily','weekly','monthly','yearly')),
  interval_n      int  NOT NULL DEFAULT 1 CHECK (interval_n >= 1),
  day_of_month    int  CHECK (day_of_month BETWEEN 1 AND 31),
  day_of_week     int  CHECK (day_of_week BETWEEN 0 AND 6),
  start_date      date NOT NULL,
  end_date        date,
  next_run_date   date NOT NULL,
  last_run_at     timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  notes           text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recurring_schedules_kind_idx ON public.recurring_schedules(kind);
CREATE INDEX recurring_schedules_next_run_idx ON public.recurring_schedules(next_run_date) WHERE is_active = true;

ALTER TABLE public.recurring_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_schedules_select ON public.recurring_schedules
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
  );

CREATE POLICY recurring_schedules_write ON public.recurring_schedules
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
  );

CREATE TABLE public.recurring_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id   uuid NOT NULL REFERENCES public.recurring_schedules(id) ON DELETE CASCADE,
  run_date      date NOT NULL,
  status        text NOT NULL DEFAULT 'success' CHECK (status IN ('success','error','skipped')),
  target_kind   text,    -- 'invoice' | 'journal_entry'
  target_id     uuid,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recurring_runs_schedule_idx ON public.recurring_runs(schedule_id, run_date DESC);

ALTER TABLE public.recurring_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_runs_select ON public.recurring_runs
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
  );

CREATE POLICY recurring_runs_insert ON public.recurring_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'finance_manager'::app_role)
  );

-- updated_at trigger reuse
CREATE TRIGGER recurring_schedules_updated_at
  BEFORE UPDATE ON public.recurring_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();