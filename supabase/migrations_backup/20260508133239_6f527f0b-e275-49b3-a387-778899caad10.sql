ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;

DROP POLICY IF EXISTS "Authors update own messages within 30 min" ON public.task_messages;

CREATE POLICY "Authors update own messages within 30 min"
ON public.task_messages
FOR UPDATE
USING (
  author_id = auth.uid()
  AND created_at > (now() - interval '30 minutes')
)
WITH CHECK (
  author_id = auth.uid()
  AND (
    is_client_visible = false
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'employee')
  )
);