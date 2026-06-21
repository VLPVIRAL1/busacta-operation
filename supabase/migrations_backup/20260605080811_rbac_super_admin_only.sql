-- RBAC lockdown: only super_admin may manage roles, capabilities, and sub-roles.
--
-- Context: previously these management surfaces allowed `admin` (and in some
-- cases `super_admin`). The product now centralises all role/capability/sub-role
-- administration to super_admin. Read (SELECT) policies are left untouched so the
-- matrices still render for admins in read-only mode.
--
-- Helper `is_super_admin()` centralises the check used by every policy below.

-- ── Helper ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'super_admin'::app_role);
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ── user_roles ────────────────────────────────────────────────────────────
-- Drop every write/management policy. SELECT policies ("Users read own roles",
-- "Admins read all roles") are intentionally kept.
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Restrict role inserts to admins" ON public.user_roles;
DROP POLICY IF EXISTS "Restrict role updates to admins" ON public.user_roles;
DROP POLICY IF EXISTS "Restrict role deletes to admins" ON public.user_roles;

CREATE POLICY "Super admin inserts roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admin updates roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admin deletes roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- ── role_capabilities ─────────────────────────────────────────────────────
-- Keep "Authenticated read capabilities" (SELECT). Replace the admin manage
-- policy with super_admin-only writes.
DROP POLICY IF EXISTS "Admins manage capabilities" ON public.role_capabilities;

CREATE POLICY "Super admin manages capabilities"
  ON public.role_capabilities FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ── role_subroles ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage subroles" ON public.role_subroles;

CREATE POLICY "Super admin manages subroles"
  ON public.role_subroles FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ── role_subrole_capabilities ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins manage subrole caps" ON public.role_subrole_capabilities;

CREATE POLICY "Super admin manages subrole caps"
  ON public.role_subrole_capabilities FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ── security_audit_log ────────────────────────────────────────────────────
-- The audit log is read/written ONLY from /admin/activity-audit (route now
-- super_admin-only). The old SELECT policy leaked audit rows to `admin` and
-- `employee`; tighten the data layer so a direct API call (curl/Postman) by a
-- non-super user cannot read or mutate audit data even if it bypasses the UI.
DROP POLICY IF EXISTS "Internal read audit log" ON public.security_audit_log;
DROP POLICY IF EXISTS "Admins manage audit log" ON public.security_audit_log;

CREATE POLICY "Super admin manages audit log"
  ON public.security_audit_log FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
