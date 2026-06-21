-- Document Manager Phase 2: per-task folder structure + client visibility on attachments

ALTER TABLE public.task_attachments
  ADD COLUMN IF NOT EXISTS folder_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_client_visible boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_task_attachments_task_folder
  ON public.task_attachments (task_id, folder_path);

CREATE TABLE IF NOT EXISTS public.task_document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (task_id, path)
);

CREATE INDEX IF NOT EXISTS idx_task_document_folders_task ON public.task_document_folders (task_id);

ALTER TABLE public.task_document_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal manage task document folders" ON public.task_document_folders;
CREATE POLICY "Internal manage task document folders"
ON public.task_document_folders
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'employee'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'employee'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- Allow clients to read shared task attachments for tasks in their firm
DROP POLICY IF EXISTS "Clients read shared task files" ON public.task_attachments;
CREATE POLICY "Clients read shared task files"
ON public.task_attachments
FOR SELECT
USING (
  is_client_visible = true
  AND EXISTS (
    SELECT 1
    FROM public.tasks t
    JOIN public.client_entities ce ON ce.id = t.entity_id
    JOIN public.projects p ON p.id = ce.project_id
    WHERE t.id = task_attachments.task_id
      AND public.user_can_access_firm(p.firm_id)
  )
);