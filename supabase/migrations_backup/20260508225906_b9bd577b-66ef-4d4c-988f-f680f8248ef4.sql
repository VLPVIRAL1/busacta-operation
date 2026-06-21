-- 1) firm_messages: restrict INSERT to admins/employees only
DROP POLICY IF EXISTS "Firm members insert firm_messages" ON public.firm_messages;
CREATE POLICY "Internal insert firm_messages"
  ON public.firm_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND user_can_access_firm(firm_id)
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  );

-- 2) task_notes: restrict SELECT to admins/employees only
DROP POLICY IF EXISTS "Firm members read task_notes" ON public.task_notes;
-- The existing "Internal manage task_notes" ALL policy already covers staff SELECT.

-- 3) task_links: restrict SELECT to admins/employees only
DROP POLICY IF EXISTS "Firm members read task_links" ON public.task_links;
-- The existing "Internal manage task_links" ALL policy already covers staff SELECT.

-- 4) time_logs: remove broad firm-members read; staff already covered by their own policies
DROP POLICY IF EXISTS "Firm members read time_logs" ON public.time_logs;
