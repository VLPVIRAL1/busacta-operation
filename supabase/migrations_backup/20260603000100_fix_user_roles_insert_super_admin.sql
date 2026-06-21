-- Fix: super_admins could not assign roles.
--
-- The RESTRICTIVE insert policy on public.user_roles only allowed `admin`, while
-- every other user_roles policy (Admins manage roles / read / update / delete)
-- had been widened to also allow `super_admin`. Because a RESTRICTIVE policy is
-- AND-combined with the permissive ones, the effective INSERT rule collapsed to
-- `admin` only — so a super_admin assigning a role from /hr/employees → Hub
-- Permissions hit:
--   new row violates row-level security policy
--   "Restrict role inserts to admins" for table "user_roles"
--
-- Align this policy with the others: allow admin OR super_admin. Kept RESTRICTIVE
-- so it still prevents any future permissive policy from widening write access.
DROP POLICY IF EXISTS "Restrict role inserts to admins" ON public.user_roles;

CREATE POLICY "Restrict role inserts to admins"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'super_admin'::app_role)
);
