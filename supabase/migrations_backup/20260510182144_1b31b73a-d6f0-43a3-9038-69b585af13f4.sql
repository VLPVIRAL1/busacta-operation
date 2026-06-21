REVOKE EXECUTE ON FUNCTION public.has_capability(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_capability(uuid, text) TO authenticated;

DROP POLICY IF EXISTS "Firm members insert task_messages" ON public.task_messages;

CREATE POLICY "Firm members insert task_messages"
ON public.task_messages
FOR INSERT
TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'employee')
    OR (
      is_client_visible = true
      AND COALESCE(is_open_point, false) = false
      AND COALESCE(is_pinned, false) = false
      AND open_point_status IS NULL
      AND open_point_assignee_id IS NULL
      AND open_point_done_at IS NULL
      AND open_point_done_by IS NULL
      AND resolved_at IS NULL
      AND resolved_by IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.tasks t
        JOIN public.client_entities ce ON ce.id = t.entity_id
        JOIN public.projects p ON p.id = ce.project_id
        WHERE t.id = task_messages.task_id
          AND public.user_can_access_firm(p.firm_id)
      )
    )
  )
);

DROP POLICY IF EXISTS "Avatars public read" ON storage.objects;