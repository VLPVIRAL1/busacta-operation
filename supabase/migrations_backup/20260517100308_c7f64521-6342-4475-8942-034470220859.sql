
DROP FUNCTION IF EXISTS public.inbox_summary(text);

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL CHECK (scope IN ('task','chat')),
  message_id  uuid NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       text NOT NULL CHECK (length(emoji) BETWEEN 1 AND 16),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON public.message_reactions(scope, message_id);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions_select" ON public.message_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "reactions_insert_own" ON public.message_reactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "reactions_delete_own" ON public.message_reactions FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.message_stars (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope       text NOT NULL CHECK (scope IN ('task','chat')),
  message_id  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_message_stars_user ON public.message_stars(user_id, created_at DESC);
ALTER TABLE public.message_stars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stars_own" ON public.message_stars FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.message_snoozes (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope         text NOT NULL CHECK (scope IN ('task','dm','group')),
  target_id     uuid NOT NULL,
  snooze_until  timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope, target_id)
);
CREATE INDEX IF NOT EXISTS idx_snoozes_until ON public.message_snoozes(user_id, snooze_until);
ALTER TABLE public.message_snoozes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snoozes_own" ON public.message_snoozes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.inbox_unread_overrides (
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope          text NOT NULL CHECK (scope IN ('task','dm','group')),
  target_id      uuid NOT NULL,
  forced_unread  boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope, target_id)
);
ALTER TABLE public.inbox_unread_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "unread_overrides_own" ON public.inbox_unread_overrides FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.notification_prefs (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope       text NOT NULL CHECK (scope IN ('task','dm','group')),
  target_id   uuid NOT NULL,
  level       text NOT NULL DEFAULT 'all' CHECK (level IN ('all','mentions','muted')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope, target_id)
);
ALTER TABLE public.notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_prefs_own" ON public.notification_prefs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.message_reads_detail (
  scope       text NOT NULL CHECK (scope IN ('task','chat')),
  message_id  uuid NOT NULL,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reads_detail_msg ON public.message_reads_detail(scope, message_id);
ALTER TABLE public.message_reads_detail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reads_detail_select" ON public.message_reads_detail FOR SELECT TO authenticated USING (true);
CREATE POLICY "reads_detail_insert_own" ON public.message_reads_detail FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.saved_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  filters     jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_views_user ON public.saved_views(user_id, sort_order);
ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_views_own" ON public.saved_views FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.quick_replies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  firm_id     uuid REFERENCES public.firms(id) ON DELETE CASCADE,
  label       text NOT NULL,
  body        text NOT NULL,
  scope_kind  text NOT NULL DEFAULT 'any' CHECK (scope_kind IN ('any','task','dm','group')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR firm_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_quick_replies_user ON public.quick_replies(user_id);
CREATE INDEX IF NOT EXISTS idx_quick_replies_firm ON public.quick_replies(firm_id);
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quick_replies_select" ON public.quick_replies FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (firm_id IS NOT NULL AND public.user_can_access_firm(firm_id)));
CREATE POLICY "quick_replies_personal_write" ON public.quick_replies FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND firm_id IS NULL);
CREATE POLICY "quick_replies_firm_admin_write" ON public.quick_replies FOR ALL TO authenticated
  USING (firm_id IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')))
  WITH CHECK (firm_id IS NOT NULL AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')));

CREATE TABLE IF NOT EXISTS public.chat_presence (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL DEFAULT 'online' CHECK (status IN ('online','away','offline'))
);
ALTER TABLE public.chat_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presence_select_all" ON public.chat_presence FOR SELECT TO authenticated USING (true);
CREATE POLICY "presence_write_own" ON public.chat_presence FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.task_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES public.task_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_msg_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_messages_client_msg
  ON public.task_messages(author_id, client_msg_id) WHERE client_msg_id IS NOT NULL;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_msg_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_client_msg
  ON public.chat_messages(author_id, client_msg_id) WHERE client_msg_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.toggle_reaction(_scope text, _message_id uuid, _emoji text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _existing uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _scope NOT IN ('task','chat') THEN RAISE EXCEPTION 'invalid_scope'; END IF;
  SELECT id INTO _existing FROM public.message_reactions
    WHERE scope=_scope AND message_id=_message_id AND user_id=_uid AND emoji=_emoji;
  IF _existing IS NOT NULL THEN
    DELETE FROM public.message_reactions WHERE id=_existing; RETURN false;
  END IF;
  INSERT INTO public.message_reactions(scope, message_id, user_id, emoji)
    VALUES (_scope, _message_id, _uid, _emoji);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.toggle_star(_scope text, _message_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _existing boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _scope NOT IN ('task','chat') THEN RAISE EXCEPTION 'invalid_scope'; END IF;
  SELECT true INTO _existing FROM public.message_stars WHERE user_id=_uid AND message_id=_message_id;
  IF _existing THEN
    DELETE FROM public.message_stars WHERE user_id=_uid AND message_id=_message_id; RETURN false;
  END IF;
  INSERT INTO public.message_stars(user_id, scope, message_id) VALUES (_uid, _scope, _message_id);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.snooze_thread(_scope text, _target_id uuid, _until timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _scope NOT IN ('task','dm','group') THEN RAISE EXCEPTION 'invalid_scope'; END IF;
  IF _until <= now() THEN RAISE EXCEPTION 'snooze_in_past'; END IF;
  INSERT INTO public.message_snoozes(user_id, scope, target_id, snooze_until)
    VALUES (_uid, _scope, _target_id, _until)
    ON CONFLICT (user_id, scope, target_id) DO UPDATE SET snooze_until = EXCLUDED.snooze_until;
END $$;

CREATE OR REPLACE FUNCTION public.unsnooze_thread(_scope text, _target_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.message_snoozes WHERE user_id = auth.uid() AND scope = _scope AND target_id = _target_id;
END $$;

CREATE OR REPLACE FUNCTION public.set_notification_pref(_scope text, _target_id uuid, _level text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _level NOT IN ('all','mentions','muted') THEN RAISE EXCEPTION 'invalid_level'; END IF;
  IF _level = 'all' THEN
    DELETE FROM public.notification_prefs WHERE user_id=_uid AND scope=_scope AND target_id=_target_id;
  ELSE
    INSERT INTO public.notification_prefs(user_id, scope, target_id, level)
      VALUES (_uid, _scope, _target_id, _level)
      ON CONFLICT (user_id, scope, target_id) DO UPDATE SET level = EXCLUDED.level;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mark_unread(_scope text, _target_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  INSERT INTO public.inbox_unread_overrides(user_id, scope, target_id, forced_unread)
    VALUES (_uid, _scope, _target_id, true)
    ON CONFLICT (user_id, scope, target_id) DO UPDATE SET forced_unread = true;
END $$;

CREATE OR REPLACE FUNCTION public.clear_unread_override(_scope text, _target_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.inbox_unread_overrides WHERE user_id = auth.uid() AND scope = _scope AND target_id = _target_id;
END $$;

CREATE OR REPLACE FUNCTION public.record_message_seen(_scope text, _message_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.message_reads_detail(scope, message_id, user_id)
    VALUES (_scope, _message_id, _uid)
    ON CONFLICT (scope, message_id, user_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.presence_heartbeat(_status text DEFAULT 'online')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  IF _status NOT IN ('online','away','offline') THEN _status := 'online'; END IF;
  INSERT INTO public.chat_presence(user_id, last_seen_at, status)
    VALUES (_uid, now(), _status)
    ON CONFLICT (user_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at, status = EXCLUDED.status;
END $$;

CREATE OR REPLACE FUNCTION public.inbox_summary(_scope text DEFAULT 'mine')
RETURNS TABLE (
  kind text, id uuid, title text, subtitle text,
  avatar_url text, avatar_user_id uuid,
  last_message_at timestamptz, last_message_preview text,
  unread integer, created_at timestamptz,
  firm_id uuid, firm_name text, pipeline_stage text,
  assignee_id uuid, reviewer_id uuid,
  archived boolean, archived_at timestamptz, archived_auto boolean,
  snoozed_until timestamptz, notification_level text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _scope NOT IN ('mine','all') THEN _scope := 'mine'; END IF;

  RETURN QUERY
  WITH
  my_threads AS (SELECT m.thread_id, m.last_read_at FROM public.chat_thread_members m WHERE m.user_id = _uid),
  last_chat AS (
    SELECT DISTINCT ON (cm.thread_id) cm.thread_id, cm.created_at AS at, cm.body
      FROM public.chat_messages cm
      JOIN my_threads mt ON mt.thread_id = cm.thread_id
     WHERE cm.deleted_at IS NULL
     ORDER BY cm.thread_id, cm.created_at DESC
  ),
  thread_members AS (
    SELECT tm.thread_id, count(*)::int AS member_count FROM public.chat_thread_members tm
     WHERE tm.thread_id IN (SELECT thread_id FROM my_threads) GROUP BY tm.thread_id
  ),
  dm_partner AS (
    SELECT tm.thread_id, tm.user_id AS other_id
      FROM public.chat_thread_members tm
      JOIN public.chat_threads th ON th.id = tm.thread_id
     WHERE th.kind = 'dm' AND tm.user_id <> _uid AND tm.thread_id IN (SELECT thread_id FROM my_threads)
  ),
  chat_rows AS (
    SELECT t.kind::text AS kind, t.id,
      CASE WHEN t.kind='dm' THEN COALESCE(p.full_name, p.email, 'Direct message')
           ELSE COALESCE(t.name, 'Untitled group') END AS title,
      CASE WHEN t.kind='group' THEN (COALESCE(tmc.member_count,0))::text || ' members'
           ELSE 'Direct message' END AS subtitle,
      COALESCE(p.avatar_url, t.avatar_url) AS avatar_url,
      CASE WHEN t.kind='dm' THEN dp.other_id ELSE NULL END AS avatar_user_id,
      lc.at AS last_message_at, lc.body AS last_message_preview,
      CASE WHEN lc.at IS NULL THEN 0 WHEN mt.last_read_at IS NULL THEN 1 WHEN lc.at > mt.last_read_at THEN 1 ELSE 0 END AS unread,
      t.created_at,
      NULL::uuid AS firm_id, NULL::text AS firm_name, NULL::text AS pipeline_stage,
      NULL::uuid AS assignee_id, NULL::uuid AS reviewer_id
    FROM public.chat_threads t
    JOIN my_threads mt ON mt.thread_id = t.id
    LEFT JOIN thread_members tmc ON tmc.thread_id = t.id
    LEFT JOIN dm_partner dp ON dp.thread_id = t.id
    LEFT JOIN public.profiles p ON t.kind='dm' AND p.id = dp.other_id
    LEFT JOIN last_chat lc ON lc.thread_id = t.id
  ),
  visible_tasks AS (
    SELECT t.* FROM public.tasks t
     WHERE t.status <> 'complete'
       AND (
         _scope='all' OR t.assignee_id = _uid OR t.reviewer_id = _uid OR t.created_by = _uid
         OR EXISTS (SELECT 1 FROM public.task_watchers w WHERE w.task_id=t.id AND w.user_id=_uid)
         OR EXISTS (SELECT 1 FROM public.task_assignees a WHERE a.task_id=t.id AND a.user_id=_uid)
       )
  ),
  last_task_msg AS (
    SELECT DISTINCT ON (tm.task_id) tm.task_id, tm.created_at AS at, tm.body
      FROM public.task_messages tm
      JOIN visible_tasks vt ON vt.id = tm.task_id
     WHERE tm.deleted_at IS NULL
     ORDER BY tm.task_id, tm.created_at DESC
  ),
  task_reads AS (
    SELECT mr.scope_id AS task_id, mr.last_read_at FROM public.message_reads mr WHERE mr.user_id = _uid AND mr.scope = 'task'
  ),
  task_rows AS (
    SELECT 'task'::text AS kind, vt.id, vt.title AS title,
      COALESCE(nullif(concat_ws(' · ', f.name, pr.name), ''), 'Task') AS subtitle,
      NULL::text AS avatar_url, NULL::uuid AS avatar_user_id,
      ltm.at AS last_message_at, ltm.body AS last_message_preview,
      CASE WHEN ltm.at IS NULL THEN 0 WHEN tr.last_read_at IS NULL THEN 1 WHEN ltm.at > tr.last_read_at THEN 1 ELSE 0 END AS unread,
      vt.created_at,
      pr.firm_id AS firm_id, f.name AS firm_name,
      vt.pipeline_stage::text AS pipeline_stage,
      vt.assignee_id, vt.reviewer_id
    FROM visible_tasks vt
    LEFT JOIN public.client_entities ce ON ce.id = vt.entity_id
    LEFT JOIN public.projects pr ON pr.id = COALESCE(vt.project_id, ce.project_id)
    LEFT JOIN public.firms f ON f.id = pr.firm_id
    LEFT JOIN last_task_msg ltm ON ltm.task_id = vt.id
    LEFT JOIN task_reads tr ON tr.task_id = vt.id
  ),
  unioned AS (SELECT * FROM chat_rows UNION ALL SELECT * FROM task_rows),
  arch AS (SELECT a.kind, a.target_id, a.archived_at, a.auto FROM public.chat_archive_state a WHERE a.user_id = _uid),
  snz AS (SELECT s.scope, s.target_id, s.snooze_until FROM public.message_snoozes s WHERE s.user_id = _uid),
  ovr AS (SELECT o.scope, o.target_id, o.forced_unread FROM public.inbox_unread_overrides o WHERE o.user_id = _uid),
  np AS (SELECT n.scope, n.target_id, n.level FROM public.notification_prefs n WHERE n.user_id = _uid)
  SELECT
    u.kind, u.id, u.title, u.subtitle, u.avatar_url, u.avatar_user_id,
    u.last_message_at, u.last_message_preview,
    CASE
      WHEN COALESCE(np.level,'all') = 'muted' THEN 0
      WHEN COALESCE(ovr.forced_unread,false) THEN GREATEST(u.unread, 1)
      ELSE u.unread
    END AS unread,
    u.created_at, u.firm_id, u.firm_name, u.pipeline_stage, u.assignee_id, u.reviewer_id,
    (a.target_id IS NOT NULL) AS archived,
    a.archived_at AS archived_at,
    COALESCE(a.auto,false) AS archived_auto,
    CASE WHEN snz.snooze_until > now() THEN snz.snooze_until ELSE NULL END AS snoozed_until,
    COALESCE(np.level, 'all') AS notification_level
  FROM unioned u
  LEFT JOIN arch a ON a.kind = u.kind AND a.target_id = u.id
  LEFT JOIN snz ON snz.scope = (CASE WHEN u.kind='task' THEN 'task' ELSE u.kind END) AND snz.target_id = u.id
  LEFT JOIN ovr ON ovr.scope = (CASE WHEN u.kind='task' THEN 'task' ELSE u.kind END) AND ovr.target_id = u.id
  LEFT JOIN np  ON np.scope  = (CASE WHEN u.kind='task' THEN 'task' ELSE u.kind END) AND np.target_id  = u.id;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads_detail;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_messages;
