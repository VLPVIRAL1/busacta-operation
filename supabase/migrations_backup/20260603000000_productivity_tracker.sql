CREATE TABLE IF NOT EXISTS public.productivity_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  task_id     UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.productivity_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_productivity_sessions_user_started
  ON public.productivity_sessions (user_id, started_at DESC);

CREATE POLICY "productivity_sessions_select"
  ON public.productivity_sessions FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "productivity_sessions_insert"
  ON public.productivity_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "productivity_sessions_update"
  ON public.productivity_sessions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              UUID NOT NULL REFERENCES public.productivity_sessions(id) ON DELETE CASCADE,
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  screenshot_path         TEXT,
  keystrokes_count        INTEGER NOT NULL DEFAULT 0 CHECK (keystrokes_count >= 0),
  mouse_clicks_count      INTEGER NOT NULL DEFAULT 0 CHECK (mouse_clicks_count >= 0),
  active_window_title     TEXT,
  active_application_name TEXT,
  activity_percentage     NUMERIC(5,2) NOT NULL DEFAULT 0
                            CHECK (activity_percentage >= 0 AND activity_percentage <= 100),
  interval_start          TIMESTAMPTZ NOT NULL,
  interval_end            TIMESTAMPTZ NOT NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_activity_interval_order CHECK (interval_end > interval_start)
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_interval
  ON public.activity_logs (user_id, interval_start DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_session_interval
  ON public.activity_logs (session_id, interval_start DESC);

CREATE POLICY "activity_logs_select"
  ON public.activity_logs FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'productivity-screenshots',
  'productivity-screenshots',
  false,
  3145728,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "productivity_screenshots_select_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'productivity-screenshots'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'super_admin')
      OR public.has_role(auth.uid(), 'hr_manager')
    )
  );
