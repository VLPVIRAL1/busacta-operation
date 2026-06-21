CREATE INDEX IF NOT EXISTS idx_tasks_assignee_open
  ON public.tasks (assignee_id)
  WHERE status <> 'complete' AND assignee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_reviewer_open
  ON public.tasks (reviewer_id)
  WHERE status <> 'complete' AND reviewer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_created_by_open
  ON public.tasks (created_by)
  WHERE status <> 'complete' AND created_by IS NOT NULL;