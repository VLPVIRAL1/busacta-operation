
-- Per-project difficulty levels (text/icon/color editable)
CREATE TABLE IF NOT EXISTS public.project_difficulty_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  icon text,
  color text,
  sort_order int NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

CREATE TABLE IF NOT EXISTS public.project_urgency_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  icon text,
  color text,
  sort_order int NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);

ALTER TABLE public.project_difficulty_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_urgency_levels ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user can read so ops can pick from list
CREATE POLICY "Authenticated read difficulty levels"
  ON public.project_difficulty_levels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read urgency levels"
  ON public.project_urgency_levels FOR SELECT TO authenticated USING (true);

-- Write: super_admin/admin only (Firm Hub-managed)
CREATE POLICY "Admins manage difficulty levels"
  ON public.project_difficulty_levels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage urgency levels"
  ON public.project_urgency_levels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

-- Updated_at triggers
CREATE TRIGGER trg_pdiff_updated_at BEFORE UPDATE ON public.project_difficulty_levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_purg_updated_at BEFORE UPDATE ON public.project_urgency_levels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add task FKs (nullable; SET NULL on delete so removing a level doesn't break tasks)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS difficulty_level_id uuid REFERENCES public.project_difficulty_levels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS urgency_level_id uuid REFERENCES public.project_urgency_levels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_difficulty_level ON public.tasks(difficulty_level_id);
CREATE INDEX IF NOT EXISTS idx_tasks_urgency_level ON public.tasks(urgency_level_id);
