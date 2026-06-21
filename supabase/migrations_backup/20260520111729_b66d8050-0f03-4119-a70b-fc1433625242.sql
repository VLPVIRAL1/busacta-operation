-- 1) Extend the field-type enum with the new ID-document tile.
ALTER TYPE public.esign_field_type ADD VALUE IF NOT EXISTS 'signer_id_document';

-- 2) Private bucket for signer-uploaded ID scans.
INSERT INTO storage.buckets (id, name, public)
VALUES ('esign-id-docs', 'esign-id-docs', false)
ON CONFLICT (id) DO NOTHING;

-- 3) Helper: is the current request a signer for envelope :env_id?
--    Mirrors the pattern used by other esign objects.
CREATE OR REPLACE FUNCTION public.can_view_esign_id_doc(_envelope_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_esign_envelope(_envelope_id);
$$;

-- 4) RLS on storage.objects for the new bucket.
--    Folder convention: <envelope_id>/<recipient_id>/<filename>
DROP POLICY IF EXISTS "esign_id_docs_manager_read" ON storage.objects;
CREATE POLICY "esign_id_docs_manager_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'esign-id-docs'
  AND public.can_view_esign_id_doc(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "esign_id_docs_manager_write" ON storage.objects;
CREATE POLICY "esign_id_docs_manager_write"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'esign-id-docs'
  AND public.can_view_esign_id_doc(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "esign_id_docs_manager_update" ON storage.objects;
CREATE POLICY "esign_id_docs_manager_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'esign-id-docs'
  AND public.can_view_esign_id_doc(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "esign_id_docs_manager_delete" ON storage.objects;
CREATE POLICY "esign_id_docs_manager_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'esign-id-docs'
  AND public.can_view_esign_id_doc(((storage.foldername(name))[1])::uuid)
);

-- Note: signer (token-based, anonymous) uploads will be handled via a
-- server-fn-issued signed upload URL, so no anon RLS is added here.