CREATE TABLE public.user_client_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stream text NOT NULL CHECK (stream IN ('cpa','direct')),
  client_id uuid NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  sort_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, stream, client_id)
);

CREATE INDEX idx_user_client_prefs_lookup
  ON public.user_client_prefs (user_id, stream, pinned DESC, sort_index ASC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_client_prefs TO authenticated;
GRANT ALL ON public.user_client_prefs TO service_role;

ALTER TABLE public.user_client_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own client prefs"
  ON public.user_client_prefs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own client prefs"
  ON public.user_client_prefs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own client prefs"
  ON public.user_client_prefs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own client prefs"
  ON public.user_client_prefs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_user_client_prefs_updated_at
  BEFORE UPDATE ON public.user_client_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();