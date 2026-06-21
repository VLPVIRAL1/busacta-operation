-- SharePoint Document Storage Integration
-- Adds per-firm site config, per-project library refs, task folder refs,
-- document metadata table, configurable subfolder templates, and folder node tracking.

-- 1a. firms: add sharepoint_site_url so admins can paste the firm's SP site URL in firm settings
ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS sharepoint_site_url text;

-- 1b. firm_sharepoint_config: add tenant_domain (sp_site_id / sp_site_url / provisioning_status already exist)
ALTER TABLE public.firm_sharepoint_config
  ADD COLUMN IF NOT EXISTS tenant_domain text;

-- 2. projects: store project-level Document Library reference
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS sharepoint_library_url text,
  ADD COLUMN IF NOT EXISTS sharepoint_drive_id    text,
  ADD COLUMN IF NOT EXISTS sharepoint_list_id     text,
  ADD COLUMN IF NOT EXISTS sharepoint_site_id     text;

-- 3. tasks: store task folder reference
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS sharepoint_folder_id   text,
  ADD COLUMN IF NOT EXISTS sharepoint_folder_path text;

-- 4. documents: file metadata (physical files live in SharePoint only)
CREATE TABLE IF NOT EXISTS public.documents (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id             uuid        REFERENCES public.tasks(id) ON DELETE CASCADE,
  project_id          uuid        REFERENCES public.projects(id),
  firm_id             uuid        REFERENCES public.firms(id),
  file_name           text        NOT NULL,
  file_size_bytes     integer,
  mime_type           text,
  sharepoint_item_id  text        NOT NULL,
  sharepoint_url      text        NOT NULL,
  sharepoint_web_url  text,
  uploaded_by         uuid        REFERENCES auth.users(id),
  uploaded_at         timestamptz DEFAULT now(),
  migrated_from       text
);
CREATE INDEX IF NOT EXISTS idx_documents_task_id
  ON public.documents(task_id);
CREATE INDEX IF NOT EXISTS idx_documents_project_id
  ON public.documents(project_id);

-- 5. task_template_folders: defines subfolders per task type
--    firm_id NULL = global default; firm_id set = firm-specific override.
--    Query: select firm-specific rows first; fall back to global defaults if none.
CREATE TABLE IF NOT EXISTS public.task_template_folders (
  id           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id      uuid    REFERENCES public.firms(id) ON DELETE CASCADE,
  task_type_id uuid    NOT NULL,
  folder_name  text    NOT NULL,
  sort_order   integer DEFAULT 0
);

-- 6. task_folder_nodes: tracks auto-created subfolders per task (both template subfolders and audit entries)
CREATE TABLE IF NOT EXISTS public.task_folder_nodes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid        REFERENCES public.tasks(id) ON DELETE CASCADE,
  folder_name text        NOT NULL,
  sp_item_id  text        NOT NULL,
  sp_web_url  text,
  created_at  timestamptz DEFAULT now()
);

-- 7. RLS: enable on new tables (all reads/writes go through server-side admin client, but RLS must be on)
ALTER TABLE public.documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_template_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_folder_nodes  ENABLE ROW LEVEL SECURITY;

-- 8. Seed tenant_domain into integration_credentials (safe, additive — no-ops if already present)
UPDATE public.integration_credentials
SET config = config || jsonb_build_object('tenant_domain', '')
WHERE integration_key = 'microsoft_graph'
  AND NOT (config ? 'tenant_domain');

-- 9. Now that sharepoint_site_id exists on projects, create the deferred UPDATE trigger
-- (function was already updated in 20260606130000_fix_provision_project_lists_trigger.sql).
DROP TRIGGER IF EXISTS trg_provision_project_lists ON projects;
CREATE TRIGGER trg_provision_project_lists
  AFTER UPDATE ON projects
  FOR EACH ROW
  WHEN (OLD.sharepoint_site_id IS NULL AND NEW.sharepoint_site_id IS NOT NULL)
  EXECUTE FUNCTION _enqueue_provision_project_lists();
