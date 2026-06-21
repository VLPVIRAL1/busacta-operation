-- Add primary state classification to project pipeline stages
ALTER TABLE public.project_pipeline_stages
  ADD COLUMN IF NOT EXISTS primary_state text NOT NULL DEFAULT 'with_us';

ALTER TABLE public.project_pipeline_stages
  DROP CONSTRAINT IF EXISTS project_pipeline_stages_primary_state_chk;
ALTER TABLE public.project_pipeline_stages
  ADD CONSTRAINT project_pipeline_stages_primary_state_chk
  CHECK (primary_state IN ('with_us', 'with_client', 'on_hold_or_completed'));

-- Pre-classify existing terminal stages
UPDATE public.project_pipeline_stages
SET primary_state = 'on_hold_or_completed'
WHERE is_terminal = true AND primary_state = 'with_us';

-- Link tasks to the firm's tax return types as a custom field option
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS return_type_id uuid REFERENCES public.project_return_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_return_type ON public.tasks(return_type_id) WHERE return_type_id IS NOT NULL;