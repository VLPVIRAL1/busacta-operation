
-- 1. task_document_folders: is_system + seed
ALTER TABLE public.task_document_folders ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

-- Backfill: ensure every task has an Unsorted Documents folder
INSERT INTO public.task_document_folders (task_id, path, is_client_visible, is_system, created_by)
SELECT t.id, 'Unsorted Documents', false, true, t.created_by
FROM public.tasks t
WHERE NOT EXISTS (
  SELECT 1 FROM public.task_document_folders f
  WHERE f.task_id = t.id AND f.path = 'Unsorted Documents'
);

-- Mark any existing Unsorted Documents folders as system
UPDATE public.task_document_folders
SET is_system = true
WHERE path = 'Unsorted Documents';

-- Trigger: every new task gets an Unsorted Documents folder
CREATE OR REPLACE FUNCTION public.create_unsorted_documents_folder()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.task_document_folders (task_id, path, is_client_visible, is_system, created_by)
  VALUES (NEW.id, 'Unsorted Documents', false, true, NEW.created_by)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_unsorted_folder ON public.tasks;
CREATE TRIGGER trg_task_unsorted_folder
AFTER INSERT ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.create_unsorted_documents_folder();

-- 2. tasks.entity_id NOT NULL + period CHECK
ALTER TABLE public.tasks ALTER COLUMN entity_id SET NOT NULL;

UPDATE public.tasks SET period = 'Yearly' WHERE period = 'Annual';

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_period_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_period_check
  CHECK (period IS NULL OR period IN ('Monthly','Quarterly','Yearly','Ad-hoc'));

-- 3. time_logs: subtask_id
ALTER TABLE public.time_logs ADD COLUMN IF NOT EXISTS subtask_id uuid REFERENCES public.task_subtasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_time_logs_subtask_id ON public.time_logs(subtask_id) WHERE subtask_id IS NOT NULL;

-- 4. task_attachments: source (for file_request uploads)
ALTER TABLE public.task_attachments ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user';

-- 5. file_request_links
CREATE TABLE IF NOT EXISTS public.file_request_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  message text,
  expires_at timestamptz NOT NULL,
  max_uploads integer NOT NULL DEFAULT 25,
  upload_count integer NOT NULL DEFAULT 0,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_file_request_links_task ON public.file_request_links(task_id);
CREATE INDEX IF NOT EXISTS idx_file_request_links_token ON public.file_request_links(token);

ALTER TABLE public.file_request_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view file request links"
  ON public.file_request_links FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can create file request links"
  ON public.file_request_links FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update their own file request links"
  ON public.file_request_links FOR UPDATE
  TO authenticated USING (auth.uid() = created_by);

CREATE POLICY "Creators can delete their own file request links"
  ON public.file_request_links FOR DELETE
  TO authenticated USING (auth.uid() = created_by);

-- 6. project_file_tags
CREATE TABLE IF NOT EXISTS public.project_file_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#64748b',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, label)
);
CREATE INDEX IF NOT EXISTS idx_project_file_tags_project ON public.project_file_tags(project_id);

ALTER TABLE public.project_file_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view project file tags"
  ON public.project_file_tags FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can create project file tags"
  ON public.project_file_tags FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update project file tags"
  ON public.project_file_tags FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete project file tags"
  ON public.project_file_tags FOR DELETE
  TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.touch_project_file_tags_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_project_file_tags_updated ON public.project_file_tags;
CREATE TRIGGER trg_project_file_tags_updated
  BEFORE UPDATE ON public.project_file_tags
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_file_tags_updated_at();
