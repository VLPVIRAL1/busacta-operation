-- Email integration: system-level config, notification delivery queue,
-- and DB triggers to populate the queue on task events.
--
-- Config is stored in integration_credentials (key = 'email_notifications')
-- alongside the existing WhatsApp / Microsoft / Gemini rows.

-- ── 1. Seed default config row in integration_credentials ─────────────────
INSERT INTO integration_credentials (
  integration_key,
  display_name,
  config,
  is_active,
  created_at,
  updated_at
) VALUES (
  'email_notifications',
  'Email Notifications',
  jsonb_build_object(
    'sender_name',             '',
    'reply_to',                '',
    'is_active',               false,
    'notify_on_assigned',      true,
    'notify_on_status',        true,
    'notify_on_commented',     true,
    'notify_on_due_soon',      true,
    'password_emails_enabled', true,
    'report_emails_enabled',   false,
    'report_recipients',       ''
  ),
  false,
  now(),
  now()
) ON CONFLICT (integration_key) DO NOTHING;

-- ── 2. Email notification delivery queue ──────────────────────────────────
CREATE TABLE IF NOT EXISTS email_notification_queue (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT        NOT NULL CHECK (
    notification_type IN ('task_assigned', 'task_status_changed', 'task_commented', 'task_due_soon')
  ),
  task_id           UUID        REFERENCES tasks(id) ON DELETE SET NULL,
  task_title        TEXT,
  actor_name        TEXT,
  extra             JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at           TIMESTAMPTZ,
  error             TEXT
);

ALTER TABLE email_notification_queue ENABLE ROW LEVEL SECURITY;

-- Only admins can view/manage; cron uses service-role which bypasses RLS.
CREATE POLICY "email_queue_admin"
  ON email_notification_queue
  FOR ALL
  USING (current_user_role() IN ('super_admin', 'admin'));

CREATE INDEX IF NOT EXISTS email_queue_pending_idx
  ON email_notification_queue (created_at)
  WHERE sent_at IS NULL AND error IS NULL;

-- ── 3. Trigger: tasks UPDATE → queue assigned / status_changed ────────────
CREATE OR REPLACE FUNCTION _queue_task_email_on_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actor_name  TEXT;
  v_cfg         JSONB;
  v_is_active   BOOLEAN;
BEGIN
  -- Read live config; bail out fast if email notifications are disabled.
  SELECT config, is_active
    INTO v_cfg, v_is_active
    FROM integration_credentials
   WHERE integration_key = 'email_notifications';

  IF NOT FOUND OR NOT v_is_active THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, email, 'Someone')
    INTO v_actor_name
    FROM profiles
   WHERE id = auth.uid();

  -- Assignee changed → notify the newly assigned person (skip self-assignments)
  IF (v_cfg->>'notify_on_assigned')::boolean IS NOT FALSE
     AND OLD.assignee_id IS DISTINCT FROM NEW.assignee_id
     AND NEW.assignee_id IS NOT NULL
     AND NEW.assignee_id IS DISTINCT FROM auth.uid() THEN
    INSERT INTO email_notification_queue
      (user_id, notification_type, task_id, task_title, actor_name)
    VALUES
      (NEW.assignee_id, 'task_assigned', NEW.id, NEW.title, v_actor_name);
  END IF;

  -- Status changed → notify assignee + reviewer (skip if they made the change)
  IF (v_cfg->>'notify_on_status')::boolean IS NOT FALSE
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id IS DISTINCT FROM auth.uid() THEN
      INSERT INTO email_notification_queue
        (user_id, notification_type, task_id, task_title, actor_name, extra)
      VALUES
        (NEW.assignee_id, 'task_status_changed', NEW.id, NEW.title, v_actor_name,
         jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
    END IF;
    IF NEW.reviewer_id IS NOT NULL
       AND NEW.reviewer_id IS DISTINCT FROM auth.uid()
       AND NEW.reviewer_id IS DISTINCT FROM NEW.assignee_id THEN
      INSERT INTO email_notification_queue
        (user_id, notification_type, task_id, task_title, actor_name, extra)
      VALUES
        (NEW.reviewer_id, 'task_status_changed', NEW.id, NEW.title, v_actor_name,
         jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_email_notify ON tasks;
CREATE TRIGGER trg_tasks_email_notify
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION _queue_task_email_on_update();

-- ── 4. Trigger: task_messages INSERT → queue commented ────────────────────
CREATE OR REPLACE FUNCTION _queue_task_email_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_task        RECORD;
  v_actor_name  TEXT;
  v_cfg         JSONB;
  v_is_active   BOOLEAN;
BEGIN
  SELECT config, is_active
    INTO v_cfg, v_is_active
    FROM integration_credentials
   WHERE integration_key = 'email_notifications';

  IF NOT FOUND OR NOT v_is_active THEN
    RETURN NEW;
  END IF;

  IF (v_cfg->>'notify_on_commented')::boolean IS FALSE THEN
    RETURN NEW;
  END IF;

  SELECT title, assignee_id, reviewer_id
    INTO v_task
    FROM tasks
   WHERE id = NEW.task_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT COALESCE(full_name, email, 'Someone')
    INTO v_actor_name
    FROM profiles
   WHERE id = NEW.author_id;

  -- Notify assignee (not if they wrote the comment)
  IF v_task.assignee_id IS NOT NULL AND v_task.assignee_id IS DISTINCT FROM NEW.author_id THEN
    INSERT INTO email_notification_queue
      (user_id, notification_type, task_id, task_title, actor_name)
    VALUES
      (v_task.assignee_id, 'task_commented', NEW.task_id, v_task.title, v_actor_name);
  END IF;

  -- Notify reviewer (not if they wrote the comment; deduplicate with assignee)
  IF v_task.reviewer_id IS NOT NULL
     AND v_task.reviewer_id IS DISTINCT FROM NEW.author_id
     AND v_task.reviewer_id IS DISTINCT FROM v_task.assignee_id THEN
    INSERT INTO email_notification_queue
      (user_id, notification_type, task_id, task_title, actor_name)
    VALUES
      (v_task.reviewer_id, 'task_commented', NEW.task_id, v_task.title, v_actor_name);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_messages_email_notify ON task_messages;
CREATE TRIGGER trg_task_messages_email_notify
  AFTER INSERT ON task_messages
  FOR EACH ROW
  EXECUTE FUNCTION _queue_task_email_on_message();
