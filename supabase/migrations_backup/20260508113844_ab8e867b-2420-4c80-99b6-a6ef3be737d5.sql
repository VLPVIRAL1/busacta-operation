-- task_messages: admins can update or soft-delete any message
CREATE POLICY "Admins update messages"
ON public.task_messages FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete messages"
ON public.task_messages FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- tasks: admin delete (Internal manage already covers ALL but be explicit for delete confirmation)
-- Already covered by "Internal manage tasks" ALL policy. No change needed.

-- client_entities: ALL Internal manage already covers delete.
-- projects, firms: admin "manage" ALL already covers delete.

-- Open points convenience: ensure deletes also nullify resolved_by reference safely (no-op).
SELECT 1;