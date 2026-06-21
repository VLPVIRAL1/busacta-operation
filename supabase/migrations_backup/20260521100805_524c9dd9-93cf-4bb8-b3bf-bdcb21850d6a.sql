
-- ============================================================================
-- Document Hub & SharePoint Integration Engine — Phase 0 Infrastructure
-- ============================================================================

-- 1) Admin-editable integration credentials (replaces env secrets)
-- Stored as a singleton row per integration_key; only super_admin/admin can read or write.
CREATE TABLE public.integration_credentials (
  integration_key text PRIMARY KEY,
  display_name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  last_tested_at timestamptz,
  last_test_status text,
  last_test_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view integration credentials"
  ON public.integration_credentials FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert integration credentials"
  ON public.integration_credentials FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update integration credentials"
  ON public.integration_credentials FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_integration_credentials_updated_at
  BEFORE UPDATE ON public.integration_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the SharePoint row so admins see the form immediately
INSERT INTO public.integration_credentials (integration_key, display_name, config, is_active)
VALUES (
  'microsoft_graph',
  'Microsoft Graph / SharePoint',
  jsonb_build_object(
    'tenant_id', '',
    'client_id', '',
    'client_secret', '',
    'root_site_id', ''
  ),
  false
);

-- 2) Per-firm SharePoint site mapping
CREATE TABLE public.firm_sharepoint_config (
  firm_id uuid PRIMARY KEY REFERENCES public.firms(id) ON DELETE CASCADE,
  sp_site_id text,
  sp_site_url text,
  sp_drive_id text,
  sp_list_id text,
  provisioning_status text NOT NULL DEFAULT 'pending',
  provisioning_error text,
  provisioned_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT firm_sharepoint_config_status_check
    CHECK (provisioning_status IN ('pending','provisioning','active','failed','disabled'))
);

ALTER TABLE public.firm_sharepoint_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view firm sharepoint config"
  ON public.firm_sharepoint_config FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_firm_sharepoint_config_updated_at
  BEFORE UPDATE ON public.firm_sharepoint_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Virtual File Graph
CREATE TABLE public.document_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_node_id uuid REFERENCES public.document_nodes(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  node_type text NOT NULL,
  name text NOT NULL,
  extension text,
  sp_item_id text,
  sp_list_item_id text,
  sp_web_url text,
  size_bytes bigint,
  mime_type text,
  etag text,
  last_modified_at timestamptz,
  last_modified_by text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_nodes_type_check
    CHECK (node_type IN ('firm_root','project_folder','task_folder','subfolder','file'))
);

CREATE INDEX idx_document_nodes_firm_parent ON public.document_nodes(firm_id, parent_node_id);
CREATE INDEX idx_document_nodes_task ON public.document_nodes(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_document_nodes_project ON public.document_nodes(project_id) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX uq_document_nodes_firm_sp_item ON public.document_nodes(firm_id, sp_item_id) WHERE sp_item_id IS NOT NULL;

ALTER TABLE public.document_nodes ENABLE ROW LEVEL SECURITY;

-- Admins see all; employees see nodes for tasks they can view (mirrors task visibility)
CREATE POLICY "Admins view all document nodes"
  ON public.document_nodes FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees view document nodes for visible tasks"
  ON public.document_nodes FOR SELECT
  TO authenticated
  USING (
    task_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.task_permissions tp
      WHERE tp.task_id = document_nodes.task_id
        AND tp.user_id = auth.uid()
        AND tp.can_view = true
    )
  );

CREATE TRIGGER trg_document_nodes_updated_at
  BEFORE UPDATE ON public.document_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Mirrored SharePoint metadata per task folder
CREATE TABLE public.task_folder_metadata (
  task_id uuid PRIMARY KEY REFERENCES public.tasks(id) ON DELETE CASCADE,
  sp_list_item_id text,
  stage text,
  due_date date,
  completion_date date,
  difficulty_level text,
  urgency text,
  stage_head text,
  metadata_hash text,
  synced_at timestamptz,
  sync_status text NOT NULL DEFAULT 'pending',
  sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_folder_metadata_status_check
    CHECK (sync_status IN ('pending','syncing','synced','failed'))
);

ALTER TABLE public.task_folder_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view task folder metadata"
  ON public.task_folder_metadata FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_task_folder_metadata_updated_at
  BEFORE UPDATE ON public.task_folder_metadata
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Durable job queue / outbox for Graph mutations
CREATE TABLE public.sharepoint_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  last_error text,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  firm_id uuid REFERENCES public.firms(id) ON DELETE CASCADE,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sharepoint_sync_jobs_status_check
    CHECK (status IN ('queued','running','succeeded','failed','dead')),
  CONSTRAINT sharepoint_sync_jobs_type_check
    CHECK (job_type IN (
      'provision_site','create_project_folder','create_task_folder',
      'patch_task_metadata','upload_file','delete_node','delta_sync','rename_node'
    ))
);

CREATE INDEX idx_sharepoint_sync_jobs_poll
  ON public.sharepoint_sync_jobs(status, next_run_at)
  WHERE status IN ('queued','failed');
CREATE INDEX idx_sharepoint_sync_jobs_firm ON public.sharepoint_sync_jobs(firm_id);

ALTER TABLE public.sharepoint_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view sync jobs"
  ON public.sharepoint_sync_jobs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_sharepoint_sync_jobs_updated_at
  BEFORE UPDATE ON public.sharepoint_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Resumable large-file upload sessions
CREATE TABLE public.sharepoint_upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  node_id uuid REFERENCES public.document_nodes(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sp_upload_url text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  bytes_uploaded bigint NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sharepoint_upload_sessions_status_check
    CHECK (status IN ('open','completed','aborted','expired'))
);

ALTER TABLE public.sharepoint_upload_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own upload sessions"
  ON public.sharepoint_upload_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_sharepoint_upload_sessions_updated_at
  BEFORE UPDATE ON public.sharepoint_upload_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) Auto-enqueue provisioning jobs when firms/projects/tasks are created
CREATE OR REPLACE FUNCTION public.enqueue_sharepoint_provision_firm()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.firm_sharepoint_config (firm_id, provisioning_status)
  VALUES (NEW.id, 'pending')
  ON CONFLICT (firm_id) DO NOTHING;

  INSERT INTO public.sharepoint_sync_jobs (job_type, firm_id, payload, correlation_id)
  VALUES ('provision_site', NEW.id,
    jsonb_build_object('firm_id', NEW.id, 'firm_name', NEW.name, 'firm_identifier', NEW.firm_identifier),
    'firm:' || NEW.id::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_firms_enqueue_sharepoint
  AFTER INSERT ON public.firms
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_sharepoint_provision_firm();

CREATE OR REPLACE FUNCTION public.enqueue_sharepoint_create_project_folder()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.sharepoint_sync_jobs (job_type, firm_id, payload, correlation_id)
  VALUES ('create_project_folder', NEW.entity_id,
    jsonb_build_object('project_id', NEW.id),
    'project:' || NEW.id::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_projects_enqueue_sharepoint
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_sharepoint_create_project_folder();

CREATE OR REPLACE FUNCTION public.enqueue_sharepoint_create_task_folder()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_firm_id uuid;
BEGIN
  IF NEW.entity_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT entity_id INTO v_firm_id FROM public.projects WHERE id = NEW.project_id;
  IF v_firm_id IS NULL THEN
    v_firm_id := NEW.entity_id;
  END IF;
  INSERT INTO public.sharepoint_sync_jobs (job_type, firm_id, payload, correlation_id)
  VALUES ('create_task_folder', v_firm_id,
    jsonb_build_object('task_id', NEW.id),
    'task:' || NEW.id::text);
  INSERT INTO public.task_folder_metadata (task_id, sync_status)
  VALUES (NEW.id, 'pending')
  ON CONFLICT (task_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tasks_enqueue_sharepoint
  AFTER INSERT ON public.tasks
  FOR EACH ROW
  WHEN (NEW.stream = 'cpa')
  EXECUTE FUNCTION public.enqueue_sharepoint_create_task_folder();

CREATE OR REPLACE FUNCTION public.enqueue_sharepoint_patch_task_metadata()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_firm_id uuid;
BEGIN
  IF (COALESCE(NEW.status, '') = COALESCE(OLD.status, '')
      AND COALESCE(NEW.due_date::text, '') = COALESCE(OLD.due_date::text, '')
      AND COALESCE(NEW.urgency, '') = COALESCE(OLD.urgency, '')
      AND COALESCE(NEW.difficulty_level, '') = COALESCE(OLD.difficulty_level, ''))
  THEN
    RETURN NEW;
  END IF;
  SELECT entity_id INTO v_firm_id FROM public.projects WHERE id = NEW.project_id;
  IF v_firm_id IS NULL THEN
    v_firm_id := NEW.entity_id;
  END IF;
  IF v_firm_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.sharepoint_sync_jobs (job_type, firm_id, payload, correlation_id)
  VALUES ('patch_task_metadata', v_firm_id,
    jsonb_build_object('task_id', NEW.id),
    'task-meta:' || NEW.id::text || ':' || extract(epoch from now())::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tasks_patch_metadata_sharepoint
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  WHEN (NEW.stream = 'cpa')
  EXECUTE FUNCTION public.enqueue_sharepoint_patch_task_metadata();
