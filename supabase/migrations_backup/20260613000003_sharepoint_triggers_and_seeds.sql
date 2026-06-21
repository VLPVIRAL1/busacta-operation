-- SharePoint: task deletion trigger + global subfolder seed data.
-- Runs after 20260613000000_sharepoint_integration.sql.

-- 1. Make task_type_id nullable so we can have truly global defaults (task_type_id IS NULL).
ALTER TABLE public.task_template_folders
  ALTER COLUMN task_type_id DROP NOT NULL;

-- 2. Seed global default subfolders (firm_id = NULL, task_type_id = NULL → applies to all tasks).
--    These are created inside every new task folder by BusAcTa automatically.
INSERT INTO public.task_template_folders (firm_id, task_type_id, folder_name, sort_order)
VALUES
  (NULL, NULL, 'Source Documents',      1),
  (NULL, NULL, 'Workpapers',            2),
  (NULL, NULL, 'Returns',               3),
  (NULL, NULL, 'Client Correspondence', 4)
ON CONFLICT DO NOTHING;

-- 3. Task soft-delete → archive_task_folder job.
--    Fires when a task's deleted_at is set from NULL to a timestamp.
CREATE OR REPLACE FUNCTION public.enqueue_sharepoint_archive_task_folder()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_firm_id uuid;
BEGIN
  -- Only fire when deleted_at transitions NULL → non-null
  IF OLD.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS NULL THEN RETURN NEW; END IF;
  -- Only archive if a SharePoint folder was ever created
  IF NEW.sharepoint_folder_id IS NULL THEN RETURN NEW; END IF;

  -- Resolve firm_id via project
  SELECT firm_id INTO v_firm_id FROM public.projects WHERE id = NEW.project_id;

  INSERT INTO public.sharepoint_sync_jobs (
    job_type, firm_id, payload, status, correlation_id, attempts, next_run_at
  ) VALUES (
    'archive_task_folder',
    v_firm_id,
    jsonb_build_object('task_id', NEW.id),
    'queued',
    'archive-task:' || NEW.id::text,
    0,
    now()
  )
  ON CONFLICT (correlation_id) DO UPDATE
    SET status = 'queued', attempts = 0, next_run_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_archive_sharepoint ON public.tasks;
CREATE TRIGGER trg_tasks_archive_sharepoint
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_sharepoint_archive_task_folder();

-- 4. sharepoint_sync_jobs: add unique constraint on correlation_id if not already present
--    (needed for the ON CONFLICT clauses in server functions and the trigger above).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sharepoint_sync_jobs'::regclass
      AND conname = 'sharepoint_sync_jobs_correlation_id_key'
  ) THEN
    ALTER TABLE public.sharepoint_sync_jobs
      ADD CONSTRAINT sharepoint_sync_jobs_correlation_id_key UNIQUE (correlation_id);
  END IF;
END
$$;
