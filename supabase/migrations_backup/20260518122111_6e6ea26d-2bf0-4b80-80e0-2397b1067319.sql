-- Time Logs audit history
CREATE TABLE public.time_log_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_log_id uuid NOT NULL REFERENCES public.time_logs(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('create','update','bulk_update','undo')),
  before jsonb,
  after jsonb,
  fields text[] NOT NULL DEFAULT '{}',
  bulk_op_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_log_audit_time_log_id ON public.time_log_audit(time_log_id, created_at DESC);
CREATE INDEX idx_time_log_audit_bulk_op_id ON public.time_log_audit(bulk_op_id) WHERE bulk_op_id IS NOT NULL;

ALTER TABLE public.time_log_audit ENABLE ROW LEVEL SECURITY;

-- Owner or admin/super_admin can view
CREATE POLICY "Owner or admin can view time log audit"
ON public.time_log_audit
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.time_logs tl
    WHERE tl.id = time_log_audit.time_log_id
      AND (tl.user_id = auth.uid()
           OR public.has_role(auth.uid(), 'admin')
           OR public.has_role(auth.uid(), 'super_admin'))
  )
);

-- No direct insert/update/delete from clients; trigger writes rows via SECURITY DEFINER.

-- Trigger function
CREATE OR REPLACE FUNCTION public.fn_time_logs_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_before jsonb;
  v_after jsonb;
  v_fields text[] := '{}';
  v_bulk uuid;
  v_actor uuid;
BEGIN
  BEGIN
    v_bulk := NULLIF(current_setting('app.bulk_op_id', true), '')::uuid;
  EXCEPTION WHEN others THEN v_bulk := NULL;
  END;
  v_actor := auth.uid();

  IF (TG_OP = 'INSERT') THEN
    v_action := 'create';
    v_before := NULL;
    v_after := to_jsonb(NEW);
  ELSIF (TG_OP = 'UPDATE') THEN
    v_action := CASE WHEN v_bulk IS NOT NULL THEN 'bulk_update' ELSE 'update' END;
    v_before := to_jsonb(OLD);
    v_after := to_jsonb(NEW);
    -- Compute changed fields among the editable set
    IF COALESCE(OLD.break_minutes, -1) IS DISTINCT FROM COALESCE(NEW.break_minutes, -1) THEN v_fields := v_fields || 'break_minutes'; END IF;
    IF COALESCE(OLD.effective_override, -1) IS DISTINCT FROM COALESCE(NEW.effective_override, -1) THEN v_fields := v_fields || 'effective_override'; END IF;
    IF COALESCE(OLD.note, '') IS DISTINCT FROM COALESCE(NEW.note, '') THEN v_fields := v_fields || 'note'; END IF;
    IF COALESCE(OLD.billable, false) IS DISTINCT FROM COALESCE(NEW.billable, false) THEN v_fields := v_fields || 'billable'; END IF;
    IF COALESCE(OLD.started_at, 'epoch'::timestamptz) IS DISTINCT FROM COALESCE(NEW.started_at, 'epoch'::timestamptz) THEN v_fields := v_fields || 'started_at'; END IF;
    IF COALESCE(OLD.ended_at, 'epoch'::timestamptz) IS DISTINCT FROM COALESCE(NEW.ended_at, 'epoch'::timestamptz) THEN v_fields := v_fields || 'ended_at'; END IF;
    IF COALESCE(OLD.duration_minutes, -1) IS DISTINCT FROM COALESCE(NEW.duration_minutes, -1) THEN v_fields := v_fields || 'duration_minutes'; END IF;
    -- Skip writing audit if nothing meaningful changed
    IF array_length(v_fields, 1) IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.time_log_audit (time_log_id, actor_id, action, before, after, fields, bulk_op_id)
  VALUES (NEW.id, v_actor, v_action, v_before, v_after, v_fields, v_bulk);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_logs_audit ON public.time_logs;
CREATE TRIGGER trg_time_logs_audit
AFTER INSERT OR UPDATE ON public.time_logs
FOR EACH ROW
EXECUTE FUNCTION public.fn_time_logs_audit();