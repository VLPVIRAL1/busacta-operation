-- Add default_due_hours to project_task_options.
-- Controls how many hours after creation a bulk-imported task's due date defaults to.
-- 48 h (2 days) is the system default when not explicitly set.
ALTER TABLE project_task_options
  ADD COLUMN IF NOT EXISTS default_due_hours integer NOT NULL DEFAULT 48;
