DROP POLICY IF EXISTS "Contact reads own caps" ON public.firm_contact_capabilities;

CREATE POLICY "Contact reads own caps"
ON public.firm_contact_capabilities
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.firm_contacts fc
    WHERE fc.id = firm_contact_capabilities.contact_id
      AND fc.portal_enabled = true
      AND lower(fc.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);