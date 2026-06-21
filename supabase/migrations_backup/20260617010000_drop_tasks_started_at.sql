-- Remove the duplicate task "Started" date.
--
-- The Task View header (and edit sheet) showed BOTH "Start" (tasks.start_date,
-- auto-populated from the project creation date) and "Started" (tasks.started_at).
-- The two were redundant. We keep start_date and drop started_at.
--
-- No DB views, functions, or triggers referenced tasks.started_at (verified),
-- and all time-tracking "started_at" usage lives on time_logs / productivity_
-- sessions, not tasks — so this drop is isolated to the task date column.

ALTER TABLE public.tasks DROP COLUMN IF EXISTS started_at;
