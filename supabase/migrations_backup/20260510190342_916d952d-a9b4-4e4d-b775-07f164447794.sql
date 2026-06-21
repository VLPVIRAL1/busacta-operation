
-- Extend task_messages audit to record body edits and deletions in addition
-- to visibility changes. RLS + enforce_task_message_edit_policy already block
-- non-authors from editing; this trigger just records the audit trail.
CREATE OR REPLACE FUNCTION public.task_message_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Visibility change (admin-only operation)
  IF TG_OP = 'UPDATE' AND NEW.is_client_visible IS DISTINCT FROM OLD.is_client_visible THEN
    INSERT INTO public.task_audit (task_id, actor_id, event_type, payload)
    VALUES (NEW.task_id, auth.uid(), 'message_visibility_changed',
      jsonb_build_object('message_id', NEW.id, 'from', OLD.is_client_visible, 'to', NEW.is_client_visible));
  END IF;

  -- Body edited by author within edit window
  IF TG_OP = 'UPDATE'
     AND NEW.body IS DISTINCT FROM OLD.body
     AND NEW.deleted_at IS NULL
     AND OLD.deleted_at IS NULL THEN
    INSERT INTO public.task_audit (task_id, actor_id, event_type, payload)
    VALUES (NEW.task_id, auth.uid(), 'message_edited',
      jsonb_build_object(
        'message_id', NEW.id,
        'author_id', NEW.author_id,
        'previous_body', OLD.body,
        'new_body', NEW.body,
        'edited_at', now()
      ));
  END IF;

  -- Soft delete
  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NULL
     AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.task_audit (task_id, actor_id, event_type, payload)
    VALUES (NEW.task_id, auth.uid(), 'message_deleted',
      jsonb_build_object('message_id', NEW.id, 'author_id', NEW.author_id, 'body_at_delete', OLD.body));
  END IF;

  RETURN NEW;
END;
$function$;

-- Drop the duplicate trigger (was firing the same function twice).
DROP TRIGGER IF EXISTS task_messages_audit_trigger ON public.task_messages;
