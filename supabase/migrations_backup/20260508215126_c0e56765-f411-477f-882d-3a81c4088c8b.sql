
-- Multi-assignee/reviewer support: add a role column to task_assignees
ALTER TABLE public.task_assignees
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'assignee'
  CHECK (role IN ('assignee', 'reviewer'));

-- Composite uniqueness across (task, user, role) so the same user can be both
ALTER TABLE public.task_assignees DROP CONSTRAINT IF EXISTS task_assignees_pkey;
ALTER TABLE public.task_assignees
  ADD CONSTRAINT task_assignees_pk PRIMARY KEY (task_id, user_id, role);

-- Pinned messages
ALTER TABLE public.task_messages
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;
