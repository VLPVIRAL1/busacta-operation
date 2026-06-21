
CREATE OR REPLACE FUNCTION public.inbox_summary(_scope text DEFAULT 'mine')
RETURNS TABLE (
  kind text,
  id uuid,
  title text,
  subtitle text,
  avatar_url text,
  avatar_user_id uuid,
  last_message_at timestamptz,
  last_message_preview text,
  unread int,
  created_at timestamptz,
  firm_id uuid,
  firm_name text,
  pipeline_stage text,
  assignee_id uuid,
  reviewer_id uuid,
  archived boolean,
  archived_at timestamptz,
  archived_auto boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _scope NOT IN ('mine','all') THEN
    _scope := 'mine';
  END IF;

  RETURN QUERY
  WITH
  my_threads AS (
    SELECT m.thread_id, m.last_read_at
      FROM public.chat_thread_members m
     WHERE m.user_id = _uid
  ),
  last_chat AS (
    SELECT DISTINCT ON (cm.thread_id)
           cm.thread_id, cm.created_at AS at, cm.body
      FROM public.chat_messages cm
      JOIN my_threads mt ON mt.thread_id = cm.thread_id
     WHERE cm.deleted_at IS NULL
     ORDER BY cm.thread_id, cm.created_at DESC
  ),
  thread_members AS (
    SELECT tm.thread_id, count(*)::int AS member_count
      FROM public.chat_thread_members tm
     WHERE tm.thread_id IN (SELECT thread_id FROM my_threads)
     GROUP BY tm.thread_id
  ),
  dm_partner AS (
    SELECT tm.thread_id, tm.user_id AS other_id
      FROM public.chat_thread_members tm
      JOIN public.chat_threads th ON th.id = tm.thread_id
     WHERE th.kind = 'dm'
       AND tm.user_id <> _uid
       AND tm.thread_id IN (SELECT thread_id FROM my_threads)
  ),
  chat_rows AS (
    SELECT
      t.kind::text                                          AS kind,
      t.id                                                  AS id,
      CASE
        WHEN t.kind = 'dm' THEN
          COALESCE(p.full_name, p.email, 'Direct message')
        ELSE COALESCE(t.name, 'Untitled group')
      END                                                   AS title,
      CASE
        WHEN t.kind = 'group' THEN
          (COALESCE(tmc.member_count, 0))::text || ' members'
        ELSE 'Direct message'
      END                                                   AS subtitle,
      COALESCE(p.avatar_url, t.avatar_url)                  AS avatar_url,
      CASE WHEN t.kind = 'dm' THEN dp.other_id ELSE NULL END AS avatar_user_id,
      lc.at                                                 AS last_message_at,
      lc.body                                               AS last_message_preview,
      CASE
        WHEN lc.at IS NULL THEN 0
        WHEN mt.last_read_at IS NULL THEN 1
        WHEN lc.at > mt.last_read_at THEN 1
        ELSE 0
      END                                                   AS unread,
      t.created_at                                          AS created_at,
      NULL::uuid                                            AS firm_id,
      NULL::text                                            AS firm_name,
      NULL::text                                            AS pipeline_stage,
      NULL::uuid                                            AS assignee_id,
      NULL::uuid                                            AS reviewer_id
    FROM public.chat_threads t
    JOIN my_threads mt    ON mt.thread_id = t.id
    LEFT JOIN thread_members tmc ON tmc.thread_id = t.id
    LEFT JOIN dm_partner dp ON dp.thread_id = t.id
    LEFT JOIN public.profiles p
           ON t.kind = 'dm' AND p.id = dp.other_id
    LEFT JOIN last_chat lc ON lc.thread_id = t.id
  ),
  visible_tasks AS (
    SELECT t.*
      FROM public.tasks t
     WHERE t.status <> 'complete'
       AND (
         _scope = 'all'
         OR t.assignee_id = _uid
         OR t.reviewer_id = _uid
         OR t.created_by  = _uid
         OR EXISTS (SELECT 1 FROM public.task_watchers w
                     WHERE w.task_id = t.id AND w.user_id = _uid)
         OR EXISTS (SELECT 1 FROM public.task_assignees a
                     WHERE a.task_id = t.id AND a.user_id = _uid)
       )
  ),
  last_task_msg AS (
    SELECT DISTINCT ON (tm.task_id)
           tm.task_id, tm.created_at AS at, tm.body
      FROM public.task_messages tm
      JOIN visible_tasks vt ON vt.id = tm.task_id
     WHERE tm.deleted_at IS NULL
     ORDER BY tm.task_id, tm.created_at DESC
  ),
  task_reads AS (
    SELECT mr.scope_id AS task_id, mr.last_read_at
      FROM public.message_reads mr
     WHERE mr.user_id = _uid AND mr.scope = 'task'
  ),
  task_rows AS (
    SELECT
      'task'::text                                          AS kind,
      vt.id                                                 AS id,
      vt.title                                              AS title,
      COALESCE(
        nullif(concat_ws(' · ', f.name, pr.name), ''),
        'Task'
      )                                                     AS subtitle,
      NULL::text                                            AS avatar_url,
      NULL::uuid                                            AS avatar_user_id,
      ltm.at                                                AS last_message_at,
      ltm.body                                              AS last_message_preview,
      CASE
        WHEN ltm.at IS NULL THEN 0
        WHEN tr.last_read_at IS NULL THEN 1
        WHEN ltm.at > tr.last_read_at THEN 1
        ELSE 0
      END                                                   AS unread,
      vt.created_at                                         AS created_at,
      pr.firm_id                                            AS firm_id,
      f.name                                                AS firm_name,
      vt.pipeline_stage::text                               AS pipeline_stage,
      vt.assignee_id                                        AS assignee_id,
      vt.reviewer_id                                        AS reviewer_id
    FROM visible_tasks vt
    LEFT JOIN public.client_entities ce ON ce.id = vt.entity_id
    LEFT JOIN public.projects pr        ON pr.id = COALESCE(vt.project_id, ce.project_id)
    LEFT JOIN public.firms f            ON f.id = pr.firm_id
    LEFT JOIN last_task_msg ltm         ON ltm.task_id = vt.id
    LEFT JOIN task_reads tr             ON tr.task_id = vt.id
  ),
  unioned AS (
    SELECT * FROM chat_rows
    UNION ALL
    SELECT * FROM task_rows
  ),
  arch AS (
    SELECT a.kind, a.target_id, a.archived_at, a.auto
      FROM public.chat_archive_state a
     WHERE a.user_id = _uid
  )
  SELECT
    u.kind,
    u.id,
    u.title,
    u.subtitle,
    u.avatar_url,
    u.avatar_user_id,
    u.last_message_at,
    u.last_message_preview,
    u.unread,
    u.created_at,
    u.firm_id,
    u.firm_name,
    u.pipeline_stage,
    u.assignee_id,
    u.reviewer_id,
    (a.target_id IS NOT NULL) AS archived,
    a.archived_at             AS archived_at,
    COALESCE(a.auto, false)   AS archived_auto
  FROM unioned u
  LEFT JOIN arch a ON a.kind = u.kind AND a.target_id = u.id;
END $$;

GRANT EXECUTE ON FUNCTION public.inbox_summary(text) TO authenticated;
