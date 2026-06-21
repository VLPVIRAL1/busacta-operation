-- Note images bucket for rich-text editor (SOPs / Notes)
INSERT INTO storage.buckets (id, name, public)
VALUES ('note-images', 'note-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
DROP POLICY IF EXISTS "note-images public read" ON storage.objects;
CREATE POLICY "note-images public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'note-images');

-- Authenticated upload
DROP POLICY IF EXISTS "note-images authed upload" ON storage.objects;
CREATE POLICY "note-images authed upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'note-images');

-- Authenticated update/delete (own folder is auth.uid())
DROP POLICY IF EXISTS "note-images authed update" ON storage.objects;
CREATE POLICY "note-images authed update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'note-images' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "note-images authed delete" ON storage.objects;
CREATE POLICY "note-images authed delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'note-images' AND auth.uid()::text = (storage.foldername(name))[1]);