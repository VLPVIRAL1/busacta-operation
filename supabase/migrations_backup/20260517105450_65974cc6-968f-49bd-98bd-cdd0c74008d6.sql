
CREATE TABLE IF NOT EXISTS public.thread_notification_prefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  thread_kind text NOT NULL CHECK (thread_kind IN ('chat','task','dm','group')),
  thread_id uuid NOT NULL,
  level text NOT NULL DEFAULT 'all' CHECK (level IN ('all','mentions','none')),
  muted_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, thread_kind, thread_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_prefs_user
  ON public.thread_notification_prefs(user_id);

ALTER TABLE public.thread_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thread_prefs_select_own"
  ON public.thread_notification_prefs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "thread_prefs_insert_own"
  ON public.thread_notification_prefs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "thread_prefs_update_own"
  ON public.thread_notification_prefs FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "thread_prefs_delete_own"
  ON public.thread_notification_prefs FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Helper RPC: read or default
CREATE OR REPLACE FUNCTION public.get_thread_pref(_kind text, _thread_id uuid)
RETURNS TABLE (level text, muted_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.level, p.muted_until
  FROM public.thread_notification_prefs p
  WHERE p.user_id = auth.uid()
    AND p.thread_kind = _kind
    AND p.thread_id = _thread_id;
$$;

-- Helper RPC: upsert
CREATE OR REPLACE FUNCTION public.set_thread_pref(
  _kind text,
  _thread_id uuid,
  _level text,
  _muted_until timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _kind NOT IN ('chat','task','dm','group') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  IF _level NOT IN ('all','mentions','none') THEN RAISE EXCEPTION 'invalid_level'; END IF;
  INSERT INTO public.thread_notification_prefs(user_id, thread_kind, thread_id, level, muted_until, updated_at)
    VALUES (_uid, _kind, _thread_id, _level, _muted_until, now())
    ON CONFLICT (user_id, thread_kind, thread_id)
    DO UPDATE SET level = EXCLUDED.level, muted_until = EXCLUDED.muted_until, updated_at = now();
END $$;
