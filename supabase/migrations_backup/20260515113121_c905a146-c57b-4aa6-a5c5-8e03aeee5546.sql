-- Fix privilege escalation in chat_thread_members INSERT policy.
-- The original "Owner or self adds members" policy had two bugs:
--   1. user_id = auth.uid() let any authenticated user (incl. clients) self-join any thread.
--   2. The owner subquery compared chat_thread_members_1.thread_id to itself
--      (always TRUE), letting any owner of any thread add anyone to any other thread.
DROP POLICY IF EXISTS "Owner or self adds members" ON public.chat_thread_members;

CREATE POLICY "Owners add members to their threads"
  ON public.chat_thread_members
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chat_thread_members m2
      WHERE m2.thread_id = chat_thread_members.thread_id
        AND m2.user_id = auth.uid()
        AND m2.role = 'owner'
    )
  );