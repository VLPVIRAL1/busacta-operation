
-- ============= FIRMS expansion =============
ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS billing_address text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid,
  ADD COLUMN IF NOT EXISTS deactivation_reason text,
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.firms SET address_line1 = address WHERE address_line1 IS NULL AND address IS NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'firms_status_check') THEN
    ALTER TABLE public.firms ADD CONSTRAINT firms_status_check CHECK (status IN ('active','deactivated'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS firms_updated_at ON public.firms;
CREATE TRIGGER firms_updated_at BEFORE UPDATE ON public.firms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= FIRM MEMBER CAPABILITIES =============
CREATE TABLE IF NOT EXISTS public.firm_member_capabilities (
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  capability text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (firm_id, user_id, capability)
);
ALTER TABLE public.firm_member_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage firm member caps" ON public.firm_member_capabilities;
CREATE POLICY "Admins manage firm member caps" ON public.firm_member_capabilities
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "Members read own caps" ON public.firm_member_capabilities;
CREATE POLICY "Members read own caps" ON public.firm_member_capabilities
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.firm_member_can(_firm_id uuid, _capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE(
    (SELECT allowed FROM public.firm_member_capabilities
       WHERE firm_id = _firm_id AND user_id = auth.uid() AND capability = _capability
       LIMIT 1),
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
  );
$$;

-- ============= PROJECTS expansion =============
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_status_check') THEN
    ALTER TABLE public.projects ADD CONSTRAINT projects_status_check CHECK (status IN ('active','paused','archived'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS projects_updated_at ON public.projects;
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tighten firm/project create rules: only admin or super_admin
DROP POLICY IF EXISTS "Employees manage projects" ON public.projects;
CREATE POLICY "Employees update projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'employee'))
  WITH CHECK (public.has_role(auth.uid(),'employee'));

DROP POLICY IF EXISTS "Admins manage projects" ON public.projects;
CREATE POLICY "Admins manage projects" ON public.projects
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "Admins manage firms" ON public.firms;
CREATE POLICY "Admins manage firms" ON public.firms
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ============= PROJECT PIPELINE STAGES =============
CREATE TABLE IF NOT EXISTS public.project_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  is_terminal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_project ON public.project_pipeline_stages(project_id, sort_order);
ALTER TABLE public.project_pipeline_stages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage stages" ON public.project_pipeline_stages;
CREATE POLICY "Admins manage stages" ON public.project_pipeline_stages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "Firm members read stages" ON public.project_pipeline_stages;
CREATE POLICY "Firm members read stages" ON public.project_pipeline_stages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.user_can_access_firm(p.firm_id)));

-- Seed default stages on project insert
CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.project_pipeline_stages (project_id, key, label, sort_order, is_terminal) VALUES
    (NEW.id, 'handover_received', 'Handover Received', 1, false),
    (NEW.id, 'in_progress',       'In Progress',       2, false),
    (NEW.id, 'review',             'Review',            3, false),
    (NEW.id, 'client_review',      'Client Review',     4, false),
    (NEW.id, 'completed',          'Completed',         5, true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS projects_seed_pipeline ON public.projects;
CREATE TRIGGER projects_seed_pipeline AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_pipeline_stages();

-- Add nullable pipeline_stage_id to tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS pipeline_stage_id uuid REFERENCES public.project_pipeline_stages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_pipeline_stage_id ON public.tasks(pipeline_stage_id);

-- ============= PROJECT CUSTOM FIELDS =============
CREATE TABLE IF NOT EXISTS public.project_custom_field_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','number','date','select','multiselect','boolean')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
ALTER TABLE public.project_custom_field_defs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage custom field defs" ON public.project_custom_field_defs;
CREATE POLICY "Admins manage custom field defs" ON public.project_custom_field_defs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "Firm members read custom field defs" ON public.project_custom_field_defs;
CREATE POLICY "Firm members read custom field defs" ON public.project_custom_field_defs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.user_can_access_firm(p.firm_id)));

CREATE TABLE IF NOT EXISTS public.project_custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  field_def_id uuid NOT NULL REFERENCES public.project_custom_field_defs(id) ON DELETE CASCADE,
  value jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, field_def_id)
);
ALTER TABLE public.project_custom_field_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal manage custom field values" ON public.project_custom_field_values;
CREATE POLICY "Internal manage custom field values" ON public.project_custom_field_values
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'employee'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'employee'));

-- ============= FIRM LIFECYCLE EVENTS =============
CREATE TABLE IF NOT EXISTS public.firm_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_firm_lifecycle_firm ON public.firm_lifecycle_events(firm_id, created_at DESC);
ALTER TABLE public.firm_lifecycle_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read lifecycle" ON public.firm_lifecycle_events;
CREATE POLICY "Admins read lifecycle" ON public.firm_lifecycle_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

DROP POLICY IF EXISTS "Admins write lifecycle" ON public.firm_lifecycle_events;
CREATE POLICY "Admins write lifecycle" ON public.firm_lifecycle_events
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- Default task pipeline_stage_id to first stage of its project
CREATE OR REPLACE FUNCTION public.default_task_pipeline_stage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _project_id uuid;
  _stage_id uuid;
BEGIN
  IF NEW.pipeline_stage_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT p.id INTO _project_id FROM public.projects p
    JOIN public.client_entities ce ON ce.project_id = p.id
    WHERE ce.id = NEW.entity_id LIMIT 1;
  IF _project_id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO _stage_id FROM public.project_pipeline_stages
    WHERE project_id = _project_id ORDER BY sort_order ASC LIMIT 1;
  NEW.pipeline_stage_id := _stage_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tasks_default_stage ON public.tasks;
CREATE TRIGGER tasks_default_stage BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.default_task_pipeline_stage();
