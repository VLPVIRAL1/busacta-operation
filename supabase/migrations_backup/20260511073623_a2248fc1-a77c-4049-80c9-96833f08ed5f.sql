-- Client error log
CREATE TABLE IF NOT EXISTS public.client_error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role text,
  route text,
  name text,
  message text,
  stack text,
  component_stack text,
  ua text,
  extra jsonb
);

CREATE INDEX IF NOT EXISTS client_error_log_created_at_idx ON public.client_error_log (created_at DESC);
CREATE INDEX IF NOT EXISTS client_error_log_route_idx ON public.client_error_log (route);

ALTER TABLE public.client_error_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users insert own error rows"
  ON public.client_error_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Admins read error log"
  ON public.client_error_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins delete error log"
  ON public.client_error_log FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

-- Expose existing role lookup as a stable RPC for client nav gating
CREATE OR REPLACE FUNCTION public.current_user_app_role()
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role();
$$;

GRANT EXECUTE ON FUNCTION public.current_user_app_role() TO authenticated;