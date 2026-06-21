ALTER TABLE public.time_logs
  ADD COLUMN IF NOT EXISTS timer_group_id uuid,
  ADD COLUMN IF NOT EXISTS timer_group_size integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_time_logs_timer_group_id
ON public.time_logs (timer_group_id)
WHERE timer_group_id IS NOT NULL;