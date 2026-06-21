-- 1. Tighten time_logs: writes must reference a task the user can access.
DROP POLICY IF EXISTS "Users manage own time" ON public.time_logs;

CREATE POLICY "Users select own time"
ON public.time_logs FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users insert own time on accessible tasks"
ON public.time_logs FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tasks t
      JOIN public.client_entities ce ON ce.id = t.entity_id
      JOIN public.projects p ON p.id = ce.project_id
    WHERE t.id = time_logs.task_id
      AND public.user_can_access_firm(p.firm_id)
  )
);

CREATE POLICY "Users update own time on accessible tasks"
ON public.time_logs FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.tasks t
      JOIN public.client_entities ce ON ce.id = t.entity_id
      JOIN public.projects p ON p.id = ce.project_id
    WHERE t.id = time_logs.task_id
      AND public.user_can_access_firm(p.firm_id)
  )
);

CREATE POLICY "Users delete own time"
ON public.time_logs FOR DELETE TO authenticated
USING (user_id = auth.uid());