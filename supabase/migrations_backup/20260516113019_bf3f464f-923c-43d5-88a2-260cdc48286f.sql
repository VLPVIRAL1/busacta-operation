-- 1. Extend file audit trigger to capture archive/restore events.
CREATE OR REPLACE FUNCTION public.trg_audit_task_attachments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_document_events(task_id, node_kind, node_id, node_label, event_type, actor_id, after)
    VALUES (NEW.task_id, 'file', NEW.id, NEW.filename, 'uploaded', _actor,
      jsonb_build_object('filename', NEW.filename, 'folder_path', NEW.folder_path, 'size_bytes', NEW.size_bytes, 'is_client_visible', NEW.is_client_visible));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.filename IS DISTINCT FROM OLD.filename THEN
      INSERT INTO public.task_document_events(task_id, node_kind, node_id, node_label, event_type, actor_id, before, after)
      VALUES (NEW.task_id, 'file', NEW.id, NEW.filename, 'renamed', _actor,
        jsonb_build_object('filename', OLD.filename),
        jsonb_build_object('filename', NEW.filename));
    END IF;
    IF NEW.folder_path IS DISTINCT FROM OLD.folder_path THEN
      INSERT INTO public.task_document_events(task_id, node_kind, node_id, node_label, event_type, actor_id, before, after)
      VALUES (NEW.task_id, 'file', NEW.id, NEW.filename, 'moved', _actor,
        jsonb_build_object('folder_path', OLD.folder_path),
        jsonb_build_object('folder_path', NEW.folder_path));
    END IF;
    IF NEW.is_client_visible IS DISTINCT FROM OLD.is_client_visible THEN
      INSERT INTO public.task_document_events(task_id, node_kind, node_id, node_label, event_type, actor_id, before, after)
      VALUES (NEW.task_id, 'file', NEW.id, NEW.filename, 'visibility_changed', _actor,
        jsonb_build_object('is_client_visible', OLD.is_client_visible),
        jsonb_build_object('is_client_visible', NEW.is_client_visible));
    END IF;
    IF NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
      INSERT INTO public.task_document_events(task_id, node_kind, node_id, node_label, event_type, actor_id, before, after)
      VALUES (NEW.task_id, 'file', NEW.id, NEW.filename,
        CASE WHEN NEW.archived_at IS NOT NULL THEN 'archived' ELSE 'restored' END,
        _actor,
        jsonb_build_object('archived_at', OLD.archived_at),
        jsonb_build_object('archived_at', NEW.archived_at));
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END
$function$;

-- 2. Default folder name uses project name when available.
CREATE OR REPLACE FUNCTION public.create_unsorted_documents_folder()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _project_name text;
  _folder_name text;
BEGIN
  SELECT p.name INTO _project_name
  FROM public.projects p
  JOIN public.client_entities ce ON ce.project_id = p.id
  WHERE ce.id = NEW.entity_id
  LIMIT 1;

  _folder_name := COALESCE(NULLIF(trim(_project_name), ''), 'Unsorted Documents');
  -- Sanitize forbidden characters in path component.
  _folder_name := regexp_replace(_folder_name, '[\/\\\n\r]+', ' ', 'g');

  INSERT INTO public.task_document_folders (task_id, path, is_client_visible, is_system, created_by)
  VALUES (NEW.id, _folder_name, false, true, NEW.created_by)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 3. Migrate existing "Unsorted Documents" rows to project name (per task).
DO $$
DECLARE
  r RECORD;
  _new text;
BEGIN
  FOR r IN
    SELECT f.id, f.task_id, f.path, p.name AS project_name
    FROM public.task_document_folders f
    JOIN public.tasks t ON t.id = f.task_id
    JOIN public.client_entities ce ON ce.id = t.entity_id
    JOIN public.projects p ON p.id = ce.project_id
    WHERE f.path = 'Unsorted Documents'
      AND f.is_system = true
      AND p.name IS NOT NULL
      AND trim(p.name) <> ''
  LOOP
    _new := regexp_replace(r.project_name, '[\/\\\n\r]+', ' ', 'g');
    -- Skip if a folder with that name already exists for the task.
    IF NOT EXISTS (
      SELECT 1 FROM public.task_document_folders x
      WHERE x.task_id = r.task_id AND x.path = _new
    ) THEN
      UPDATE public.task_document_folders SET path = _new WHERE id = r.id;
      UPDATE public.task_attachments
        SET folder_path = _new
        WHERE task_id = r.task_id AND folder_path = 'Unsorted Documents';
    END IF;
  END LOOP;
END $$;