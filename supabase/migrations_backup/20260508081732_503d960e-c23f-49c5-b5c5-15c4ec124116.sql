
CREATE TABLE IF NOT EXISTS public.app_settings (
  id text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read settings" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins write settings" ON public.app_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.app_settings (id, value) VALUES
  ('branding', '{"name":"BusAcTa Advisors","tagline":"Offshore Tax Operations","logo_url":null,"mark":"BA"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('branding','branding', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Branding public read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'branding');
CREATE POLICY "Admins manage branding files" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(),'admin'));
