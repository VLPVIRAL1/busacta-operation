
-- Firms: timezone + 3 software categories
ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS us_timezone text DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS accounting_software text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tax_software text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS pm_software text[] NOT NULL DEFAULT '{}';

-- Projects: project type
DO $$ BEGIN
  CREATE TYPE public.project_type AS ENUM ('accounting','tax_preparation','sales_tax','company_formation','payroll_processing','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_type public.project_type NOT NULL DEFAULT 'other';

-- Sub-tasks
CREATE TABLE IF NOT EXISTS public.task_subtasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_task_subtasks_task ON public.task_subtasks(task_id, sort_order);

ALTER TABLE public.task_subtasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Firm scoped read subtasks" ON public.task_subtasks;
CREATE POLICY "Firm scoped read subtasks" ON public.task_subtasks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.client_entities ce ON ce.id = t.entity_id
    JOIN public.projects p ON p.id = ce.project_id
    WHERE t.id = task_subtasks.task_id AND public.user_can_access_firm(p.firm_id)
  ));

DROP POLICY IF EXISTS "Internal manage subtasks" ON public.task_subtasks;
CREATE POLICY "Internal manage subtasks" ON public.task_subtasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'employee'));

-- Allow firm clients to also tick their own sub-tasks (insert/update) on accessible tasks
DROP POLICY IF EXISTS "Firm scoped write subtasks" ON public.task_subtasks;
CREATE POLICY "Firm scoped write subtasks" ON public.task_subtasks
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.client_entities ce ON ce.id = t.entity_id
    JOIN public.projects p ON p.id = ce.project_id
    WHERE t.id = task_subtasks.task_id AND public.user_can_access_firm(p.firm_id)
  ));

DROP POLICY IF EXISTS "Firm scoped update subtasks" ON public.task_subtasks;
CREATE POLICY "Firm scoped update subtasks" ON public.task_subtasks
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.client_entities ce ON ce.id = t.entity_id
    JOIN public.projects p ON p.id = ce.project_id
    WHERE t.id = task_subtasks.task_id AND public.user_can_access_firm(p.firm_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.client_entities ce ON ce.id = t.entity_id
    JOIN public.projects p ON p.id = ce.project_id
    WHERE t.id = task_subtasks.task_id AND public.user_can_access_firm(p.firm_id)
  ));
