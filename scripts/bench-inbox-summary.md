# inbox_summary benchmark notes

Run sequence:

1. Apply migration `20260517093838_*` (adds open-task indexes on assignee/reviewer/created_by).
2. `psql -v project_id=... -v entity_id=... -v actor_id=... -v assignee_id=... -v reviewer_id=... -f scripts/seed-inbox-stress.sql`
3. `psql -v uid="'<assignee-uuid>'" -f scripts/bench-inbox-summary.sql`

Targets (dev hardware):

| scope | p50     | p95     |
| ----- | ------- | ------- |
| mine  | < 120ms | < 250ms |
| all   | < 350ms | < 600ms |

Indexes the RPC relies on (all confirmed present after the migration):

- `idx_task_messages_task_created (task_id, created_at)` — DISTINCT ON last message
- `idx_chat_messages_thread       (thread_id, created_at DESC)` — same for chats
- `idx_task_watchers_user`, `idx_task_assignees_user`
- `idx_tasks_{assignee,reviewer,created_by}_open` (partial, status<>complete)

If p95 regresses, capture `EXPLAIN (ANALYZE, BUFFERS)` from the bench script
and compare buffer reads on the `task_messages` DISTINCT ON node — that is the
hottest subplan for the 200k-message scenario.
