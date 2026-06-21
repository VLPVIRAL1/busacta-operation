-- 1. Position enum + profile fields
CREATE TYPE public.position_type AS ENUM (
  'partner', 'manager', 'senior', 'staff', 'reviewer', 'preparer', 'client_contact', 'other'
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS position position_type NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. Effective hours on time_logs
ALTER TABLE public.time_logs
  ADD COLUMN IF NOT EXISTS break_minutes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effective_override int,
  ADD COLUMN IF NOT EXISTS effective_edited_by uuid,
  ADD COLUMN IF NOT EXISTS effective_edited_at timestamptz;

-- effective_minutes as a stored generated column
ALTER TABLE public.time_logs
  ADD COLUMN IF NOT EXISTS effective_minutes int
  GENERATED ALWAYS AS (
    COALESCE(effective_override, GREATEST(COALESCE(duration_minutes,0) - COALESCE(break_minutes,0), 0))
  ) STORED;

CREATE OR REPLACE FUNCTION public.stamp_effective_editor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.effective_override IS DISTINCT FROM OLD.effective_override
    OR NEW.break_minutes IS DISTINCT FROM OLD.break_minutes
  ) THEN
    NEW.effective_edited_by := auth.uid();
    NEW.effective_edited_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_effective_editor ON public.time_logs;
CREATE TRIGGER trg_stamp_effective_editor
  BEFORE UPDATE ON public.time_logs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_effective_editor();

-- 3. Workflow template scoping (M:N firms + projects)
CREATE TABLE IF NOT EXISTS public.workflow_template_firms (
  template_id uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  PRIMARY KEY (template_id, firm_id)
);
ALTER TABLE public.workflow_template_firms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read template firms" ON public.workflow_template_firms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage template firms" ON public.workflow_template_firms FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.workflow_template_projects (
  template_id uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  PRIMARY KEY (template_id, project_id)
);
ALTER TABLE public.workflow_template_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read template projects" ON public.workflow_template_projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage template projects" ON public.workflow_template_projects FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- Add project_type tag on workflow_templates for filtering
ALTER TABLE public.workflow_templates
  ADD COLUMN IF NOT EXISTS project_types text[] NOT NULL DEFAULT '{}';

-- 4. Backfill
UPDATE public.profiles SET position = 'other' WHERE position IS NULL;