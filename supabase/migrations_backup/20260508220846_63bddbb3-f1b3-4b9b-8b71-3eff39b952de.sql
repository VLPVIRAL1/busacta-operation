ALTER TABLE public.task_messages
  ADD COLUMN IF NOT EXISTS open_point_status text NOT NULL DEFAULT 'todo',
  ADD COLUMN IF NOT EXISTS open_point_assignee_id uuid,
  ADD COLUMN IF NOT EXISTS open_point_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS open_point_done_by uuid;

ALTER TABLE public.task_messages
  DROP CONSTRAINT IF EXISTS task_messages_open_point_status_check;
ALTER TABLE public.task_messages
  ADD CONSTRAINT task_messages_open_point_status_check
  CHECK (open_point_status IN ('todo','in_progress','done'));

UPDATE public.task_messages
   SET open_point_status = 'todo'
 WHERE is_open_point = true AND open_point_status IS NULL;