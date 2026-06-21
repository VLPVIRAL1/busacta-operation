
-- =========================================================
-- Phase 2: Unified Audit Trail
-- =========================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_id      uuid,
  actor_role    text,
  action        text NOT NULL,
  resource_type text NOT NULL,
  resource_id   text,
  before        jsonb,
  after         jsonb,
  ip            inet,
  user_agent    text,
  request_id    text,
  reason        text
);

CREATE INDEX IF NOT EXISTS idx_audit_log_occurred       ON public.audit_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor          ON public.audit_log (actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource       ON public.audit_log (resource_type, resource_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action         ON public.audit_log (action, occurred_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Read: only admins / super_admins
DROP POLICY IF EXISTS "audit_log_admin_read" ON public.audit_log;
CREATE POLICY "audit_log_admin_read"
ON public.audit_log
FOR SELECT
USING (
  public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- No direct INSERT/UPDATE/DELETE policies => RLS blocks all client writes.
-- Inserts happen via SECURITY DEFINER triggers/functions that bypass RLS by design.

-- Append-only enforcement: block UPDATE & DELETE at the trigger level for ALL roles
-- including service_role / postgres, except a single retention function.
CREATE OR REPLACE FUNCTION public.audit_log_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.audit_log_prune', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'audit_log is append-only: % not permitted', TG_OP;
END $$;

DROP TRIGGER IF EXISTS audit_log_no_update ON public.audit_log;
CREATE TRIGGER audit_log_no_update
BEFORE UPDATE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_mutation();

DROP TRIGGER IF EXISTS audit_log_no_delete ON public.audit_log;
CREATE TRIGGER audit_log_no_delete
BEFORE DELETE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_mutation();

REVOKE ALL ON public.audit_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

-- =========================================================
-- Generic row-change audit trigger
-- =========================================================
CREATE OR REPLACE FUNCTION public.audit_row_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _role  text;
  _rid   text;
BEGIN
  BEGIN
    SELECT public.current_user_role()::text INTO _role;
  EXCEPTION WHEN OTHERS THEN
    _role := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    _rid := COALESCE((to_jsonb(OLD)->>'id'), NULL);
    INSERT INTO public.audit_log (actor_id, actor_role, action, resource_type, resource_id, before, after)
    VALUES (_actor, _role, 'delete', TG_TABLE_NAME, _rid, to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    _rid := COALESCE((to_jsonb(NEW)->>'id'), NULL);
    INSERT INTO public.audit_log (actor_id, actor_role, action, resource_type, resource_id, before, after)
    VALUES (_actor, _role, 'insert', TG_TABLE_NAME, _rid, NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Skip no-op updates
    IF to_jsonb(NEW) = to_jsonb(OLD) THEN
      RETURN NEW;
    END IF;
    _rid := COALESCE((to_jsonb(NEW)->>'id'), NULL);
    INSERT INTO public.audit_log (actor_id, actor_role, action, resource_type, resource_id, before, after)
    VALUES (_actor, _role, 'update', TG_TABLE_NAME, _rid, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.audit_row_changes() FROM PUBLIC, anon, authenticated;

-- Helper to attach the trigger uniformly
DO $$
DECLARE
  t text;
  audited_tables text[] := ARRAY[
    'profiles',
    'user_roles',
    'firms',
    'firm_contacts',
    'invoices',
    'journal_entries',
    'journal_lines',
    'petty_cash_transactions',
    'task_action_items',
    'task_messages',
    'task_notes',
    'invitations',
    'app_settings'
  ];
BEGIN
  FOREACH t IN ARRAY audited_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_changes ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER audit_changes AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_changes()',
        t
      );
    END IF;
  END LOOP;
END $$;

-- =========================================================
-- Sensitive-read logger (called from server functions)
-- =========================================================
CREATE OR REPLACE FUNCTION public.log_access(
  _resource_type text,
  _resource_id   text,
  _reason        text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _role text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  BEGIN
    SELECT public.current_user_role()::text INTO _role;
  EXCEPTION WHEN OTHERS THEN
    _role := NULL;
  END;
  INSERT INTO public.audit_log (actor_id, actor_role, action, resource_type, resource_id, reason)
  VALUES (auth.uid(), _role, 'read', _resource_type, _resource_id, _reason);
END $$;

REVOKE EXECUTE ON FUNCTION public.log_access(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_access(text, text, text) TO authenticated;

-- =========================================================
-- Retention: 7-year prune (SOC 2 / HIPAA aligned)
-- =========================================================
CREATE OR REPLACE FUNCTION public.prune_audit_log()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _deleted bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super_admin may prune audit_log';
  END IF;
  PERFORM set_config('app.audit_log_prune', 'on', true);
  WITH d AS (
    DELETE FROM public.audit_log WHERE occurred_at < (now() - INTERVAL '7 years') RETURNING 1
  ) SELECT count(*) INTO _deleted FROM d;
  PERFORM set_config('app.audit_log_prune', 'off', true);
  RETURN _deleted;
END $$;

REVOKE EXECUTE ON FUNCTION public.prune_audit_log() FROM PUBLIC, anon, authenticated;
