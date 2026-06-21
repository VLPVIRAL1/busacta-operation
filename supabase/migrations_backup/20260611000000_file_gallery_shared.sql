-- File Gallery: flag a task file as "shared" so it surfaces in the nearest
-- Residual (Shared Resources) folder of its project/client. Virtual reference
-- only -- the file's source of truth stays in its originating task.

ALTER TABLE public.task_attachments
  ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shared_at timestamptz,
  ADD COLUMN IF NOT EXISTS shared_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_task_attachments_is_shared
  ON public.task_attachments (is_shared) WHERE is_shared = true;
