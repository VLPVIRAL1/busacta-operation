CREATE TABLE public.firm_contact_capabilities (
  contact_id uuid NOT NULL REFERENCES public.firm_contacts(id) ON DELETE CASCADE,
  capability text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, capability)
);

ALTER TABLE public.firm_contact_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal manage contact caps"
ON public.firm_contact_capabilities
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Contact reads own caps"
ON public.firm_contact_capabilities
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.firm_contacts fc
    JOIN auth.users u ON lower(u.email) = lower(fc.email)
    WHERE fc.id = firm_contact_capabilities.contact_id
      AND u.id = auth.uid()
      AND fc.portal_enabled = true
  )
);