
-- 1. Drop overly-permissive policies added during dev
DROP POLICY IF EXISTS "Authenticated users manage projects" ON public.projects;
DROP POLICY IF EXISTS "Authenticated users manage tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated users manage client entities" ON public.client_entities;

-- The "Internal manage tasks" policy already covers admins+employees,
-- making "Admins manage projects" redundant for tasks. We keep it for projects since
-- there's a separate Employees manage projects policy.

-- 2. Audit trigger function
CREATE OR REPLACE FUNCTION public.task_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_audit (task_id, actor_id, event_type, payload)
    VALUES (NEW.id, auth.uid(), 'task_created',
      jsonb_build_object('title', NEW.title, 'status', NEW.status, 'priority', NEW.priority));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.task_audit (task_id, actor_id, event_type, payload)
    VALUES (NEW.id, auth.uid(), 'status_changed',
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;

  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    INSERT INTO public.task_audit (task_id, actor_id, event_type, payload)
    VALUES (NEW.id, auth.uid(), 'assignee_changed',
      jsonb_build_object('from', OLD.assignee_id, 'to', NEW.assignee_id));
  END IF;

  IF NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id THEN
    INSERT INTO public.task_audit (task_id, actor_id, event_type, payload)
    VALUES (NEW.id, auth.uid(), 'reviewer_changed',
      jsonb_build_object('from', OLD.reviewer_id, 'to', NEW.reviewer_id));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_audit_trigger ON public.tasks;
CREATE TRIGGER tasks_audit_trigger
AFTER INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.task_audit_trigger();

-- 3. Audit trigger for message client-visibility changes
CREATE OR REPLACE FUNCTION public.task_message_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_client_visible IS DISTINCT FROM OLD.is_client_visible THEN
    INSERT INTO public.task_audit (task_id, actor_id, event_type, payload)
    VALUES (NEW.task_id, auth.uid(), 'message_visibility_changed',
      jsonb_build_object('message_id', NEW.id, 'from', OLD.is_client_visible, 'to', NEW.is_client_visible));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_messages_audit_trigger ON public.task_messages;
CREATE TRIGGER task_messages_audit_trigger
AFTER UPDATE ON public.task_messages
FOR EACH ROW EXECUTE FUNCTION public.task_message_audit_trigger();
