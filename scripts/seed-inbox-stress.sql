-- Stress-test seed: 1,000 tasks + 200,000 task_messages.
-- USAGE (dev only — never run in prod):
--   psql -v project_id="'<uuid>'" -v entity_id="'<uuid>'" \
--        -v actor_id="'<uuid>'" -v assignee_id="'<uuid>'" -v reviewer_id="'<uuid>'" \
--        -f scripts/seed-inbox-stress.sql
--
-- The seed is idempotent on the marker column tasks.notes = 'STRESS_SEED'.
-- Re-running first deletes prior seed rows then re-inserts.

BEGIN;

DELETE FROM public.task_messages
 WHERE task_id IN (SELECT id FROM public.tasks WHERE notes = 'STRESS_SEED');
DELETE FROM public.tasks WHERE notes = 'STRESS_SEED';

-- 1k tasks: split assignee/reviewer across two seed users so both 'mine' scopes
-- are exercised.
INSERT INTO public.tasks (
  entity_id, project_id, title, status,
  assignee_id, reviewer_id, created_by, notes
)
SELECT
  :entity_id::uuid,
  :project_id::uuid,
  'Stress task #' || gs,
  'in_progress',
  CASE WHEN gs % 2 = 0 THEN :assignee_id::uuid ELSE :reviewer_id::uuid END,
  CASE WHEN gs % 2 = 0 THEN :reviewer_id::uuid ELSE :assignee_id::uuid END,
  :actor_id::uuid,
  'STRESS_SEED'
FROM generate_series(1, 1000) gs;

-- 200k messages, skewed: 80% land in the top 100 tasks (hot inbox).
WITH t AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn
    FROM public.tasks WHERE notes = 'STRESS_SEED'
)
INSERT INTO public.task_messages (task_id, author_id, body, created_at)
SELECT
  (SELECT id FROM t WHERE rn = (
    CASE WHEN random() < 0.8
         THEN 1 + (random() * 99)::int
         ELSE 1 + (random() * 999)::int END
  )),
  :actor_id::uuid,
  'msg ' || g,
  now() - (g || ' seconds')::interval
FROM generate_series(1, 200000) g;

COMMIT;

ANALYZE public.tasks;
ANALYZE public.task_messages;
