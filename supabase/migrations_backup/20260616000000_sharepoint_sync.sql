-- SharePoint two-way real-time sync.
-- Depends on: 20260615000000_sharepoint_subscriptions.sql

-- 1. Project-level delta sync cursor (full Graph delta link URL) and initial sync flag.
--    sharepoint_delta_token (from 20260614) stores just the token; sharepoint_delta_link stores
--    the full opaque URL returned by Graph (preferred per Graph API docs).
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS sharepoint_delta_link        text,
  ADD COLUMN IF NOT EXISTS sharepoint_initial_sync_done boolean DEFAULT false;

-- 2. Documents: soft-delete support.
--    Files deleted in either system set deleted_at; hard rows are kept for audit trail.
--    UI queries filter WHERE deleted_at IS NULL.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;

-- 3. Fast lookup by sharepoint_item_id — used on every webhook-triggered delta sync.
--    The unique constraint (uq_documents_sharepoint_item_id from 20260614) covers equality;
--    a btree index accelerates the common UPSERT + filtered SELECT pattern.
CREATE INDEX IF NOT EXISTS idx_documents_sp_item_id
  ON public.documents (sharepoint_item_id);

-- 4. Partial index for soft-delete queries.
CREATE INDEX IF NOT EXISTS idx_documents_deleted_at
  ON public.documents (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 5. Task title rename → enqueue rename_task_folder SharePoint job.
--    Fires when a task title changes AND a SharePoint folder already exists for it.
CREATE OR REPLACE FUNCTION public.enqueue_sharepoint_rename_task_folder()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_firm_id uuid;
BEGIN
  IF OLD.title IS NOT DISTINCT FROM NEW.title THEN RETURN NEW; END IF;
  IF NEW.sharepoint_folder_id IS NULL THEN RETURN NEW; END IF;

  SELECT firm_id INTO v_firm_id FROM public.projects WHERE id = NEW.project_id;

  INSERT INTO public.sharepoint_sync_jobs (
    job_type, firm_id, payload, status, correlation_id, attempts, next_run_at
  ) VALUES (
    'rename_task_folder',
    v_firm_id,
    jsonb_build_object('task_id', NEW.id),
    'queued',
    'rename-task:' || NEW.id::text,
    0,
    now()
  )
  ON CONFLICT (correlation_id) DO UPDATE
    SET status      = 'queued',
        attempts    = 0,
        next_run_at = now(),
        payload     = EXCLUDED.payload;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_rename_sharepoint ON public.tasks;
CREATE TRIGGER trg_tasks_rename_sharepoint
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_sharepoint_rename_task_folder();

-- 6. Document soft-delete → enqueue delete_sharepoint_file job.
--    Fires when deleted_at transitions NULL → non-null (app-initiated or SP-initiated).
--    handleDeleteFile handles 404 gracefully (file already gone from SharePoint).
CREATE OR REPLACE FUNCTION public.enqueue_sharepoint_delete_file()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.sharepoint_sync_jobs (
    job_type, firm_id, payload, status, correlation_id, attempts, next_run_at
  ) VALUES (
    'delete_sharepoint_file',
    NEW.firm_id,
    jsonb_build_object(
      'document_id',        NEW.id,
      'sharepoint_item_id', NEW.sharepoint_item_id,
      'project_id',         NEW.project_id
    ),
    'queued',
    'delete-sp-file:' || NEW.id::text,
    0,
    now()
  )
  ON CONFLICT (correlation_id) DO UPDATE
    SET status = 'queued', attempts = 0, next_run_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_delete_sharepoint ON public.documents;
CREATE TRIGGER trg_documents_delete_sharepoint
  AFTER UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_sharepoint_delete_file();
