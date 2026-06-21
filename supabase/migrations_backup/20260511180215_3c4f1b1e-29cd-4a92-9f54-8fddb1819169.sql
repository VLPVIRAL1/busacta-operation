-- Helper: resolve current authenticated client's firm via firm_contacts.email + portal_enabled
CREATE OR REPLACE FUNCTION public.current_client_firm_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fc.firm_id
  FROM public.firm_contacts fc
  JOIN auth.users u ON lower(u.email) = lower(fc.email)
  WHERE u.id = auth.uid()
    AND fc.portal_enabled = true
  LIMIT 1
$$;

-- Tighten user_can_access_firm so client role requires portal-enabled contact for THIS firm
CREATE OR REPLACE FUNCTION public.user_can_access_firm(_firm_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'employee')
    OR EXISTS (SELECT 1 FROM public.firms WHERE id = _firm_id AND primary_partner_user_id = auth.uid())
    OR (
      public.has_role(auth.uid(), 'client')
      AND _firm_id = public.current_client_firm_id()
    );
$$;