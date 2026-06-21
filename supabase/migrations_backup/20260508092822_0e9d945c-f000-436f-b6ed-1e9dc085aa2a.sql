
-- 1. Fix cross-firm task_messages INSERT
DROP POLICY IF EXISTS "Authors insert messages" ON public.task_messages;
CREATE POLICY "Authors insert messages" ON public.task_messages
FOR INSERT WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.client_entities ce ON ce.id = t.entity_id
    JOIN public.projects p ON p.id = ce.project_id
    WHERE t.id = task_messages.task_id
      AND public.user_can_access_firm(p.firm_id)
  )
);

-- 2. Fix cross-firm task_attachments client read
DROP POLICY IF EXISTS "Clients read attachments on visible msgs" ON public.task_attachments;
CREATE POLICY "Clients read attachments on visible msgs" ON public.task_attachments
FOR SELECT USING (
  message_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.task_messages m
    JOIN public.tasks t ON t.id = m.task_id
    JOIN public.client_entities ce ON ce.id = t.entity_id
    JOIN public.projects p ON p.id = ce.project_id
    WHERE m.id = task_attachments.message_id
      AND m.is_client_visible = true
      AND m.deleted_at IS NULL
      AND public.user_can_access_firm(p.firm_id)
  )
);

-- 3. Fix storage policy for client attachment reads
DROP POLICY IF EXISTS "Clients read attachment files via visible messages" ON storage.objects;
CREATE POLICY "Clients read attachment files via visible messages" ON storage.objects
FOR SELECT USING (
  bucket_id = 'task-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.task_attachments ta
    JOIN public.task_messages m ON m.id = ta.message_id
    JOIN public.tasks t ON t.id = m.task_id
    JOIN public.client_entities ce ON ce.id = t.entity_id
    JOIN public.projects p ON p.id = ce.project_id
    WHERE ta.storage_path = objects.name
      AND m.is_client_visible = true
      AND m.deleted_at IS NULL
      AND public.user_can_access_firm(p.firm_id)
  )
);

-- 4. Lock down SECURITY DEFINER function execute permissions
REVOKE EXECUTE ON FUNCTION public.accept_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.lookup_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_invitation(text) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.user_can_access_firm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_can_access_firm(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- 5. Tighten branding bucket: prevent listing by removing broad admin SELECT,
--    keep admin write access; public read of known object paths still works
--    because the bucket is public.
DROP POLICY IF EXISTS "Admins manage branding files" ON storage.objects;
CREATE POLICY "Admins insert branding files" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update branding files" ON storage.objects
FOR UPDATE USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete branding files" ON storage.objects
FOR DELETE USING (bucket_id = 'branding' AND public.has_role(auth.uid(), 'admin'));
