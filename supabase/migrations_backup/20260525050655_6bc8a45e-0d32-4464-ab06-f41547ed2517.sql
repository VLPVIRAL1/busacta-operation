CREATE TABLE IF NOT EXISTS public.firm_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  label text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text DEFAULT 'USA',
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_firm_addresses_firm ON public.firm_addresses(firm_id);

ALTER TABLE public.firm_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage firm addresses"
ON public.firm_addresses
FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_firm_addresses_updated
BEFORE UPDATE ON public.firm_addresses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();