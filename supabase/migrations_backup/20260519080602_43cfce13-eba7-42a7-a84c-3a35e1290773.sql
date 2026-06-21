
ALTER TABLE public.organizer_deployment_assignments
  ADD COLUMN IF NOT EXISTS template_version integer,
  ADD COLUMN IF NOT EXISTS target_type organizer_target_type,
  ADD COLUMN IF NOT EXISTS assigned_by uuid,
  ADD COLUMN IF NOT EXISTS total_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note text;

-- Make legacy `name` optional so new bulk sends don't require it
ALTER TABLE public.organizer_deployment_assignments
  ALTER COLUMN name DROP NOT NULL;

-- Backfill assigned_by from legacy created_by
UPDATE public.organizer_deployment_assignments
SET assigned_by = created_by
WHERE assigned_by IS NULL;
