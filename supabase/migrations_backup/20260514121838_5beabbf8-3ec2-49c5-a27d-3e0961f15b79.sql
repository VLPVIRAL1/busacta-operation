
-- =========================================================
-- Phase 3: Auth hardening
-- =========================================================

-- ---------- 1. Rate limiting ----------
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  id          bigserial PRIMARY KEY,
  identifier  text NOT NULL,        -- email or IP
  kind        text NOT NULL,        -- 'login' | 'password_reset' | 'mfa'
  occurred_at timestamptz NOT NULL DEFAULT now(),
  success     boolean NOT NULL DEFAULT false,
  ip          inet,
  user_agent  text
);
CREATE INDEX IF NOT EXISTS idx_arl_identifier_kind_time
  ON public.auth_rate_limits (identifier, kind, occurred_at DESC);

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "arl_admin_read" ON public.auth_rate_limits;
CREATE POLICY "arl_admin_read" ON public.auth_rate_limits
FOR SELECT USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'super_admin'::app_role)
);

REVOKE ALL ON public.auth_rate_limits FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.auth_rate_limits FROM authenticated;
GRANT SELECT ON public.auth_rate_limits TO authenticated;

CREATE OR REPLACE FUNCTION public.record_auth_attempt(
  _identifier text, _kind text, _success boolean,
  _ip inet DEFAULT NULL, _ua text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _identifier IS NULL OR length(_identifier) = 0 THEN RETURN; END IF;
  IF _kind NOT IN ('login','password_reset','mfa') THEN
    RAISE EXCEPTION 'invalid kind';
  END IF;
  INSERT INTO public.auth_rate_limits (identifier, kind, success, ip, user_agent)
  VALUES (lower(_identifier), _kind, COALESCE(_success,false), _ip, _ua);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_auth_attempt(text,text,boolean,inet,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_auth_attempt(text,text,boolean,inet,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_auth_rate_limited(
  _identifier text, _kind text,
  _max_failures int DEFAULT 5,
  _window_minutes int DEFAULT 15
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(count(*) FILTER (WHERE NOT success), 0) >= _max_failures
  FROM public.auth_rate_limits
  WHERE identifier = lower(_identifier)
    AND kind = _kind
    AND occurred_at > (now() - make_interval(mins => _window_minutes));
$$;
REVOKE EXECUTE ON FUNCTION public.is_auth_rate_limited(text,text,int,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_auth_rate_limited(text,text,int,int) TO authenticated;

-- ---------- 2. MFA enforcement ----------
CREATE TABLE IF NOT EXISTS public.mfa_required_roles (
  role app_role PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mfa_required_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mfa_req_read"  ON public.mfa_required_roles;
DROP POLICY IF EXISTS "mfa_req_write" ON public.mfa_required_roles;
CREATE POLICY "mfa_req_read"  ON public.mfa_required_roles
FOR SELECT TO authenticated USING (true);
CREATE POLICY "mfa_req_write" ON public.mfa_required_roles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role));

INSERT INTO public.mfa_required_roles (role) VALUES
  ('super_admin'),('admin'),('finance_manager'),('hr_manager')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.user_requires_mfa(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.mfa_required_roles m ON m.role = ur.role
    WHERE ur.user_id = _user_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.user_requires_mfa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_requires_mfa(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_has_verified_mfa(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.mfa_factors
    WHERE user_id = _user_id AND status = 'verified'
  );
$$;
REVOKE EXECUTE ON FUNCTION public.user_has_verified_mfa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_verified_mfa(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mfa_enforcement_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _required boolean;
  _enrolled boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;
  _required := public.user_requires_mfa(_uid);
  _enrolled := public.user_has_verified_mfa(_uid);
  RETURN jsonb_build_object(
    'authenticated', true,
    'required', _required,
    'enrolled', _enrolled,
    'compliant', (NOT _required) OR _enrolled
  );
END $$;
REVOKE EXECUTE ON FUNCTION public.mfa_enforcement_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_enforcement_status() TO authenticated;

-- ---------- 3. Sensitive action / re-auth log ----------
CREATE TABLE IF NOT EXISTS public.sensitive_action_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid NOT NULL,
  action      text NOT NULL,           -- 'password_change','role_grant','role_revoke','payment_op','mfa_enroll','mfa_disable'
  target_id   text,
  ip          inet,
  user_agent  text,
  details     jsonb
);
CREATE INDEX IF NOT EXISTS idx_sal_actor_time ON public.sensitive_action_log(actor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sal_action_time ON public.sensitive_action_log(action, occurred_at DESC);

ALTER TABLE public.sensitive_action_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sal_admin_read" ON public.sensitive_action_log;
CREATE POLICY "sal_admin_read" ON public.sensitive_action_log
FOR SELECT USING (
  public.has_role(auth.uid(),'admin'::app_role)
  OR public.has_role(auth.uid(),'super_admin'::app_role)
);

REVOKE ALL ON public.sensitive_action_log FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.sensitive_action_log FROM authenticated;
GRANT SELECT ON public.sensitive_action_log TO authenticated;

-- Append-only enforcement
CREATE OR REPLACE FUNCTION public.sal_block_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sensitive_action_log is append-only: % not permitted', TG_OP;
END $$;

DROP TRIGGER IF EXISTS sal_no_update ON public.sensitive_action_log;
CREATE TRIGGER sal_no_update BEFORE UPDATE ON public.sensitive_action_log
FOR EACH ROW EXECUTE FUNCTION public.sal_block_mutation();
DROP TRIGGER IF EXISTS sal_no_delete ON public.sensitive_action_log;
CREATE TRIGGER sal_no_delete BEFORE DELETE ON public.sensitive_action_log
FOR EACH ROW EXECUTE FUNCTION public.sal_block_mutation();

CREATE OR REPLACE FUNCTION public.record_sensitive_action(
  _action text, _target_id text DEFAULT NULL,
  _ip inet DEFAULT NULL, _ua text DEFAULT NULL,
  _details jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _action NOT IN ('password_change','role_grant','role_revoke','payment_op','mfa_enroll','mfa_disable','session_revoke') THEN
    RAISE EXCEPTION 'invalid action';
  END IF;
  INSERT INTO public.sensitive_action_log(actor_id, action, target_id, ip, user_agent, details)
  VALUES (auth.uid(), _action, _target_id, _ip, _ua, _details);
  BEGIN
    SELECT public.current_user_role()::text INTO _role;
  EXCEPTION WHEN OTHERS THEN _role := NULL;
  END;
  INSERT INTO public.audit_log(actor_id, actor_role, action, resource_type, resource_id, after, ip, user_agent)
  VALUES (auth.uid(), _role, _action, 'sensitive_action', _target_id, _details, _ip, _ua);
END $$;
REVOKE EXECUTE ON FUNCTION public.record_sensitive_action(text,text,inet,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sensitive_action(text,text,inet,text,jsonb) TO authenticated;

-- ---------- 4. Server-side session revocation ----------
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(_user_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE _n int;
BEGIN
  IF NOT public.has_role(auth.uid(),'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Only super_admin may revoke sessions';
  END IF;
  WITH d AS (
    DELETE FROM auth.refresh_tokens WHERE user_id::uuid = _user_id RETURNING 1
  ) SELECT count(*) INTO _n FROM d;
  PERFORM public.record_sensitive_action('session_revoke', _user_id::text, NULL, NULL,
    jsonb_build_object('refresh_tokens_deleted', _n));
  RETURN _n;
END $$;
REVOKE EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO authenticated;
-- Effective access still gated by the has_role check inside the function.
