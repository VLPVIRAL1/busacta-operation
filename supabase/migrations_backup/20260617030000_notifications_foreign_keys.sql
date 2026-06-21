-- Fix: Notifications Hub failed with "Couldn't load this view".
--
-- The inbox query embeds related rows:
--   notifications.select("... firms(id,name,firm_identifier), projects(id,name,code)")
-- PostgREST resolves embeds via foreign keys, but the notifications table had
-- NO foreign keys at all, so it returned a "could not find a relationship"
-- error (PGRST200) and the whole view failed to load.
--
-- Add the missing FKs (ON DELETE SET NULL so deleting a firm/project/task never
-- orphans or blocks a notification). task_id is included for consistency/future
-- embeds even though the current query only embeds firms + projects.

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_firm_id_fkey
    FOREIGN KEY (firm_id) REFERENCES public.firms(id) ON DELETE SET NULL,
  ADD CONSTRAINT notifications_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD CONSTRAINT notifications_task_id_fkey
    FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;

-- Reload the PostgREST schema cache so the new relationships are usable immediately.
NOTIFY pgrst, 'reload schema';
