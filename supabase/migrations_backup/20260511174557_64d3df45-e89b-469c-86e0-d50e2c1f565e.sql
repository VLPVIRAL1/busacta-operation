-- Project feature toggles
CREATE TABLE public.project_feature_toggles (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  discussion_enabled BOOLEAN NOT NULL DEFAULT true,
  notes_enabled BOOLEAN NOT NULL DEFAULT true,
  links_enabled BOOLEAN NOT NULL DEFAULT true,
  open_points_enabled BOOLEAN NOT NULL DEFAULT true,
  files_enabled BOOLEAN NOT NULL DEFAULT true,
  timesheet_enabled BOOLEAN NOT NULL DEFAULT true,
  audit_trail_enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
ALTER TABLE public.project_feature_toggles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage project_feature_toggles"
ON public.project_feature_toggles FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Firm members read project_feature_toggles"
ON public.project_feature_toggles FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_feature_toggles.project_id AND user_can_access_firm(p.firm_id)));

-- Project return types
CREATE TABLE public.project_return_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, code)
);
CREATE INDEX idx_project_return_types_project ON public.project_return_types(project_id);
ALTER TABLE public.project_return_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage project_return_types"
ON public.project_return_types FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Firm members read project_return_types"
ON public.project_return_types FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_return_types.project_id AND user_can_access_firm(p.firm_id)));

CREATE TRIGGER trg_pft_updated_at BEFORE UPDATE ON public.project_feature_toggles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_prt_updated_at BEFORE UPDATE ON public.project_return_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();