CREATE OR REPLACE FUNCTION public.enqueue_sharepoint_create_project_folder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.sharepoint_sync_jobs (job_type, firm_id, payload, correlation_id)
  VALUES ('create_project_folder', NEW.firm_id,
    jsonb_build_object('project_id', NEW.id),
    'project:' || NEW.id::text);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_sharepoint_create_task_folder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_firm_id uuid;
BEGIN
  IF NEW.entity_id IS NULL THEN RETURN NEW; END IF;
  SELECT firm_id INTO v_firm_id FROM public.projects WHERE id = NEW.project_id;
  IF v_firm_id IS NULL THEN v_firm_id := NEW.entity_id; END IF;
  INSERT INTO public.sharepoint_sync_jobs (job_type, firm_id, payload, correlation_id)
  VALUES ('create_task_folder', v_firm_id,
    jsonb_build_object('task_id', NEW.id),
    'task:' || NEW.id::text);
  INSERT INTO public.task_folder_metadata (task_id, sync_status)
  VALUES (NEW.id, 'pending') ON CONFLICT (task_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_sharepoint_patch_task_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_firm_id uuid;
BEGIN
  IF (COALESCE(NEW.status, '') = COALESCE(OLD.status, '')
      AND COALESCE(NEW.due_date::text, '') = COALESCE(OLD.due_date::text, '')
      AND COALESCE(NEW.priority, '') = COALESCE(OLD.priority, '')
      AND COALESCE(NEW.complexity, '') = COALESCE(OLD.complexity, ''))
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