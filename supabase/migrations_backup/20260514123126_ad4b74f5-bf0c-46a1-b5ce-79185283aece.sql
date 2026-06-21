
-- 1. Set search_path on the two append-only block functions
ALTER FUNCTION public.audit_log_block_mutation() SET search_path = public;
ALTER FUNCTION public.sal_block_mutation() SET search_path = public;

-- 2. Revoke EXECUTE from PUBLIC and anon on all SECURITY DEFINER functions in public.
-- These are RLS helpers, auth helpers, and admin actions — never needed for unauthenticated callers.
DO $$
DECLARE
  r record;
  sig text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    sig := format('public.%I(%s)', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', sig);
  END LOOP;
END$$;

-- 3. Revoke EXECUTE from `authenticated` on functions that should ONLY be invoked
-- by trusted server code (service_role) — never directly via PostgREST RPC by end users.
REVOKE EXECUTE ON FUNCTION public.revoke_user_sessions(_user_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_auth_attempt(_identifier text, _kind text, _success boolean, _ip inet, _ua text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_auth_rate_limited(_identifier text, _kind text, _max_failures integer, _window_minutes integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_sensitive_action(_action text, _target_id text, _ip inet, _ua text, _details jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_access(_resource_type text, _resource_id text, _reason text) FROM authenticated;
