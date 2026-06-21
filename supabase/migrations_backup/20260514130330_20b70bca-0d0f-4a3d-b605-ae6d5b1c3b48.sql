-- 1) Harden task_capability() with explicit allow-list (no dynamic identifier interpolation)
CREATE OR REPLACE FUNCTION public.task_capability(_task_id uuid, _capability text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ok boolean;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'employee') THEN
    RETURN true;
  END IF;
  SELECT CASE _capability
    WHEN 'can_view'               THEN tp.can_view
    WHEN 'can_edit_fields'        THEN tp.can_edit_fields
    WHEN 'can_edit_time'          THEN tp.can_edit_time
    WHEN 'can_manage_subtasks'    THEN tp.can_manage_subtasks
    WHEN 'can_manage_attachments' THEN tp.can_manage_attachments
    WHEN 'can_change_status'      THEN tp.can_change_status
    ELSE NULL
  END
  INTO ok
  FROM public.task_permissions tp
  WHERE tp.task_id = _task_id AND tp.user_id = auth.uid();
  RETURN COALESCE(ok, false);
END $function$;

-- 2) Idempotency keys for server actions
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key            text PRIMARY KEY,
  actor_id       uuid NOT NULL,
  scope          text NOT NULL,
  request_hash   text,
  response       jsonb,
  status         text NOT NULL DEFAULT 'completed' CHECK (status IN ('in_progress','completed','failed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idempotency_keys_actor_scope_idx
  ON public.idempotency_keys (actor_id, scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idempotency_keys_expires_idx
  ON public.idempotency_keys (expires_at);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Actors can read their own idempotency keys"
  ON public.idempotency_keys FOR SELECT
  TO authenticated
  USING (actor_id = auth.uid()
         OR public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Actors insert their own idempotency keys"
  ON public.idempotency_keys FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE POLICY "Actors update their own idempotency keys"
  ON public.idempotency_keys FOR UPDATE
  TO authenticated
  USING (actor_id = auth.uid())
  WITH CHECK (actor_id = auth.uid());

-- 3) Restore drill log (business continuity evidence)
CREATE TABLE IF NOT EXISTS public.restore_drill_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_date    date NOT NULL DEFAULT CURRENT_DATE,
  performed_by  uuid NOT NULL,
  scope         text NOT NULL,
  outcome       text NOT NULL CHECK (outcome IN ('success','partial','failed')),
  rto_minutes   int,
  rpo_minutes   int,
  notes         text,
  evidence_url  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.restore_drill_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read restore_drill_log"
  ON public.restore_drill_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin')
         OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Super admin records restore drills"
  ON public.restore_drill_log FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin')
              AND performed_by = auth.uid());

-- Audit changes to both new tables
DROP TRIGGER IF EXISTS trg_idempotency_keys_audit ON public.idempotency_keys;
CREATE TRIGGER trg_idempotency_keys_audit
AFTER INSERT OR UPDATE OR DELETE ON public.idempotency_keys
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();

DROP TRIGGER IF EXISTS trg_restore_drill_log_audit ON public.restore_drill_log;
CREATE TRIGGER trg_restore_drill_log_audit
AFTER INSERT OR UPDATE OR DELETE ON public.restore_drill_log
FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes();