-- ============================================================================
-- Phase 4: Document Manager — Categories, Library Templates, Deploy Audit
-- ============================================================================

-- 1. project_file_categories ---------------------------------------------------
CREATE TABLE public.project_file_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX project_file_categories_unique_name
  ON public.project_file_categories (project_id, lower(name));
CREATE INDEX project_file_categories_project_idx
  ON public.project_file_categories (project_id, is_active);

ALTER TABLE public.project_file_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm staff read categories"
  ON public.project_file_categories FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND public.user_can_access_firm(p.firm_id)
    )
  );

CREATE POLICY "firm admins manage categories"
  ON public.project_file_categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'super_admin'::app_role)
          OR public.firm_member_can(p.firm_id, 'manage_documents')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'super_admin'::app_role)
          OR public.firm_member_can(p.firm_id, 'manage_documents')
        )
    )
  );

CREATE TRIGGER trg_project_file_categories_updated_at
  BEFORE UPDATE ON public.project_file_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. task_attachments — add category + description ----------------------------
ALTER TABLE public.task_attachments
  ADD COLUMN category_id uuid REFERENCES public.project_file_categories(id) ON DELETE SET NULL,
  ADD COLUMN description text;

ALTER TABLE public.task_attachments
  ADD CONSTRAINT task_attachments_description_max_len
  CHECK (description IS NULL OR length(description) <= 500);

CREATE INDEX task_attachments_category_idx ON public.task_attachments (category_id);

-- 3. folder_library_templates --------------------------------------------------
CREATE TABLE public.folder_library_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  project_types text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX folder_library_templates_unique_name
  ON public.folder_library_templates (firm_id, lower(name));
CREATE INDEX folder_library_templates_firm_active_idx
  ON public.folder_library_templates (firm_id, is_active);

ALTER TABLE public.folder_library_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm members read active templates"
  ON public.folder_library_templates FOR SELECT
  TO authenticated
  USING (public.user_can_access_firm(firm_id));

CREATE POLICY "firm admins manage templates"
  ON public.folder_library_templates FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.firm_member_can(firm_id, 'manage_documents')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.firm_member_can(firm_id, 'manage_documents')
  );

CREATE TRIGGER trg_folder_library_templates_updated_at
  BEFORE UPDATE ON public.folder_library_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. folder_library_template_nodes --------------------------------------------
CREATE TABLE public.folder_library_template_nodes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES public.folder_library_templates(id) ON DELETE CASCADE,
  parent_node_id uuid REFERENCES public.folder_library_template_nodes(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Uniqueness for sibling folders inside same parent. NULL parent_node_id needs
-- two indexes because Postgres treats NULLs as distinct in unique indexes.
CREATE UNIQUE INDEX folder_library_template_nodes_unique_root
  ON public.folder_library_template_nodes (template_id, lower(name))
  WHERE parent_node_id IS NULL;
CREATE UNIQUE INDEX folder_library_template_nodes_unique_child
  ON public.folder_library_template_nodes (template_id, parent_node_id, lower(name))
  WHERE parent_node_id IS NOT NULL;
CREATE INDEX folder_library_template_nodes_template_idx
  ON public.folder_library_template_nodes (template_id, parent_node_id, sort_order);

ALTER TABLE public.folder_library_template_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm members read template nodes"
  ON public.folder_library_template_nodes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.folder_library_templates t
      WHERE t.id = template_id AND public.user_can_access_firm(t.firm_id)
    )
  );

CREATE POLICY "firm admins manage template nodes"
  ON public.folder_library_template_nodes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.folder_library_templates t
      WHERE t.id = template_id
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'super_admin'::app_role)
          OR public.firm_member_can(t.firm_id, 'manage_documents')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.folder_library_templates t
      WHERE t.id = template_id
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'super_admin'::app_role)
          OR public.firm_member_can(t.firm_id, 'manage_documents')
        )
    )
  );

-- 5. folder_template_deployments ----------------------------------------------
CREATE TABLE public.folder_template_deployments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.folder_library_templates(id) ON DELETE SET NULL,
  template_name_snapshot text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scope text NOT NULL CHECK (scope IN ('task','project')),
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  target_path text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'merge' CHECK (mode IN ('merge','replace')),
  folders_created int NOT NULL DEFAULT 0,
  folders_skipped int NOT NULL DEFAULT 0,
  tasks_touched int NOT NULL DEFAULT 1,
  is_client_visible boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX folder_template_deployments_firm_idx
  ON public.folder_template_deployments (firm_id, occurred_at DESC);
CREATE INDEX folder_template_deployments_template_idx
  ON public.folder_template_deployments (template_id, occurred_at DESC);

ALTER TABLE public.folder_template_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm staff read deployments"
  ON public.folder_template_deployments FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'employee'::app_role)
    OR (
      public.has_role(auth.uid(), 'client'::app_role)
      AND is_client_visible = true
      AND firm_id = public.current_client_firm_id()
    )
  );

CREATE POLICY "firm staff write deployments"
  ON public.folder_template_deployments FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_can_access_firm(firm_id)
    AND actor_id = auth.uid()
  );

-- 6. Seed: three starter templates per existing firm --------------------------
DO $$
DECLARE
  _firm RECORD;
  _tpl_id uuid;
  _root_id uuid;
  _child_id uuid;
BEGIN
  FOR _firm IN SELECT id FROM public.firms LOOP

    -- 1040 Individual Tax → tax_preparation
    INSERT INTO public.folder_library_templates (firm_id, name, description, project_types)
    VALUES (_firm.id, '1040 Individual Tax', 'PBC, tax return drafts, source documents for individual returns', ARRAY['tax_preparation'])
    ON CONFLICT (firm_id, lower(name)) DO NOTHING
    RETURNING id INTO _tpl_id;
    IF _tpl_id IS NOT NULL THEN
      INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
      VALUES (_tpl_id, NULL, 'PBC', 1) RETURNING id INTO _root_id;
      INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
      VALUES (_tpl_id, NULL, 'Tax Return', 2) RETURNING id INTO _root_id;
        INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
        VALUES (_tpl_id, _root_id, 'Drafts', 1);
        INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
        VALUES (_tpl_id, _root_id, 'E-Filed', 2);
      INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
      VALUES (_tpl_id, NULL, 'Source Documents', 3) RETURNING id INTO _root_id;
        INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
        VALUES (_tpl_id, _root_id, 'W-2s', 1);
        INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
        VALUES (_tpl_id, _root_id, '1099s', 2);
        INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
        VALUES (_tpl_id, _root_id, 'K-1s', 3);
    END IF;
    _tpl_id := NULL;

    -- Monthly Bookkeeping → accounting
    INSERT INTO public.folder_library_templates (firm_id, name, description, project_types)
    VALUES (_firm.id, 'Monthly Bookkeeping', 'Bank statements, payroll, quarterly financials', ARRAY['accounting'])
    ON CONFLICT (firm_id, lower(name)) DO NOTHING
    RETURNING id INTO _tpl_id;
    IF _tpl_id IS NOT NULL THEN
      INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
      VALUES (_tpl_id, NULL, 'Bank Statements', 1);
      INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
      VALUES (_tpl_id, NULL, 'Payroll', 2);
      INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
      VALUES (_tpl_id, NULL, 'Financials', 3) RETURNING id INTO _root_id;
        INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
        VALUES (_tpl_id, _root_id, 'Q1', 1);
        INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
        VALUES (_tpl_id, _root_id, 'Q2', 2);
        INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
        VALUES (_tpl_id, _root_id, 'Q3', 3);
        INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
        VALUES (_tpl_id, _root_id, 'Q4', 4);
    END IF;
    _tpl_id := NULL;

    -- Corporate Audit Setup → auditing
    INSERT INTO public.folder_library_templates (firm_id, name, description, project_types)
    VALUES (_firm.id, 'Corporate Audit Setup', 'Planning, fieldwork, and final report structure for audits', ARRAY['auditing'])
    ON CONFLICT (firm_id, lower(name)) DO NOTHING
    RETURNING id INTO _tpl_id;
    IF _tpl_id IS NOT NULL THEN
      INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
      VALUES (_tpl_id, NULL, 'Planning', 1);
      INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
      VALUES (_tpl_id, NULL, 'Fieldwork', 2);
      INSERT INTO public.folder_library_template_nodes (template_id, parent_node_id, name, sort_order)
      VALUES (_tpl_id, NULL, 'Final Reports', 3);
    END IF;

  END LOOP;
END $$;