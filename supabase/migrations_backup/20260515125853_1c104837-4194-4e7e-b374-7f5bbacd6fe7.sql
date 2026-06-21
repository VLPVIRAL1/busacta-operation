
ALTER TABLE public.task_attachments
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_task_attachments_tags ON public.task_attachments USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_task_attachments_archived ON public.task_attachments (archived_at) WHERE archived_at IS NULL;
