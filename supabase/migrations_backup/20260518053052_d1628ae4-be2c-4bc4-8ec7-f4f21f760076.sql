-- 1. note-images bucket: make private + path-based ownership
UPDATE storage.buckets SET public = false WHERE id = 'note-images';

DROP POLICY IF EXISTS "note-images public read" ON storage.objects;
DROP POLICY IF EXISTS "note-images authed upload" ON storage.objects;

CREATE POLICY "note-images owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'note-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "note-images owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'note-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- 2. file_request_links: restrict SELECT to creator or firm member of the task
DROP POLICY IF EXISTS "Authenticated users can view file request links" ON public.file_request_links;

CREATE POLICY "file_request_links_select_creator_or_firm"
ON public.file_request_links FOR SELECT TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.client_entities ce ON ce.id = t.entity_id
    JOIN public.projects p ON p.id = COALESCE(t.project_id, ce.project_id)
    WHERE t.id = file_request_links.task_id
      AND public.user_can_access_firm(p.firm_id)
  )
);

-- 3. task_views public scope: restrict to same-firm viewers
DROP POLICY IF EXISTS "task_views_select_own_or_public" ON public.task_views;

CREATE POLICY "task_views_select_own_or_public_same_firm"
ON public.task_views FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR (
    scope = 'public'
    AND public.is_internal_user_id(auth.uid())
    AND public.is_internal_user_id(owner_id)
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      JOIN public.profiles them ON them.id = task_views.owner_id
      WHERE me.id = auth.uid()
        AND (me.firm_id IS NULL OR them.firm_id IS NULL OR me.firm_id = them.firm_id)
    )
  )
);

-- 4. message_reads_detail: only own row or message you can access
DROP POLICY IF EXISTS "reads_detail_select" ON public.message_reads_detail;

CREATE POLICY "reads_detail_select_own_or_member"
ON public.message_reads_detail FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (
    scope = 'task'
    AND EXISTS (
      SELECT 1 FROM public.task_messages tm
      JOIN public.tasks t ON t.id = tm.task_id
      JOIN public.client_entities ce ON ce.id = t.entity_id
      JOIN public.projects p ON p.id = COALESCE(t.project_id, ce.project_id)
      WHERE tm.id = message_reads_detail.message_id
        AND public.user_can_access_firm(p.firm_id)
    )
  )
  OR (
    scope = 'chat'
    AND EXISTS (
      SELECT 1 FROM public.chat_messages cm
      JOIN public.chat_thread_members m ON m.thread_id = cm.thread_id
      WHERE cm.id = message_reads_detail.message_id
        AND m.user_id = auth.uid()
    )
  )
);

-- 5. message_reactions: only viewable by users who can access the message
DROP POLICY IF EXISTS "reactions_select" ON public.message_reactions;

CREATE POLICY "reactions_select_member"
ON public.message_reactions FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (
    scope = 'task'
    AND EXISTS (
      SELECT 1 FROM public.task_messages tm
      JOIN public.tasks t ON t.id = tm.task_id
      JOIN public.client_entities ce ON ce.id = t.entity_id
      JOIN public.projects p ON p.id = COALESCE(t.project_id, ce.project_id)
      WHERE tm.id = message_reactions.message_id
        AND public.user_can_access_firm(p.firm_id)
    )
  )
  OR (
    scope = 'chat'
    AND EXISTS (
      SELECT 1 FROM public.chat_messages cm
      JOIN public.chat_thread_members m ON m.thread_id = cm.thread_id
      WHERE cm.id = message_reactions.message_id
        AND m.user_id = auth.uid()
    )
  )
);

-- 6. Function search_path hardening
CREATE OR REPLACE FUNCTION public.touch_project_file_tags_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;