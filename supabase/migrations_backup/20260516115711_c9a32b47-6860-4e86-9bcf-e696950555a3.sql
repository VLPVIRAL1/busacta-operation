
-- 1. file_request_links: password protection
ALTER TABLE public.file_request_links
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS password_set_at timestamptz;

-- 2. task_attachment_categories junction (multi-assign)
CREATE TABLE IF NOT EXISTS public.task_attachment_categories (
  attachment_id uuid NOT NULL REFERENCES public.task_attachments(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.project_file_categories(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (attachment_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_tac_attachment ON public.task_attachment_categories(attachment_id);
CREATE INDEX IF NOT EXISTS idx_tac_category ON public.task_attachment_categories(category_id);

ALTER TABLE public.task_attachment_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal manage attachment categories"
  ON public.task_attachment_categories
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Clients read shared attachment categories"
  ON public.task_attachment_categories
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.task_attachments ta
    JOIN public.tasks t ON t.id = ta.task_id
    JOIN public.client_entities ce ON ce.id = t.entity_id
    JOIN public.projects p ON p.id = ce.project_id
    WHERE ta.id = task_attachment_categories.attachment_id
      AND ta.is_client_visible = true
      AND user_can_access_firm(p.firm_id)
  ));

-- Backfill from existing single category_id
INSERT INTO public.task_attachment_categories (attachment_id, category_id)
SELECT id, category_id FROM public.task_attachments
WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. task_attachment_annotations (shared)
CREATE TABLE IF NOT EXISTS public.task_attachment_annotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id uuid NOT NULL REFERENCES public.task_attachments(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{"elements":[]}'::jsonb,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attachment_id)
);
CREATE INDEX IF NOT EXISTS idx_taa_attachment ON public.task_attachment_annotations(attachment_id);

ALTER TABLE public.task_attachment_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal manage annotations"
  ON public.task_attachment_annotations
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_taa_updated_at
  BEFORE UPDATE ON public.task_attachment_annotations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. folder color
ALTER TABLE public.task_document_folders
  ADD COLUMN IF NOT EXISTS color text;

-- 5. task complexity
DO $$ BEGIN
  CREATE TYPE public.task_complexity AS ENUM ('a_hard', 'b_medium', 'c_easy');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS complexity public.task_complexity NOT NULL DEFAULT 'b_medium';

-- 6. subtask archive
ALTER TABLE public.task_subtasks
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_task_subtasks_archived
  ON public.task_subtasks(task_id, archived_at);

-- 7. action item archive
ALTER TABLE public.task_action_items
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_task_action_items_archived
  ON public.task_action_items(task_id, archived_at);
