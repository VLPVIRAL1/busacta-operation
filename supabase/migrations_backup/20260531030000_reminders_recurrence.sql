-- Personal reminders: recurrence support
-- Adds an optional recurrence cadence. When the client marks a recurring
-- reminder complete, it creates the next occurrence (handled client-side).

ALTER TABLE public.personal_reminders
  ADD COLUMN IF NOT EXISTS recurrence text
    CHECK (recurrence IN ('daily', 'weekly', 'monthly'));
