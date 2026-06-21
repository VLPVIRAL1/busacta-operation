
-- Vendor profile columns
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS payment_terms text;

-- Public bucket for vendor avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('vendor-avatars', 'vendor-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
DROP POLICY IF EXISTS "Vendor avatars public read" ON storage.objects;
CREATE POLICY "Vendor avatars public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'vendor-avatars');

-- Finance/admin write
DROP POLICY IF EXISTS "Vendor avatars finance write" ON storage.objects;
CREATE POLICY "Vendor avatars finance write"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'vendor-avatars'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'finance_manager'::app_role)
  )
);

DROP POLICY IF EXISTS "Vendor avatars finance update" ON storage.objects;
CREATE POLICY "Vendor avatars finance update"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'vendor-avatars'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'finance_manager'::app_role)
  )
);

DROP POLICY IF EXISTS "Vendor avatars finance delete" ON storage.objects;
CREATE POLICY "Vendor avatars finance delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'vendor-avatars'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'finance_manager'::app_role)
  )
);
