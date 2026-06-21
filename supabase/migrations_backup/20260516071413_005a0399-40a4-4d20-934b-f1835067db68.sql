
-- 1. Folder-level visibility
ALTER TABLE public.task_document_folders
  ADD COLUMN IF NOT EXISTS is_client_visible boolean NOT NULL DEFAULT false;

-- 2. Per-file override (NULL = inherit folder)
ALTER TABLE public.task_attachments
  ADD COLUMN IF NOT EXISTS client_visible_override boolean NULL;

-- 3. Resolver: refresh cached is_client_visible on attachments for a given (task, folder_path)
CREATE OR REPLACE FUNCTION public.refresh_task_attachment_visibility(_task_id uuid, _folder_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.task_attachments a
     SET is_client_visible = COALESCE(
       a.client_visible_override,
       (SELECT f.is_client_visible
          FROM public.task_document_folders f
         WHERE f.task_id = a.task_id AND f.path = a.folder_path
         LIMIT 1),
       false
     )
   WHERE a.task_id = _task_id
     AND (_folder_path IS NULL OR a.folder_path = _folder_path OR a.folder_path LIKE _folder_path || '/%');
END
$$;

-- Trigger: when a folder's is_client_visible changes, refresh descendants
CREATE OR REPLACE FUNCTION public.trg_folder_visibility_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.is_client_visible IS DISTINCT FROM OLD.is_client_visible THEN
    PERFORM public.refresh_task_attachment_visibility(NEW.task_id, NEW.path);
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS task_document_folders_visibility_refresh ON public.task_document_folders;
CREATE TRIGGER task_document_folders_visibility_refresh
AFTER UPDATE ON public.task_document_folders
FOR EACH ROW EXECUTE FUNCTION public.trg_folder_visibility_changed();

-- Trigger: when a file is inserted or its override / folder_path changes, recompute its is_client_visible
CREATE OR REPLACE FUNCTION public.trg_attachment_resolve_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _folder_vis boolean;
BEGIN
  SELECT f.is_client_visible INTO _folder_vis
    FROM public.task_document_folders f
   WHERE f.task_id = NEW.task_id AND f.path = NEW.folder_path
   LIMIT 1;
  NEW.is_client_visible := COALESCE(NEW.client_visible_override, _folder_vis, false);
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS task_attachments_resolve_visibility ON public.task_attachments;
CREATE TRIGGER task_attachments_resolve_visibility
BEFORE INSERT OR UPDATE OF client_visible_override, folder_path ON public.task_attachments
FOR EACH ROW EXECUTE FUNCTION public.trg_attachment_resolve_visibility();

-- 4. Audit table
CREATE TABLE IF NOT EXISTS public.task_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  node_kind text NOT NULL CHECK (node_kind IN ('file','folder')),
  node_id uuid NOT NULL,
  node_label text,
  event_type text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  before jsonb,
  after jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_document_events_task ON public.task_document_events (task_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_document_events_node ON public.task_document_events (node_id, occurred_at DESC);

ALTER TABLE public.task_document_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Internal read doc events" ON public.task_document_events;
CREATE POLICY "Internal read doc events"
ON public.task_document_events
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'employee'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

DROP POLICY IF EXISTS "Internal insert doc events" ON public.task_document_events;
CREATE POLICY "Internal insert doc events"
ON public.task_document_events
FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'employee'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- Audit triggers
CREATE OR REPLACE FUNCTION public.trg_audit_task_document_folders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_document_events(task_id, node_kind, node_id, node_label, event_type, actor_id, after)
    VALUES (NEW.task_id, 'folder', NEW.id, NEW.path, 'created', _actor,
      jsonb_build_object('path', NEW.path, 'is_client_visible', NEW.is_client_visible));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.path IS DISTINCT FROM OLD.path THEN
      INSERT INTO public.task_document_events(task_id, node_kind, node_id, node_label, event_type, actor_id, before, after)
      VALUES (NEW.task_id, 'folder', NEW.id, NEW.path,
        CASE WHEN regexp_replace(OLD.path,'.*/','') IS DISTINCT FROM regexp_replace(NEW.path,'.*/','')
             AND regexp_replace(OLD.path,'/[^/]+$','') = regexp_replace(NEW.path,'/[^/]+$','')
             THEN 'renamed' ELSE 'moved' END,
        _actor,
        jsonb_build_object('path', OLD.path),
        jsonb_build_object('path', NEW.path));
    END IF;
    IF NEW.is_client_visible IS DISTINCT FROM OLD.is_client_visible THEN
      INSERT INTO public.task_document_events(task_id, node_kind, node_id, node_label, event_type, actor_id, before, after)
      VALUES (NEW.task_id, 'folder', NEW.id, NEW.path, 'visibility_changed', _actor,
        jsonb_build_object('is_client_visible', OLD.is_client_visible),
        jsonb_build_object('is_client_visible', NEW.is_client_visible));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.task_document_events(task_id, node_kind, node_id, node_label, event_type, actor_id, before)
    VALUES (OLD.task_id, 'folder', OLD.id, OLD.path, 'deleted', _actor,
      jsonb_build_object('path', OLD.path));
    RETURN OLD;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS task_document_folders_audit ON public.task_document_folders;
CREATE TRIGGER task_document_folders_audit
AFTER INSERT OR UPDATE OR DELETE ON public.task_document_folders
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_task_document_folders();

CREATE OR REPLACE FUNCTION public.trg_audit_task_attachments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    IF NEW.client_visible_override IS DISTINCT FROM OLD.client_visible_override
       OR NEW.is_client_visible IS DISTINCT FROM OLD.is_client_visible THEN
      INSERT INTO public.task_document_events(task_id, node_kind, node_id, node_label, event_type, actor_id, before, after)
      VALUES (NEW.task_id, 'file', NEW.id, NEW.filename, 'visibility_changed', _actor,
        jsonb_build_object('client_visible_override', OLD.client_visible_override, 'is_client_visible', OLD.is_client_visible),
        jsonb_build_object('client_visible_override', NEW.client_visible_override, 'is_client_visible', NEW.is_client_visible));
    END IF;
    IF NEW.archived_at IS DISTINCT FROM OLD.archived_at AND NEW.archived_at IS NOT NULL THEN
      INSERT INTO public.task_document_events(task_id, node_kind, node_id, node_label, event_type, actor_id, before, after)
      VALUES (NEW.task_id, 'file', NEW.id, NEW.filename, 'deleted', _actor,
        jsonb_build_object('archived_at', OLD.archived_at),
        jsonb_build_object('archived_at', NEW.archived_at));
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS task_attachments_audit_doc ON public.task_attachments;
CREATE TRIGGER task_attachments_audit_doc
AFTER INSERT OR UPDATE ON public.task_attachments
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_task_attachments();

-- 5. Allow clients to read shared folders for tasks in their firm
DROP POLICY IF EXISTS "Clients read shared task folders" ON public.task_document_folders;
CREATE POLICY "Clients read shared task folders"
ON public.task_document_folders
FOR SELECT
USING (
  is_client_visible = true
  AND EXISTS (
    SELECT 1
      FROM public.tasks t
      JOIN public.client_entities ce ON ce.id = t.entity_id
      JOIN public.projects p ON p.id = ce.project_id
     WHERE t.id = task_document_folders.task_id
       AND public.user_can_access_firm(p.firm_id)
  )
);

-- 6. Storage: allow clients to read task-attachments objects whose attachment row is shared with them
DROP POLICY IF EXISTS "Clients read shared task attachment objects" ON storage.objects;
CREATE POLICY "Clients read shared task attachment objects"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'task-attachments'
  AND EXISTS (
    SELECT 1
      FROM public.task_attachments a
      JOIN public.tasks t ON t.id = a.task_id
      JOIN public.client_entities ce ON ce.id = t.entity_id
      JOIN public.projects p ON p.id = ce.project_id
     WHERE a.storage_path = storage.objects.name
       AND a.is_client_visible = true
       AND a.archived_at IS NULL
       AND public.user_can_access_firm(p.firm_id)
  )
);

-- 7. Backfill: refresh resolved is_client_visible for all existing attachments
DO $$
DECLARE _t uuid;
BEGIN
  FOR _t IN SELECT DISTINCT task_id FROM public.task_attachments WHERE archived_at IS NULL LOOP
    PERFORM public.refresh_task_attachment_visibility(_t, NULL);
  END LOOP;
END $$;
