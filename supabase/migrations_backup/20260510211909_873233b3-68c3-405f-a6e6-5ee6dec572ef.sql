CREATE TABLE public.login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text,
  session_id text,
  ip_address text,
  user_agent text,
  device_type text,
  device_name text,
  browser text,
  browser_version text,
  os text,
  os_version text,
  country text,
  region text,
  city text,
  timezone text,
  language text,
  screen_resolution text,
  event_type text NOT NULL DEFAULT 'login',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_login_events_user_id ON public.login_events(user_id);
CREATE INDEX idx_login_events_created_at ON public.login_events(created_at DESC);

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own login events"
  ON public.login_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users read own login events"
  ON public.login_events FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  );

CREATE POLICY "Admins delete login events"
  ON public.login_events FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));