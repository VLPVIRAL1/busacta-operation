
INSERT INTO storage.buckets (id, name, public) VALUES ('task-attachments', 'task-attachments', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Internal manage task attachment files"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'task-attachments' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee')))
WITH CHECK (bucket_id = 'task-attachments' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee')));

CREATE POLICY "Clients read attachment files via visible messages"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND EXISTS (
    SELECT 1 FROM public.task_attachments ta
    JOIN public.task_messages m ON m.id = ta.message_id
    WHERE ta.storage_path = storage.objects.name
      AND m.is_client_visible = true
      AND m.deleted_at IS NULL
  )
);
