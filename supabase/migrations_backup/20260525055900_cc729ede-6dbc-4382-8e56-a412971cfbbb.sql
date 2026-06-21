
-- Archive flag on task type / difficulty / urgency rows so admins can hide
-- entries from creation/edit dropdowns without deleting history.
ALTER TABLE public.project_return_types
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.project_difficulty_levels
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.project_urgency_levels
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

-- Replace "allowed lists" on project_task_options with defaults.
ALTER TABLE public.project_task_options
  ADD COLUMN IF NOT EXISTS default_task_type_id uuid REFERENCES public.project_return_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_priority text,
  ADD COLUMN IF NOT EXISTS default_status text,
  ADD COLUMN IF NOT EXISTS archived_priorities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS archived_statuses text[] NOT NULL DEFAULT '{}';
