-- Fix: task updates fail with "invalid input value for enum task_status: \"\""
--
-- enqueue_sharepoint_patch_task_metadata() guarded its change-detection with
-- COALESCE(NEW.status, '') = COALESCE(OLD.status, ''). Because `status`,
-- `priority` and `complexity` are enum-typed, the empty-string literal '' is
-- coerced to the enum type, which has no '' member — so the trigger (and thus
-- EVERY task UPDATE) raised "invalid input value for enum task_status".
--
-- Replace the COALESCE comparisons with null-safe IS [NOT] DISTINCT FROM, which
-- needs no literal coercion and handles NULLs correctly. Behaviour is otherwise
-- identical: skip enqueuing a SharePoint metadata patch when none of status /
-- due_date / priority / complexity changed.

CREATE OR REPLACE FUNCTION public.enqueue_sharepoint_patch_task_metadata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_firm_id uuid;
BEGIN
  IF (NEW.status     IS NOT DISTINCT FROM OLD.status
      AND NEW.due_date   IS NOT DISTINCT FROM OLD.due_date
      AND NEW.priority   IS NOT DISTINCT FROM OLD.priority
      AND NEW.complexity IS NOT DISTINCT FROM OLD.complexity)
  THEN RETURN NEW; END IF;

  SELECT firm_id INTO v_firm_id FROM public.projects WHERE id = NEW.project_id;
  IF v_firm_id IS NULL THEN v_firm_id := NEW.entity_id; END IF;
  IF v_firm_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.sharepoint_sync_jobs (job_type, firm_id, payload, correlation_id)
  VALUES ('patch_task_metadata', v_firm_id,
    jsonb_build_object('task_id', NEW.id),
    'task-meta:' || NEW.id::text || ':' || extract(epoch from now())::text);
  RETURN NEW;
END;
$function$;
