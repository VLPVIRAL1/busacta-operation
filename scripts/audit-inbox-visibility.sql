-- Communication Hub visibility audit.
-- Run as service role / db owner with :'uid' bound to a user UUID.
--   psql -v uid="'<user-uuid>'" -f scripts/audit-inbox-visibility.sql
--
-- Expected matrix (scope=mine):
--   task_rows      -> only tasks where uid is assignee/reviewer/creator/watcher/assignee_link
--   chat_rows (dm) -> only threads where uid is a chat_thread_members row
--   chat_rows (gp) -> same as dm
-- Expected matrix (scope=all):
--   task_rows      -> every task NOT complete that RLS allows uid to read
--   chat_rows      -> unchanged (always member-gated)

\echo === scope=mine ===
SELECT kind, count(*) FROM inbox_summary('mine') GROUP BY kind ORDER BY kind;

\echo === scope=all ===
SELECT kind, count(*) FROM inbox_summary('all') GROUP BY kind ORDER BY kind;

\echo === tasks visible in mine but uid has no link (should be 0) ===
WITH mine AS (SELECT id FROM inbox_summary('mine') WHERE kind='task')
SELECT t.id
  FROM public.tasks t
  JOIN mine m ON m.id = t.id
 WHERE NOT (
   t.assignee_id = :uid::uuid
   OR t.reviewer_id = :uid::uuid
   OR t.created_by  = :uid::uuid
   OR EXISTS (SELECT 1 FROM public.task_watchers w  WHERE w.task_id = t.id AND w.user_id = :uid::uuid)
   OR EXISTS (SELECT 1 FROM public.task_assignees a WHERE a.task_id = t.id AND a.user_id = :uid::uuid)
 );

\echo === chat rows where uid is not a member (should be 0) ===
WITH mine AS (SELECT id FROM inbox_summary('mine') WHERE kind IN ('dm','group'))
SELECT m.id FROM mine m
 WHERE NOT EXISTS (
   SELECT 1 FROM public.chat_thread_members tm
    WHERE tm.thread_id = m.id AND tm.user_id = :uid::uuid
 );
