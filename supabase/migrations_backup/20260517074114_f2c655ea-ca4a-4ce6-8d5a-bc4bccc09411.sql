ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

ALTER TABLE public.task_messages
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at timestamptz;

DROP POLICY IF EXISTS "Members toggle pin on chat_messages" ON public.chat_messages;
CREATE POLICY "Members toggle pin on chat_messages"
ON public.chat_messages FOR UPDATE TO authenticated
USING (public.is_chat_thread_member(thread_id))
WITH CHECK (public.is_chat_thread_member(thread_id));

DROP POLICY IF EXISTS "Members toggle pin on task_messages" ON public.task_messages;
CREATE POLICY "Members toggle pin on task_messages"
ON public.task_messages FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'employee'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.task_capability(task_id, 'can_view')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'employee'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.task_capability(task_id, 'can_view')
);