-- Organizer Hub — Phase 1 schema

CREATE TYPE public.organizer_purpose AS ENUM (
  'tax', 'hr_exam', 'onboarding', 'learning_quiz', 'generic'
);

CREATE TYPE public.organizer_template_status AS ENUM (
  'draft', 'published', 'archived'
);

CREATE TYPE public.organizer_block_type AS ENUM (
  'section', 'subsection', 'info',
  'short_text', 'long_text', 'number', 'currency',
  'yes_no', 'single_choice', 'multi_choice',
  'date', 'date_range',
  'file_upload', 'signature', 'address', 'table'
);

CREATE TYPE public.organizer_deployment_status AS ENUM (
  'not_started', 'in_progress', 'submitted', 'under_review', 'graded', 'returned'
);

CREATE TYPE public.organizer_target_type AS ENUM (
  'client_entity', 'profile', 'task', 'project', 'course', 'firm'
);

CREATE TABLE public.organizer_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  purpose         public.organizer_purpose NOT NULL DEFAULT 'generic',
  is_exam         BOOLEAN NOT NULL DEFAULT false,
  passing_score   NUMERIC,
  status          public.organizer_template_status NOT NULL DEFAULT 'draft',
  version         INTEGER NOT NULL DEFAULT 1,
  parent_template_id UUID REFERENCES public.organizer_templates(id) ON DELETE SET NULL,
  firm_id         UUID,
  created_by      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_organizer_templates_firm ON public.organizer_templates(firm_id);
CREATE INDEX idx_organizer_templates_status ON public.organizer_templates(status);

CREATE TABLE public.organizer_blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES public.organizer_templates(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES public.organizer_blocks(id) ON DELETE CASCADE,
  order_index     INTEGER NOT NULL DEFAULT 0,
  block_type      public.organizer_block_type NOT NULL,
  question_text   TEXT,
  help_text       TEXT,
  is_required     BOOLEAN NOT NULL DEFAULT false,
  config_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  conditional_rules_json JSONB,
  scoring_json    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_organizer_blocks_template ON public.organizer_blocks(template_id, parent_id, order_index);

CREATE TABLE public.organizer_deployments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES public.organizer_templates(id) ON DELETE RESTRICT,
  template_version INTEGER NOT NULL,
  target_type     public.organizer_target_type NOT NULL,
  target_id       UUID NOT NULL,
  assignee_profile_id UUID NOT NULL,
  assigned_by     UUID NOT NULL,
  firm_id         UUID,
  status          public.organizer_deployment_status NOT NULL DEFAULT 'not_started',
  due_at          TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  graded_at       TIMESTAMPTZ,
  score           NUMERIC,
  score_breakdown_json JSONB,
  last_visited_block_id UUID,
  campaign_id     UUID,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_organizer_deployments_target ON public.organizer_deployments(target_type, target_id);
CREATE INDEX idx_organizer_deployments_assignee ON public.organizer_deployments(assignee_profile_id, status);
CREATE INDEX idx_organizer_deployments_firm ON public.organizer_deployments(firm_id);
CREATE INDEX idx_organizer_deployments_template ON public.organizer_deployments(template_id);

CREATE TABLE public.organizer_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id   UUID NOT NULL REFERENCES public.organizer_deployments(id) ON DELETE CASCADE,
  block_id        UUID NOT NULL REFERENCES public.organizer_blocks(id) ON DELETE CASCADE,
  value_json      JSONB,
  is_skipped      BOOLEAN NOT NULL DEFAULT false,
  answered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_by     UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deployment_id, block_id)
);
CREATE INDEX idx_organizer_responses_deployment ON public.organizer_responses(deployment_id);

CREATE TABLE public.organizer_response_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id   UUID NOT NULL REFERENCES public.organizer_deployments(id) ON DELETE CASCADE,
  block_id        UUID NOT NULL REFERENCES public.organizer_blocks(id) ON DELETE CASCADE,
  previous_value_json JSONB,
  new_value_json  JSONB,
  changed_by      UUID NOT NULL,
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_organizer_response_history_deployment ON public.organizer_response_history(deployment_id, changed_at DESC);

CREATE TABLE public.organizer_deployment_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES public.organizer_templates(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  created_by      UUID NOT NULL,
  firm_id         UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_organizer_templates_updated
  BEFORE UPDATE ON public.organizer_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_organizer_blocks_updated
  BEFORE UPDATE ON public.organizer_blocks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_organizer_deployments_updated
  BEFORE UPDATE ON public.organizer_deployments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_organizer_responses_updated
  BEFORE UPDATE ON public.organizer_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- History trigger
CREATE OR REPLACE FUNCTION public.log_organizer_response_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.organizer_response_history (deployment_id, block_id, previous_value_json, new_value_json, changed_by)
    VALUES (NEW.deployment_id, NEW.block_id, NULL, NEW.value_json, NEW.answered_by);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND (OLD.value_json IS DISTINCT FROM NEW.value_json) THEN
    INSERT INTO public.organizer_response_history (deployment_id, block_id, previous_value_json, new_value_json, changed_by)
    VALUES (NEW.deployment_id, NEW.block_id, OLD.value_json, NEW.value_json, NEW.answered_by);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_organizer_response_history
  AFTER INSERT OR UPDATE ON public.organizer_responses
  FOR EACH ROW EXECUTE FUNCTION public.log_organizer_response_change();

-- Permission helpers (uses existing app_role values: admin, hr_manager, finance_manager, super_admin)
CREATE OR REPLACE FUNCTION public.can_manage_organizer(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'super_admin'::public.app_role)
    OR public.has_role(_user_id, 'hr_manager'::public.app_role)
    OR public.has_role(_user_id, 'finance_manager'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.can_view_deployment(_user_id UUID, _deployment_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizer_deployments d
    WHERE d.id = _deployment_id
      AND (
        d.assignee_profile_id = _user_id
        OR d.assigned_by = _user_id
        OR public.can_manage_organizer(_user_id)
      )
  );
$$;

ALTER TABLE public.organizer_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_response_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizer_deployment_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates: view by authenticated" ON public.organizer_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Templates: managers can insert" ON public.organizer_templates
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_organizer(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Templates: managers can update" ON public.organizer_templates
  FOR UPDATE TO authenticated USING (public.can_manage_organizer(auth.uid())) WITH CHECK (public.can_manage_organizer(auth.uid()));
CREATE POLICY "Templates: admins can delete" ON public.organizer_templates
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Blocks: view by authenticated" ON public.organizer_blocks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Blocks: managers can write" ON public.organizer_blocks
  FOR ALL TO authenticated USING (public.can_manage_organizer(auth.uid())) WITH CHECK (public.can_manage_organizer(auth.uid()));

CREATE POLICY "Deployments: viewable by allowed users" ON public.organizer_deployments
  FOR SELECT TO authenticated USING (
    assignee_profile_id = auth.uid()
    OR assigned_by = auth.uid()
    OR public.can_manage_organizer(auth.uid())
  );
CREATE POLICY "Deployments: managers can insert" ON public.organizer_deployments
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_organizer(auth.uid()) AND assigned_by = auth.uid());
CREATE POLICY "Deployments: managers or assignee can update" ON public.organizer_deployments
  FOR UPDATE TO authenticated USING (
    assignee_profile_id = auth.uid() OR public.can_manage_organizer(auth.uid())
  ) WITH CHECK (
    assignee_profile_id = auth.uid() OR public.can_manage_organizer(auth.uid())
  );
CREATE POLICY "Deployments: admins can delete" ON public.organizer_deployments
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Responses: viewable by allowed users" ON public.organizer_responses
  FOR SELECT TO authenticated USING (public.can_view_deployment(auth.uid(), deployment_id));
CREATE POLICY "Responses: assignee writes when active" ON public.organizer_responses
  FOR INSERT TO authenticated WITH CHECK (
    answered_by = auth.uid() AND EXISTS (
      SELECT 1 FROM public.organizer_deployments d
      WHERE d.id = deployment_id
        AND d.assignee_profile_id = auth.uid()
        AND d.status IN ('not_started', 'in_progress', 'returned')
    )
  );
CREATE POLICY "Responses: assignee updates when active" ON public.organizer_responses
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.organizer_deployments d
      WHERE d.id = deployment_id
        AND d.assignee_profile_id = auth.uid()
        AND d.status IN ('not_started', 'in_progress', 'returned')
    )
  ) WITH CHECK (answered_by = auth.uid());

CREATE POLICY "Response history: viewable by allowed users" ON public.organizer_response_history
  FOR SELECT TO authenticated USING (public.can_view_deployment(auth.uid(), deployment_id));

CREATE POLICY "Assignments: managers can read" ON public.organizer_deployment_assignments
  FOR SELECT TO authenticated USING (public.can_manage_organizer(auth.uid()));
CREATE POLICY "Assignments: managers can write" ON public.organizer_deployment_assignments
  FOR ALL TO authenticated USING (public.can_manage_organizer(auth.uid())) WITH CHECK (public.can_manage_organizer(auth.uid()));
