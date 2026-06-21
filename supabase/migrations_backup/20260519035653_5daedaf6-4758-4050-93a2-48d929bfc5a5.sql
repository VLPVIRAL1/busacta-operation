
-- Employee audit log: append-only record of HR mutations
CREATE TABLE IF NOT EXISTS public.employee_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL CHECK (action IN (
    'create','update','deactivate','reactivate',
    'permissions_change','portal_lockout_verified','portal_lockout_failed',
    'imported','bulk_import_failed'
  )),
  before jsonb,
  after jsonb,
  changed_fields text[] NOT NULL DEFAULT '{}',
  context jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_audit_target_idx
  ON public.employee_audit (target_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS employee_audit_actor_idx
  ON public.employee_audit (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS employee_audit_action_idx
  ON public.employee_audit (action, occurred_at DESC);

ALTER TABLE public.employee_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR can read employee audit"
  ON public.employee_audit FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

-- Append-only: block UPDATE/DELETE for everyone (service role bypasses RLS for inserts)
CREATE OR REPLACE FUNCTION public.employee_audit_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'employee_audit is append-only: % not permitted', TG_OP;
END $$;

DROP TRIGGER IF EXISTS employee_audit_block_update ON public.employee_audit;
CREATE TRIGGER employee_audit_block_update
  BEFORE UPDATE OR DELETE ON public.employee_audit
  FOR EACH ROW EXECUTE FUNCTION public.employee_audit_block_mutation();

-- Bulk-import run tracking
CREATE TABLE IF NOT EXISTS public.employee_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  file_name text,
  total_rows int NOT NULL DEFAULT 0,
  valid_rows int NOT NULL DEFAULT 0,
  imported_rows int NOT NULL DEFAULT 0,
  failed_rows int NOT NULL DEFAULT 0,
  failures jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS employee_import_runs_actor_idx
  ON public.employee_import_runs (actor_id, started_at DESC);

ALTER TABLE public.employee_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR can read employee import runs"
  ON public.employee_import_runs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

-- Add an optional run-id link on employee_audit (allows correlating audit rows
-- with the bulk import that produced them).
ALTER TABLE public.employee_audit
  ADD COLUMN IF NOT EXISTS import_run_id uuid REFERENCES public.employee_import_runs(id) ON DELETE SET NULL;

-- Track portal lockout explicitly on profiles (defensive flag in addition to
-- removing the client role + firm_contacts entry).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false;
