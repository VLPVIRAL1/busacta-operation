
-- Defense-in-depth: explicitly restrict invitations reads to admins.
-- The current permissive policy is admin-only (FOR ALL), so non-admins are
-- already denied, but a restrictive policy makes intent unambiguous and
-- silences the scanner false positive.
CREATE POLICY "Restrict invitation reads to admins"
  ON public.invitations
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Tighten client visibility into firm_contacts: clients may only see contacts
-- that are explicitly portal-enabled. Internal staff (admin/employee) keep
-- full access via the separate "Internal manage firm_contacts" policy.
DROP POLICY IF EXISTS "Clients read own firm contacts" ON public.firm_contacts;

CREATE POLICY "Clients read own firm portal contacts"
  ON public.firm_contacts
  FOR SELECT
  TO authenticated
  USING (
    -- Internal users: unrestricted (also covered by manage policy, but kept
    -- here so a single SELECT policy serves all roles cleanly).
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      -- Client portal users: only portal-enabled contacts at their firm.
      public.has_role(auth.uid(), 'client'::app_role)
      AND portal_enabled = true
      AND firm_id = public.current_client_firm_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.firms f
      WHERE f.id = firm_contacts.firm_id
        AND f.primary_partner_user_id = auth.uid()
    )
  );
