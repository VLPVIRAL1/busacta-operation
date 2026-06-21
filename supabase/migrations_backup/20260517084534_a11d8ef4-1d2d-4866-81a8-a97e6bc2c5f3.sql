
-- 1) Per-user archive state
CREATE TABLE IF NOT EXISTS public.chat_archive_state (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  kind text NOT NULL CHECK (kind IN ('dm','group','task')),
  target_id uuid NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  auto boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, kind, target_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_archive_state_user ON public.chat_archive_state(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_archive_state_target ON public.chat_archive_state(kind, target_id);

ALTER TABLE public.chat_archive_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own archive state"
  ON public.chat_archive_state FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users insert own archive state"
  ON public.chat_archive_state FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own archive state"
  ON public.chat_archive_state FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 2) Toggle RPC
CREATE OR REPLACE FUNCTION public.toggle_chat_archive(_kind text, _target_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _exists boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _kind NOT IN ('dm','group','task') THEN RAISE EXCEPTION 'invalid_kind'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.chat_archive_state
    WHERE user_id = _uid AND kind = _kind AND target_id = _target_id
  ) INTO _exists;

  IF _exists THEN
    DELETE FROM public.chat_archive_state
      WHERE user_id = _uid AND kind = _kind AND target_id = _target_id;
    RETURN false;
  ELSE
    INSERT INTO public.chat_archive_state(user_id, kind, target_id, auto)
    VALUES (_uid, _kind, _target_id, false);
    RETURN true;
  END IF;
END $$;

-- 3) Auto-unarchive triggers — when a new message arrives, drop archive rows
-- for all current members so the thread resurfaces in everyone's inbox.
CREATE OR REPLACE FUNCTION public.auto_unarchive_chat_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.chat_archive_state a
  USING public.chat_thread_members m
  WHERE m.thread_id = NEW.thread_id
    AND a.user_id = m.user_id
    AND a.kind IN ('dm','group')
    AND a.target_id = NEW.thread_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_chat_messages_auto_unarchive ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_auto_unarchive
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.auto_unarchive_chat_message();

CREATE OR REPLACE FUNCTION public.auto_unarchive_task_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.chat_archive_state
   WHERE kind = 'task' AND target_id = NEW.task_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_task_messages_auto_unarchive ON public.task_messages;
CREATE TRIGGER trg_task_messages_auto_unarchive
  AFTER INSERT ON public.task_messages
  FOR EACH ROW EXECUTE FUNCTION public.auto_unarchive_task_message();

-- 4) User preference columns on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS comm_auto_archive_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS comm_auto_archive_days integer NOT NULL DEFAULT 60
    CHECK (comm_auto_archive_days IN (7,14,30,60,90,180));

-- 5) Scheduled auto-archive function (callable + cron-friendly)
CREATE OR REPLACE FUNCTION public.run_chat_auto_archive()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _inserted int := 0;
BEGIN
  -- Chat threads (dm/group)
  WITH last_msg AS (
    SELECT thread_id, MAX(created_at) AS at FROM public.chat_messages
    WHERE deleted_at IS NULL GROUP BY thread_id
  ),
  candidates AS (
    SELECT m.user_id, t.kind, t.id AS target_id
      FROM public.chat_thread_members m
      JOIN public.chat_threads t ON t.id = m.thread_id
      JOIN public.profiles p ON p.id = m.user_id
      LEFT JOIN last_msg lm ON lm.thread_id = t.id
     WHERE p.comm_auto_archive_enabled = true
       AND COALESCE(lm.at, t.created_at) < (now() - make_interval(days => p.comm_auto_archive_days))
  ),
  ins AS (
    INSERT INTO public.chat_archive_state(user_id, kind, target_id, auto)
    SELECT user_id, kind, target_id, true FROM candidates
    ON CONFLICT (user_id, kind, target_id) DO NOTHING
    RETURNING 1
  )
  SELECT _inserted + count(*) INTO _inserted FROM ins;

  -- Task threads — archive for task assignees & reviewers
  WITH last_tmsg AS (
    SELECT task_id, MAX(created_at) AS at FROM public.task_messages
    WHERE deleted_at IS NULL GROUP BY task_id
  ),
  candidates AS (
    SELECT a.user_id, 'task'::text AS kind, t.id AS target_id
      FROM public.task_assignees a
      JOIN public.tasks t ON t.id = a.task_id
      JOIN public.profiles p ON p.id = a.user_id
      LEFT JOIN last_tmsg lm ON lm.task_id = t.id
     WHERE p.comm_auto_archive_enabled = true
       AND t.status <> 'complete'
       AND COALESCE(lm.at, t.created_at) < (now() - make_interval(days => p.comm_auto_archive_days))
  ),
  ins AS (
    INSERT INTO public.chat_archive_state(user_id, kind, target_id, auto)
    SELECT user_id, kind, target_id, true FROM candidates
    ON CONFLICT (user_id, kind, target_id) DO NOTHING
    RETURNING 1
  )
  SELECT _inserted + count(*) INTO _inserted FROM ins;

  RETURN _inserted;
END $$;

-- 6) Schedule via pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  PERFORM cron.unschedule('chat-auto-archive-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'chat-auto-archive-daily',
  '0 3 * * *',
  $$ SELECT public.run_chat_auto_archive(); $$
);
