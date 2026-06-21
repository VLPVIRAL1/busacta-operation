-- Allow organizer_response_history.changed_by to be NULL.
--
-- organizer_responses.answered_by is nullable (anonymous public link saves
-- pass NULL when the deployment has no assignee_profile_id), but the history
-- trigger copies NEW.answered_by into organizer_response_history.changed_by.
-- The NOT NULL constraint on changed_by therefore caused every anon save to
-- fail with: "null value in column \"changed_by\" of relation
-- \"organizer_response_history\" violates not-null constraint".
--
-- The application read path (src/lib/organizer/history.server.ts) already
-- treats changed_by as `string | null`, so loosening the constraint is safe.

ALTER TABLE public.organizer_response_history
  ALTER COLUMN changed_by DROP NOT NULL;
