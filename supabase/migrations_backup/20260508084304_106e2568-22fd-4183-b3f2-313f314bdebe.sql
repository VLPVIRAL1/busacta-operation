
-- Allow all authenticated users to manage projects, tasks, and client entities
-- per product owner request: "All users should able to update projects and tasks"

CREATE POLICY "Authenticated users manage projects"
ON public.projects FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users manage tasks"
ON public.tasks FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users manage client entities"
ON public.client_entities FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
