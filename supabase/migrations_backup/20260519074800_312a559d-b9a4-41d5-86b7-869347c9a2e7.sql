
-- 1. Add cancelled to deployment status enum
ALTER TYPE organizer_deployment_status ADD VALUE IF NOT EXISTS 'cancelled';

-- 2. Bulk campaign table
CREATE TABLE IF NOT EXISTS public.organizer_deployment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.organizer_templates(id) ON DELETE CASCADE,
  template_version integer NOT NULL,
  target_type organizer_target_type NOT NULL,
  assigned_by uuid NOT NULL,
  firm_id uuid,
  note text,
  total_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizer_deployments
  ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.organizer_deployment_assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organizer_deployments_campaign_idx
  ON public.organizer_deployments(campaign_id);

ALTER TABLE public.organizer_deployment_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org admins manage campaigns" ON public.organizer_deployment_assignments;
CREATE POLICY "org admins manage campaigns"
ON public.organizer_deployment_assignments
FOR ALL TO authenticated
USING (public.can_manage_organizer(auth.uid()))
WITH CHECK (public.can_manage_organizer(auth.uid()));

-- 3. Storage bucket for organizer file uploads (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('organizer-uploads', 'organizer-uploads', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies on storage.objects for the bucket.
-- Path convention: {deployment_id}/{block_id}/{uuid}.{ext}
-- Assignee may upload+read+delete within their own deployment.
-- Org admins (can_manage_organizer) may read+delete all.
DROP POLICY IF EXISTS "organizer uploads assignee read" ON storage.objects;
CREATE POLICY "organizer uploads assignee read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'organizer-uploads'
  AND EXISTS (
    SELECT 1 FROM public.organizer_deployments d
    WHERE d.id::text = split_part(name, '/', 1)
      AND (d.assignee_profile_id = auth.uid() OR public.can_manage_organizer(auth.uid()))
  )
);

DROP POLICY IF EXISTS "organizer uploads assignee write" ON storage.objects;
CREATE POLICY "organizer uploads assignee write"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'organizer-uploads'
  AND EXISTS (
    SELECT 1 FROM public.organizer_deployments d
    WHERE d.id::text = split_part(name, '/', 1)
      AND d.assignee_profile_id = auth.uid()
      AND d.status IN ('not_started','in_progress','returned')
  )
);

DROP POLICY IF EXISTS "organizer uploads delete own" ON storage.objects;
CREATE POLICY "organizer uploads delete own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'organizer-uploads'
  AND EXISTS (
    SELECT 1 FROM public.organizer_deployments d
    WHERE d.id::text = split_part(name, '/', 1)
      AND (
        (d.assignee_profile_id = auth.uid() AND d.status IN ('not_started','in_progress','returned'))
        OR public.can_manage_organizer(auth.uid())
      )
  )
);

-- 4. pg_cron for due-soon notifications
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule existing job (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('organizer-due-soon-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'organizer-due-soon-daily',
  '0 14 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--32ad53cf-7e33-44a8-9c04-082c1ea10491.lovable.app/api/public/organizer-due-soon-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $cron$
);
