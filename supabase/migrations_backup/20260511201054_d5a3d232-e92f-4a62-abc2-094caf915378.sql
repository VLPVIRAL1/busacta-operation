-- Replace constraint
ALTER TABLE public.project_pipeline_stages
  DROP CONSTRAINT IF EXISTS project_pipeline_stages_primary_state_chk;

ALTER TABLE public.project_pipeline_stages
  ADD CONSTRAINT project_pipeline_stages_primary_state_chk
  CHECK (primary_state IN ('with_cpa','with_bat','on_hold','completed','with_us','with_client','on_hold_or_completed'));

-- Migrate existing stages
UPDATE public.project_pipeline_stages
SET primary_state = CASE
  WHEN is_terminal THEN 'completed'
  WHEN primary_state = 'with_us' THEN 'with_bat'
  WHEN primary_state = 'with_client' THEN 'with_cpa'
  WHEN primary_state = 'on_hold_or_completed' THEN 'on_hold'
  ELSE primary_state
END;

-- Tighten constraint to only the new four
ALTER TABLE public.project_pipeline_stages
  DROP CONSTRAINT IF EXISTS project_pipeline_stages_primary_state_chk;
ALTER TABLE public.project_pipeline_stages
  ADD CONSTRAINT project_pipeline_stages_primary_state_chk
  CHECK (primary_state IN ('with_cpa','with_bat','on_hold','completed'));

-- Pricing rules
CREATE TABLE IF NOT EXISTS public.project_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  return_type_id uuid REFERENCES public.project_return_types(id) ON DELETE SET NULL,
  task_type_key text,
  label text NOT NULL,
  pricing_model text NOT NULL CHECK (pricing_model IN ('fixed','hourly')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_pricing_rules_project ON public.project_pricing_rules(project_id);
ALTER TABLE public.project_pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read pricing rules" ON public.project_pricing_rules;
CREATE POLICY "Read pricing rules" ON public.project_pricing_rules
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND public.user_can_access_firm(p.firm_id)));

DROP POLICY IF EXISTS "Admins manage pricing rules" ON public.project_pricing_rules;
CREATE POLICY "Admins manage pricing rules" ON public.project_pricing_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

DROP TRIGGER IF EXISTS trg_project_pricing_rules_updated_at ON public.project_pricing_rules;
CREATE TRIGGER trg_project_pricing_rules_updated_at
  BEFORE UPDATE ON public.project_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed function: 6 stages mapped to 4 major buckets
CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.project_pipeline_stages (project_id, key, label, sort_order, is_terminal, primary_state) VALUES
    (NEW.id, 'handover_received', 'Handover Received', 1, false, 'with_bat'),
    (NEW.id, 'in_progress',       'In Progress',       2, false, 'with_bat'),
    (NEW.id, 'review',             'Review',            3, false, 'with_bat'),
    (NEW.id, 'client_review',      'Client Review',     4, false, 'with_cpa'),
    (NEW.id, 'on_hold',            'On Hold',           5, false, 'on_hold'),
    (NEW.id, 'completed',          'Completed',         6, true,  'completed')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

-- Auto-provision feature toggles + task options on project create
CREATE OR REPLACE FUNCTION public.seed_default_project_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.project_feature_toggles (project_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.project_task_options (project_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_seed_project_setup ON public.projects;
CREATE TRIGGER trg_seed_project_setup
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_project_setup();

DROP TRIGGER IF EXISTS trg_seed_default_pipeline_stages ON public.projects;
CREATE TRIGGER trg_seed_default_pipeline_stages
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_pipeline_stages();

-- Backfill existing projects
INSERT INTO public.project_feature_toggles (project_id)
  SELECT p.id FROM public.projects p
  LEFT JOIN public.project_feature_toggles t ON t.project_id = p.id
  WHERE t.project_id IS NULL;

INSERT INTO public.project_task_options (project_id)
  SELECT p.id FROM public.projects p
  LEFT JOIN public.project_task_options o ON o.project_id = p.id
  WHERE o.project_id IS NULL;

INSERT INTO public.project_pipeline_stages (project_id, key, label, sort_order, is_terminal, primary_state)
SELECT p.id, v.key, v.label, v.sort_order, v.is_terminal, v.primary_state
FROM public.projects p
CROSS JOIN (VALUES
  ('handover_received','Handover Received',1,false,'with_bat'),
  ('in_progress','In Progress',2,false,'with_bat'),
  ('review','Review',3,false,'with_bat'),
  ('client_review','Client Review',4,false,'with_cpa'),
  ('on_hold','On Hold',5,false,'on_hold'),
  ('completed','Completed',6,true,'completed')
) AS v(key,label,sort_order,is_terminal,primary_state)
WHERE NOT EXISTS (SELECT 1 FROM public.project_pipeline_stages s WHERE s.project_id = p.id);