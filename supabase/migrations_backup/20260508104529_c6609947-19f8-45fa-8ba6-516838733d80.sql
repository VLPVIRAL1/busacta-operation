
-- 1. Pipeline stage enum + column on tasks
DO $$ BEGIN
  CREATE TYPE public.pipeline_stage AS ENUM (
    'handover_received','in_prep','internal_qc','waiting_cpa','ready_for_delivery','final_signoff'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS pipeline_stage public.pipeline_stage NOT NULL DEFAULT 'handover_received',
  ADD COLUMN IF NOT EXISTS sharepoint_url text;

-- 2. Open points on task_messages
ALTER TABLE public.task_messages
  ADD COLUMN IF NOT EXISTS is_open_point boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid;

-- 3. 30-min edit window: tighten author update policy
DROP POLICY IF EXISTS "Authors update own messages" ON public.task_messages;
CREATE POLICY "Authors update own messages within 30 min"
ON public.task_messages
FOR UPDATE
USING (author_id = auth.uid() AND created_at > now() - interval '30 minutes')
WITH CHECK (author_id = auth.uid());

-- 4. Active session tracking on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_session_id text;

-- Enable realtime for profiles so clients can detect session takeover
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- 5. Firm health view (admins/employees only via RLS on underlying tables)
CREATE OR REPLACE VIEW public.firm_health AS
SELECT
  f.id AS firm_id,
  f.name AS firm_name,
  COUNT(DISTINCT p.id) AS project_count,
  COUNT(t.id) AS task_count,
  COUNT(t.id) FILTER (WHERE t.status = 'complete') AS completed_count,
  CASE WHEN COUNT(t.id) = 0 THEN 0
       ELSE ROUND(100.0 * COUNT(t.id) FILTER (WHERE t.status = 'complete') / COUNT(t.id), 1)
  END AS completion_pct
FROM public.firms f
LEFT JOIN public.projects p ON p.firm_id = f.id
LEFT JOIN public.client_entities ce ON ce.project_id = p.id
LEFT JOIN public.tasks t ON t.entity_id = ce.id
GROUP BY f.id, f.name;
