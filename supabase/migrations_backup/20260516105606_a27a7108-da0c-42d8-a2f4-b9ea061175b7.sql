-- Archive support for task attachments
ALTER TABLE public.task_attachments
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_task_attachments_archived_at
  ON public.task_attachments(task_id, archived_at);

-- Subtask time tracking
ALTER TABLE public.time_logs
  ADD COLUMN IF NOT EXISTS subtask_id uuid REFERENCES public.task_subtasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_logs_subtask_id
  ON public.time_logs(subtask_id) WHERE subtask_id IS NOT NULL;