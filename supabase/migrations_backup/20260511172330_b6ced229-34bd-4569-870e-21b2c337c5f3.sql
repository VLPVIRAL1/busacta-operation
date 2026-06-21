
-- Per-project task creation restrictions and defaults
CREATE TABLE IF NOT EXISTS public.project_task_options (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  allowed_task_types text[] NOT NULL DEFAULT '{}',
  allowed_priorities text[] NOT NULL DEFAULT '{}',
  allowed_statuses text[] NOT NULL DEFAULT '{}',
  default_assignee_id uuid,
  default_reviewer_id uuid,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_task_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage project task options"
  ON public.project_task_options
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Firm members read project task options"
  ON public.project_task_options
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_task_options.project_id AND user_can_access_firm(p.firm_id)));

CREATE TRIGGER project_task_options_updated_at
  BEFORE UPDATE ON public.project_task_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
