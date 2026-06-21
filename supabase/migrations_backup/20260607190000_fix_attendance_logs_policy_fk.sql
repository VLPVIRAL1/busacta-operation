-- attendance_logs.applied_settings_id had no ON DELETE clause (defaults to RESTRICT),
-- which blocks deleting a company_hr_settings row that any log row references.
-- Re-add the FK with ON DELETE SET NULL so policy deletion is unblocked.

ALTER TABLE public.attendance_logs
  DROP CONSTRAINT IF EXISTS attendance_logs_applied_settings_id_fkey;

ALTER TABLE public.attendance_logs
  ADD CONSTRAINT attendance_logs_applied_settings_id_fkey
    FOREIGN KEY (applied_settings_id)
    REFERENCES public.company_hr_settings(id)
    ON DELETE SET NULL;
