
-- 1. Helper: current user's firm id, bypassing RLS to avoid recursion.
CREATE OR REPLACE FUNCTION public.current_user_firm_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT firm_id FROM public.profiles WHERE id = auth.uid()
$$;

-- 2. Helper: does a user hold any internal role? Reads user_roles only.
CREATE OR REPLACE FUNCTION public.is_internal_user_id(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin','employee','super_admin','finance_manager','hr_manager')
  )
$$;

-- 3. Replace the recursive profiles policy.
DROP POLICY IF EXISTS "Employees read internal or same firm profiles" ON public.profiles;

CREATE POLICY "Employees read internal or same firm profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'employee'::app_role)
  AND (
    public.is_internal_user_id(profiles.id)
    OR profiles.firm_id IS NOT DISTINCT FROM public.current_user_firm_id()
  )
);

-- 4. Replace the recursive firms policy with non-recursive helper.
DROP POLICY IF EXISTS "Clients read own firm" ON public.firms;

CREATE POLICY "Clients read own firm"
ON public.firms
FOR SELECT
USING (
  primary_partner_user_id = auth.uid()
  OR firms.id = public.current_user_firm_id()
);
