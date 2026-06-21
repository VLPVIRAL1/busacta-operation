-- 1. Restrict employee SELECT on profiles to internal staff or same-firm members.
DROP POLICY IF EXISTS "Employees read all profiles" ON public.profiles;

CREATE POLICY "Employees read internal or same firm profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'employee'::app_role)
  AND (
    -- Allow viewing other internal staff (admin, employee, super_admin, finance_manager, hr_manager)
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = profiles.id
        AND ur.role IN ('admin'::app_role, 'employee'::app_role, 'super_admin'::app_role, 'finance_manager'::app_role, 'hr_manager'::app_role)
    )
    -- Or profiles in the same firm as the requesting employee
    OR profiles.firm_id IS NOT DISTINCT FROM (
      SELECT firm_id FROM public.profiles WHERE id = auth.uid()
    )
  )
);

-- 2. Scope internal firm_messages reads to firms the user can access.
DROP POLICY IF EXISTS "Internal read firm_messages" ON public.firm_messages;

CREATE POLICY "Internal read firm_messages"
ON public.firm_messages
FOR SELECT
TO authenticated
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  AND deleted_at IS NULL
  AND user_can_access_firm(firm_id)
);

-- 3. Drop client-write paths on task_subtasks. Internal staff still covered by "Internal manage subtasks" ALL policy.
DROP POLICY IF EXISTS "Firm scoped write subtasks" ON public.task_subtasks;
DROP POLICY IF EXISTS "Firm scoped update subtasks" ON public.task_subtasks;

-- 4. Defense in depth on user_roles: explicit restrictive policy ensuring only admins ever insert/update/delete.
-- The existing "Admins manage roles" ALL policy already covers this, but add a RESTRICTIVE policy
-- so that any future permissive policy cannot accidentally widen write access.
DROP POLICY IF EXISTS "Restrict role writes to admins" ON public.user_roles;

CREATE POLICY "Restrict role writes to admins"
ON public.user_roles
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Note: RESTRICTIVE policies apply to ALL commands; SELECT for users still works because
-- "Users read own roles" remains permissive AND the restrictive USING fails for non-admins on SELECT,
-- which would break self-reads. Adjust scope: only enforce on write commands by re-creating without SELECT.
DROP POLICY "Restrict role writes to admins" ON public.user_roles;

CREATE POLICY "Restrict role inserts to admins"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Restrict role updates to admins"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Restrict role deletes to admins"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- 5. Defense in depth on invitations: explicitly block anon access (RLS already does, but make it explicit).
-- The existing "Admins manage invitations" ALL policy gates everything to admins.
-- Add a RESTRICTIVE policy that denies anonymous access on SELECT.
DROP POLICY IF EXISTS "Block anon read invitations" ON public.invitations;

CREATE POLICY "Block anon read invitations"
ON public.invitations
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);
