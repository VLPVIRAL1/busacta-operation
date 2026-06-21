-- Scale Activity / Time Logs / Notifications grids to multi-million row volumes.
-- Adds composite indexes that support (a) keyset pagination ordered by created_at/started_at DESC
-- and (b) the most common filter pushdowns (actor, task, event, user). All built CONCURRENTLY is
-- impossible inside a transaction; this migration is small enough to take a brief lock instead.

-- task_audit (Activity History)
CREATE INDEX IF NOT EXISTS task_audit_created_id_desc
  ON public.task_audit (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS task_audit_actor_created
  ON public.task_audit (actor_id, created_at DESC) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS task_audit_task_created
  ON public.task_audit (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS task_audit_event_created
  ON public.task_audit (event_type, created_at DESC);

-- time_logs
CREATE INDEX IF NOT EXISTS time_logs_started_id_desc
  ON public.time_logs (started_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS time_logs_user_started
  ON public.time_logs (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS time_logs_task_started
  ON public.time_logs (task_id, started_at DESC);

-- notifications: keyset over (user, pinned, created_at, id)
CREATE INDEX IF NOT EXISTS notifications_user_pin_created_id
  ON public.notifications (user_id, is_pinned DESC, created_at DESC, id DESC);

-- Fast "approximately how many rows" for footer counts — avoids exact COUNT(*) on 5M rows.
CREATE OR REPLACE FUNCTION public.table_row_estimate(p_table regclass)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT GREATEST(reltuples, 0)::bigint
  FROM pg_class
  WHERE oid = p_table;
$$;

GRANT EXECUTE ON FUNCTION public.table_row_estimate(regclass) TO authenticated;