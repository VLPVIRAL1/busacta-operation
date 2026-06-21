-- Fix: "record \"old\" has no field \"deleted_at\"" thrown on every task UPDATE.
--
-- The original SharePoint archive trigger (20260613000003) assumed tasks used a
-- soft-delete `deleted_at` column. That column was never added — tasks are
-- HARD-deleted (see src/routes/ops/pipeline.tsx). Because the trigger fired
-- AFTER UPDATE and referenced OLD.deleted_at / NEW.deleted_at, every edit to a
-- task aborted with a missing-field error.
--
-- Re-point the archive job to fire BEFORE DELETE (the only moment a task folder
-- should be archived under a hard-delete model) and capture project_id +
-- sharepoint_folder_id into the job payload, since the task row no longer exists
-- by the time the background worker processes the job.

CREATE OR REPLACE FUNCTION public.enqueue_sharepoint_archive_task_folder()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_firm_id uuid;
BEGIN
  -- Only archive if a SharePoint folder was ever created for this task.
  IF OLD.sharepoint_folder_id IS NULL THEN RETURN OLD; END IF;

  SELECT firm_id INTO v_firm_id FROM public.projects WHERE id = OLD.project_id;

  INSERT INTO public.sharepoint_sync_jobs (
    job_type, firm_id, payload, status, correlation_id, attempts, next_run_at
  ) VALUES (
    'archive_task_folder',
    v_firm_id,
    jsonb_build_object(
      'task_id', OLD.id,
      'project_id', OLD.project_id,
      'sharepoint_folder_id', OLD.sharepoint_folder_id
    ),
    'queued',
    'archive-task:' || OLD.id::text,
    0,
    now()
  )
  ON CONFLICT (correlation_id) DO UPDATE
    SET status = 'queued', attempts = 0, next_run_at = now();

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_archive_sharepoint ON public.tasks;
CREATE TRIGGER trg_tasks_archive_sharepoint
  BEFORE DELETE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_sharepoint_archive_task_folder();
