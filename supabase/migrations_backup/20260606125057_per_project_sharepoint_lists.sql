-- Per-project SharePoint backup lists.
-- Replaces the global "BusAcTa Tasks/Messages/Audit" lists (Phase 1) with
-- four per-project lists provisioned on the CPA firm's SharePoint site.
--
-- Changes:
--   1. Add sp_list_id_* columns to projects
--   2. Retrofit EXCEPTION guard on 5 existing trigger functions
--      (so a job-queue failure never rolls back a user-facing write)
--   3. New trigger: projects INSERT → provision_project_lists job
--   4. New trigger: document_nodes INSERT (file only) → backup_document job

-- ── 1. Projects columns ───────────────────────────────────────────────────────

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS sp_list_id_tasks     TEXT,
  ADD COLUMN IF NOT EXISTS sp_list_id_messages  TEXT,
  ADD COLUMN IF NOT EXISTS sp_list_id_audit     TEXT,
  ADD COLUMN IF NOT EXISTS sp_list_id_documents TEXT;

-- ── 2. EXCEPTION guard retrofit ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _enqueue_task_backup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  BEGIN
    INSERT INTO sharepoint_sync_jobs
      (firm_id, job_type, payload, status, attempts, max_attempts, next_run_at)
    VALUES
      (NEW.entity_id, 'backup_task',
       jsonb_build_object('task_id', NEW.id),
       'queued', 0, 5, now());
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION _enqueue_task_message_backup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  BEGIN
    INSERT INTO sharepoint_sync_jobs
      (job_type, payload, status, attempts, max_attempts, next_run_at)
    VALUES
      ('backup_message',
       jsonb_build_object('message_id', NEW.id, 'message_type', 'task'),
       'queued', 0, 5, now());
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION _enqueue_firm_message_backup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  BEGIN
    INSERT INTO sharepoint_sync_jobs
      (job_type, payload, status, attempts, max_attempts, next_run_at)
    VALUES
      ('backup_message',
       jsonb_build_object('message_id', NEW.id, 'message_type', 'firm'),
       'queued', 0, 5, now());
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION _enqueue_audit_backup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  BEGIN
    INSERT INTO sharepoint_sync_jobs
      (job_type, payload, status, attempts, max_attempts, next_run_at)
    VALUES
      ('backup_audit_event',
       jsonb_build_object('audit_id', NEW.id),
       'queued', 0, 5, now());
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

-- ── 3. projects INSERT → provision_project_lists ──────────────────────────────

CREATE OR REPLACE FUNCTION _enqueue_provision_project_lists()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  BEGIN
    INSERT INTO sharepoint_sync_jobs
      (firm_id, job_type, payload, status, attempts, max_attempts, next_run_at)
    VALUES
      (NEW.firm_id, 'provision_project_lists',
       jsonb_build_object('project_id', NEW.id),
       'queued', 0, 5, now());
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_provision_project_lists
  AFTER INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION _enqueue_provision_project_lists();

-- ── 4. document_nodes INSERT (file only) → backup_document ───────────────────

CREATE OR REPLACE FUNCTION _enqueue_document_backup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.node_type <> 'file' THEN RETURN NEW; END IF;
  BEGIN
    INSERT INTO sharepoint_sync_jobs
      (firm_id, job_type, payload, status, attempts, max_attempts, next_run_at)
    VALUES
      (NEW.firm_id, 'backup_document',
       jsonb_build_object('document_id', NEW.id, 'project_id', NEW.project_id),
       'queued', 0, 5, now());
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_document_backup
  AFTER INSERT ON document_nodes
  FOR EACH ROW EXECUTE FUNCTION _enqueue_document_backup();
