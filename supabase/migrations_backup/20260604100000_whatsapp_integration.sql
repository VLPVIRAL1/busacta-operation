-- WhatsApp integration: OTP channel extension, per-user notification prefs,
-- delivery queue, and DB triggers to populate the queue on task events.

-- ── 1. Extend OTP channel check constraints to include 'whatsapp' ──────────
ALTER TABLE user_otp_channels
  DROP CONSTRAINT IF EXISTS user_otp_channels_channel_check;
ALTER TABLE user_otp_channels
  ADD CONSTRAINT user_otp_channels_channel_check
  CHECK (channel = ANY (ARRAY['email'::text, 'sms'::text, 'whatsapp'::text]));

ALTER TABLE otp_challenges
  DROP CONSTRAINT IF EXISTS otp_challenges_channel_check;
ALTER TABLE otp_challenges
  ADD CONSTRAINT otp_challenges_channel_check
  CHECK (channel = ANY (ARRAY['email'::text, 'sms'::text, 'whatsapp'::text]));

-- ── 2. Per-user WhatsApp notification preferences ──────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_notification_prefs (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled              BOOLEAN NOT NULL DEFAULT true,
  notify_on_assigned   BOOLEAN NOT NULL DEFAULT true,
  notify_on_status     BOOLEAN NOT NULL DEFAULT true,
  notify_on_commented  BOOLEAN NOT NULL DEFAULT true,
  notify_on_due_soon   BOOLEAN NOT NULL DEFAULT true,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_prefs_self_all"
  ON whatsapp_notification_prefs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "whatsapp_prefs_admin_read"
  ON whatsapp_notification_prefs
  FOR SELECT
  USING (current_user_role() IN ('super_admin', 'admin'));

-- ── 3. Notification delivery queue ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_notification_queue (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (
    notification_type IN ('task_assigned', 'task_status_changed', 'task_commented', 'task_due_soon')
  ),
  task_id           UUID REFERENCES tasks(id) ON DELETE SET NULL,
  task_title        TEXT,
  actor_name        TEXT,
  extra             JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at           TIMESTAMPTZ,
  error             TEXT
);

ALTER TABLE whatsapp_notification_queue ENABLE ROW LEVEL SECURITY;

-- Only admins read/manage the queue (cron uses service-role which bypasses RLS)
CREATE POLICY "whatsapp_queue_admin"
  ON whatsapp_notification_queue
  FOR ALL
  USING (current_user_role() IN ('super_admin', 'admin'));

CREATE INDEX IF NOT EXISTS whatsapp_queue_pending_idx
  ON whatsapp_notification_queue (created_at)
  WHERE sent_at IS NULL AND error IS NULL;

-- ── 4. Trigger: tasks UPDATE → queue 'task_assigned' / 'task_status_changed' ──
CREATE OR REPLACE FUNCTION _queue_task_whatsapp_on_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actor_name TEXT;
BEGIN
  SELECT COALESCE(full_name, email, 'Someone')
    INTO v_actor_name
    FROM profiles
   WHERE id = auth.uid();

  -- Assignee changed → notify the newly assigned person (skip if they assigned themselves)
  IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id
     AND NEW.assignee_id IS NOT NULL
     AND NEW.assignee_id IS DISTINCT FROM auth.uid() THEN
    INSERT INTO whatsapp_notification_queue
      (user_id, notification_type, task_id, task_title, actor_name)
    VALUES
      (NEW.assignee_id, 'task_assigned', NEW.id, NEW.title, v_actor_name);
  END IF;

  -- Status changed → notify assignee + reviewer (skip if they made the change)
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id IS DISTINCT FROM auth.uid() THEN
      INSERT INTO whatsapp_notification_queue
        (user_id, notification_type, task_id, task_title, actor_name, extra)
      VALUES
        (NEW.assignee_id, 'task_status_changed', NEW.id, NEW.title, v_actor_name,
         jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
    END IF;
    IF NEW.reviewer_id IS NOT NULL
       AND NEW.reviewer_id IS DISTINCT FROM auth.uid()
       AND NEW.reviewer_id IS DISTINCT FROM NEW.assignee_id THEN
      INSERT INTO whatsapp_notification_queue
        (user_id, notification_type, task_id, task_title, actor_name, extra)
      VALUES
        (NEW.reviewer_id, 'task_status_changed', NEW.id, NEW.title, v_actor_name,
         jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_whatsapp_notify ON tasks;
CREATE TRIGGER trg_tasks_whatsapp_notify
  AFTER UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION _queue_task_whatsapp_on_update();

-- ── 5. Trigger: task_messages INSERT → queue 'task_commented' ──────────────
CREATE OR REPLACE FUNCTION _queue_task_whatsapp_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_task      RECORD;
  v_actor_name TEXT;
BEGIN
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
    INSERT INTO whatsapp_notification_queue
      (user_id, notification_type, task_id, task_title, actor_name)
    VALUES
      (v_task.assignee_id, 'task_commented', NEW.task_id, v_task.title, v_actor_name);
  END IF;

  -- Notify reviewer (not if they wrote the comment; deduplicate with assignee)
  IF v_task.reviewer_id IS NOT NULL
     AND v_task.reviewer_id IS DISTINCT FROM NEW.author_id
     AND v_task.reviewer_id IS DISTINCT FROM v_task.assignee_id THEN
    INSERT INTO whatsapp_notification_queue
      (user_id, notification_type, task_id, task_title, actor_name)
    VALUES
      (v_task.reviewer_id, 'task_commented', NEW.task_id, v_task.title, v_actor_name);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_messages_whatsapp_notify ON task_messages;
CREATE TRIGGER trg_task_messages_whatsapp_notify
  AFTER INSERT ON task_messages
  FOR EACH ROW
  EXECUTE FUNCTION _queue_task_whatsapp_on_message();
