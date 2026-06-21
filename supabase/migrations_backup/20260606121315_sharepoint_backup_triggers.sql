-- Enqueue SharePoint backup jobs whenever tasks, messages, or audit events are written.
-- Jobs are picked up by /api/public/cron/sharepoint-worker and dispatched to the
-- matching Graph handler (backup_task / backup_message / backup_audit_event).

-- ── backup_task ──────────────────────────────────────────────────────────────
-- Fires on INSERT and UPDATE so the SharePoint list stays current.

CREATE OR REPLACE FUNCTION _enqueue_task_backup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO sharepoint_sync_jobs (firm_id, job_type, payload, status, attempts, max_attempts, next_run_at)
  VALUES (
    NEW.entity_id,
    'backup_task',
    jsonb_build_object('task_id', NEW.id),
    'queued',
    0,
    5,
    now()
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_backup_insert
  AFTER INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION _enqueue_task_backup();

CREATE TRIGGER trg_task_backup_update
  AFTER UPDATE ON tasks
  FOR EACH ROW
  WHEN (
    OLD.status      IS DISTINCT FROM NEW.status      OR
    OLD.priority    IS DISTINCT FROM NEW.priority    OR
    OLD.complexity  IS DISTINCT FROM NEW.complexity  OR
    OLD.due_date    IS DISTINCT FROM NEW.due_date    OR
    OLD.title       IS DISTINCT FROM NEW.title
  )
  EXECUTE FUNCTION _enqueue_task_backup();

-- ── backup_message (task_messages) ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION _enqueue_task_message_backup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO sharepoint_sync_jobs (job_type, payload, status, attempts, max_attempts, next_run_at)
  VALUES (
    'backup_message',
    jsonb_build_object('message_id', NEW.id, 'message_type', 'task'),
    'queued',
    0,
    5,
    now()
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_message_backup
  AFTER INSERT ON task_messages
  FOR EACH ROW EXECUTE FUNCTION _enqueue_task_message_backup();

-- ── backup_message (firm_messages) ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION _enqueue_firm_message_backup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO sharepoint_sync_jobs (job_type, payload, status, attempts, max_attempts, next_run_at)
  VALUES (
    'backup_message',
    jsonb_build_object('message_id', NEW.id, 'message_type', 'firm'),
    'queued',
    0,
    5,
    now()
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_firm_message_backup
  AFTER INSERT ON firm_messages
  FOR EACH ROW EXECUTE FUNCTION _enqueue_firm_message_backup();

-- ── backup_audit_event ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION _enqueue_audit_backup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO sharepoint_sync_jobs (job_type, payload, status, attempts, max_attempts, next_run_at)
  VALUES (
    'backup_audit_event',
    jsonb_build_object('audit_id', NEW.id),
    'queued',
    0,
    5,
    now()
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_backup
  AFTER INSERT ON task_audit
  FOR EACH ROW EXECUTE FUNCTION _enqueue_audit_backup();
