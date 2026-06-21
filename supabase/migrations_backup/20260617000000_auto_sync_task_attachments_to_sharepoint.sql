-- Auto-sync task attachments to SharePoint on upload.
--
-- Problem: files uploaded via the BusAcTa files panel go to Supabase Storage
-- (task_attachments table) but nothing triggers their copy to SharePoint, so
-- the OneDrive/SharePoint folder stays empty until a manual "Sync" is pressed.
--
-- Fix: fire two jobs on every task_attachments INSERT:
--
--   1. create_task_folder  — ensures the SharePoint folder exists for the task.
--      Uses correlation_id so multiple uploads to the same task only ever queue
--      one folder-creation job.
--
--   2. migrate_attachment  — downloads the file from Supabase Storage and
--      uploads it to the task's SharePoint folder.  Scheduled 30 s in the
--      future so the folder job normally completes first.  The handler retries
--      with exponential back-off if the folder is still absent.
--
-- Both inserts are wrapped in their own EXCEPTION block so a queue failure
-- never blocks the primary upload transaction.
--
-- Guard: only fires when storage_path is non-null (i.e. a real file upload,
-- not a metadata-only row) and archived_at is null (not a soft-delete import).

CREATE OR REPLACE FUNCTION public._enqueue_migrate_attachment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip if this is an archived / deleted row (shouldn't happen on INSERT, but be safe)
  IF NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Skip rows without a storage path (metadata-only inserts from delta sync)
  IF NEW.storage_path IS NULL OR NEW.storage_path = '' THEN
    RETURN NEW;
  END IF;

  -- 1. Ensure the task SharePoint folder exists.
  --    ON CONFLICT DO NOTHING — if the folder job is already queued or done, skip.
  BEGIN
    INSERT INTO public.sharepoint_sync_jobs (
      job_type, firm_id, payload,
      status, attempts, max_attempts, next_run_at,
      correlation_id
    ) VALUES (
      'create_task_folder',
      NULL,
      jsonb_build_object('task_id', NEW.task_id),
      'queued', 0, 5, now(),
      'task-folder:' || NEW.task_id::text
    )
    ON CONFLICT (correlation_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Non-fatal — handler retries are sufficient
    NULL;
  END;

  -- 2. Migrate this specific attachment to SharePoint.
  --    Delayed 30 s to give create_task_folder time to complete first.
  --    handleMigrateAttachment retries if the folder is still absent.
  BEGIN
    INSERT INTO public.sharepoint_sync_jobs (
      job_type, firm_id, payload,
      status, attempts, max_attempts, next_run_at,
      correlation_id
    ) VALUES (
      'migrate_attachment',
      NULL,
      jsonb_build_object('attachment_id', NEW.id),
      'queued', 0, 5, now() + interval '30 seconds',
      'migrate-att:' || NEW.id::text
    )
    ON CONFLICT (correlation_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- Drop first so this migration is re-runnable
DROP TRIGGER IF EXISTS trg_task_attachment_sp_sync ON public.task_attachments;

CREATE TRIGGER trg_task_attachment_sp_sync
  AFTER INSERT ON public.task_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public._enqueue_migrate_attachment();

-- ── Backfill: catch up all existing un-synced attachments ──────────────────
-- Only for projects that have SharePoint configured (sharepoint_drive_id IS NOT NULL).
-- Idempotent via ON CONFLICT DO NOTHING.
DO $$
DECLARE
  v_row RECORD;
BEGIN
  -- Step 1: queue create_task_folder for tasks that have attachments but no SP folder yet
  FOR v_row IN
    SELECT DISTINCT ta.task_id
    FROM   public.task_attachments ta
    JOIN   public.tasks            t  ON t.id = ta.task_id
    JOIN   public.projects         p  ON p.id = t.project_id
    WHERE  ta.archived_at              IS NULL
      AND  ta.storage_path             IS NOT NULL
      AND  ta.storage_path             <> ''
      AND  p.sharepoint_drive_id       IS NOT NULL   -- project has SP configured
      AND  t.sharepoint_folder_id      IS NULL        -- folder not yet created
  LOOP
    BEGIN
      INSERT INTO public.sharepoint_sync_jobs (
        job_type, firm_id, payload,
        status, attempts, max_attempts, next_run_at,
        correlation_id
      ) VALUES (
        'create_task_folder',
        NULL,
        jsonb_build_object('task_id', v_row.task_id),
        'queued', 0, 5, now(),
        'task-folder:' || v_row.task_id::text
      )
      ON CONFLICT (correlation_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  -- Step 2: queue migrate_attachment for attachments not yet synced to SharePoint.
  --   • Tasks with existing SP folders: run immediately.
  --   • Tasks without SP folders: delay 60 s — create_task_folder runs first.
  FOR v_row IN
    SELECT ta.id    AS attachment_id,
           ta.task_id,
           t.sharepoint_folder_id
    FROM   public.task_attachments ta
    JOIN   public.tasks            t  ON t.id = ta.task_id
    JOIN   public.projects         p  ON p.id = t.project_id
    WHERE  ta.archived_at        IS NULL
      AND  ta.storage_path       IS NOT NULL
      AND  ta.storage_path       <> ''
      AND  p.sharepoint_drive_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.documents d
        WHERE  d.task_id       = ta.task_id
          AND  d.file_name     = ta.filename
          AND  d.migrated_from = 'supabase-storage'
      )
  LOOP
    BEGIN
      INSERT INTO public.sharepoint_sync_jobs (
        job_type, firm_id, payload,
        status, attempts, max_attempts, next_run_at,
        correlation_id
      ) VALUES (
        'migrate_attachment',
        NULL,
        jsonb_build_object('attachment_id', v_row.attachment_id),
        'queued', 0, 5,
        CASE WHEN v_row.sharepoint_folder_id IS NULL
             THEN now() + interval '60 seconds'   -- folder creation needs to run first
             ELSE now()
        END,
        'migrate-att:' || v_row.attachment_id::text
      )
      ON CONFLICT (correlation_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END;
$$;
