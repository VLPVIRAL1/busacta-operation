
-- ============================================================================
-- task_action_items: first-class checklist (Open Point / Clarification / Document Needed / Other)
-- with auto start_at = creation, auto end_at = completion, full audit trail.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.task_action_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title             text NOT NULL,
  kind              text NOT NULL DEFAULT 'open_point',
  status            text NOT NULL DEFAULT 'todo',
  is_client_visible boolean NOT NULL DEFAULT true,
  sort_order        int NOT NULL DEFAULT 0,
  start_at          timestamptz NOT NULL DEFAULT now(),
  end_at            timestamptz,
  assignee_id       uuid,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  completed_by      uuid,
  deleted_at        timestamptz,
  CONSTRAINT task_action_items_kind_chk CHECK (kind IN ('open_point','clarification','document_needed','other')),
  CONSTRAINT task_action_items_status_chk CHECK (status IN ('todo','in_progress','done')),
  CONSTRAINT task_action_items_title_len CHECK (char_length(btrim(title)) >= 3)
);

CREATE INDEX IF NOT EXISTS idx_task_action_items_task ON public.task_action_items(task_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_action_items_status ON public.task_action_items(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_action_items_assignee ON public.task_action_items(assignee_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.task_action_item_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.task_action_items(id) ON DELETE CASCADE,
  task_id     uuid NOT NULL,
  actor_id    uuid,
  event       text NOT NULL,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_action_item_events_item ON public.task_action_item_events(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_action_item_events_task ON public.task_action_item_events(task_id, created_at DESC);

-- ---- Triggers ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.task_action_items_before_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.start_at IS NULL THEN NEW.start_at := now(); END IF;
  IF NEW.created_by IS NULL THEN NEW.created_by := auth.uid(); END IF;
  IF NEW.status = 'done' AND NEW.end_at IS NULL THEN
    NEW.end_at := now();
    IF NEW.completed_by IS NULL THEN NEW.completed_by := auth.uid(); END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.task_action_items_before_upd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'done' THEN
      IF NEW.end_at IS NULL THEN NEW.end_at := now(); END IF;
      IF NEW.completed_by IS NULL THEN NEW.completed_by := auth.uid(); END IF;
    ELSE
      -- Moving away from done: clear end_at only if user didn't manually edit it in this update
      IF OLD.status = 'done' AND NEW.end_at IS NOT DISTINCT FROM OLD.end_at THEN
        NEW.end_at := NULL;
        NEW.completed_by := NULL;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.task_action_items_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_action_item_events(item_id, task_id, actor_id, event, after)
    VALUES (NEW.id, NEW.task_id, _actor, 'created',
      jsonb_build_object('title', NEW.title, 'kind', NEW.kind, 'status', NEW.status, 'assignee_id', NEW.assignee_id, 'start_at', NEW.start_at, 'end_at', NEW.end_at));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      INSERT INTO public.task_action_item_events(item_id, task_id, actor_id, event, before, after)
      VALUES (NEW.id, NEW.task_id, _actor, 'title_changed', jsonb_build_object('title', OLD.title), jsonb_build_object('title', NEW.title));
    END IF;
    IF NEW.kind IS DISTINCT FROM OLD.kind THEN
      INSERT INTO public.task_action_item_events(item_id, task_id, actor_id, event, before, after)
      VALUES (NEW.id, NEW.task_id, _actor, 'kind_changed', jsonb_build_object('kind', OLD.kind), jsonb_build_object('kind', NEW.kind));
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.task_action_item_events(item_id, task_id, actor_id, event, before, after)
      VALUES (NEW.id, NEW.task_id, _actor,
        CASE WHEN NEW.status = 'done' THEN 'completed' WHEN OLD.status = 'done' THEN 'reopened' ELSE 'status_changed' END,
        jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    END IF;
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
      INSERT INTO public.task_action_item_events(item_id, task_id, actor_id, event, before, after)
      VALUES (NEW.id, NEW.task_id, _actor, 'assigned', jsonb_build_object('assignee_id', OLD.assignee_id), jsonb_build_object('assignee_id', NEW.assignee_id));
    END IF;
    IF NEW.start_at IS DISTINCT FROM OLD.start_at THEN
      INSERT INTO public.task_action_item_events(item_id, task_id, actor_id, event, before, after)
      VALUES (NEW.id, NEW.task_id, _actor, 'start_changed', jsonb_build_object('start_at', OLD.start_at), jsonb_build_object('start_at', NEW.start_at));
    END IF;
    IF NEW.end_at IS DISTINCT FROM OLD.end_at THEN
      INSERT INTO public.task_action_item_events(item_id, task_id, actor_id, event, before, after)
      VALUES (NEW.id, NEW.task_id, _actor, 'end_changed', jsonb_build_object('end_at', OLD.end_at), jsonb_build_object('end_at', NEW.end_at));
    END IF;
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      INSERT INTO public.task_action_item_events(item_id, task_id, actor_id, event, before, after)
      VALUES (NEW.id, NEW.task_id, _actor,
        CASE WHEN NEW.deleted_at IS NOT NULL THEN 'deleted' ELSE 'restored' END,
        jsonb_build_object('deleted_at', OLD.deleted_at), jsonb_build_object('deleted_at', NEW.deleted_at));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_task_action_items_bi ON public.task_action_items;
CREATE TRIGGER trg_task_action_items_bi BEFORE INSERT ON public.task_action_items
  FOR EACH ROW EXECUTE FUNCTION public.task_action_items_before_ins();

DROP TRIGGER IF EXISTS trg_task_action_items_bu ON public.task_action_items;
CREATE TRIGGER trg_task_action_items_bu BEFORE UPDATE ON public.task_action_items
  FOR EACH ROW EXECUTE FUNCTION public.task_action_items_before_upd();

DROP TRIGGER IF EXISTS trg_task_action_items_audit ON public.task_action_items;
CREATE TRIGGER trg_task_action_items_audit AFTER INSERT OR UPDATE ON public.task_action_items
  FOR EACH ROW EXECUTE FUNCTION public.task_action_items_audit();

-- ---- RLS ---------------------------------------------------------------------

ALTER TABLE public.task_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_action_item_events ENABLE ROW LEVEL SECURITY;

-- Mirror task_subtasks: anyone with read access to the parent task can read; write requires task capability.
DROP POLICY IF EXISTS "action_items_select" ON public.task_action_items;
CREATE POLICY "action_items_select" ON public.task_action_items FOR SELECT
  USING (public.task_capability(task_id, 'can_view'));

DROP POLICY IF EXISTS "action_items_insert" ON public.task_action_items;
CREATE POLICY "action_items_insert" ON public.task_action_items FOR INSERT
  WITH CHECK (public.task_capability(task_id, 'can_edit'));

DROP POLICY IF EXISTS "action_items_update" ON public.task_action_items;
CREATE POLICY "action_items_update" ON public.task_action_items FOR UPDATE
  USING (public.task_capability(task_id, 'can_edit'))
  WITH CHECK (public.task_capability(task_id, 'can_edit'));

DROP POLICY IF EXISTS "action_items_delete" ON public.task_action_items;
CREATE POLICY "action_items_delete" ON public.task_action_items FOR DELETE
  USING (public.task_capability(task_id, 'can_edit'));

DROP POLICY IF EXISTS "action_item_events_select" ON public.task_action_item_events;
CREATE POLICY "action_item_events_select" ON public.task_action_item_events FOR SELECT
  USING (public.task_capability(task_id, 'can_view'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_action_items;

-- ---- Backfill from task_messages.is_open_point -------------------------------

INSERT INTO public.task_action_items (task_id, title, kind, status, is_client_visible, start_at, end_at, assignee_id, created_by, created_at, completed_by)
SELECT
  m.task_id,
  CASE
    WHEN char_length(btrim(split_part(m.body, E'\n', 1))) >= 3
      THEN left(btrim(split_part(m.body, E'\n', 1)), 200)
    ELSE left(btrim(m.body), 200)
  END AS title,
  'open_point',
  COALESCE(m.open_point_status, 'todo'),
  COALESCE(m.is_client_visible, true),
  m.created_at,
  m.open_point_done_at,
  m.open_point_assignee_id,
  m.author_id,
  m.created_at,
  m.open_point_done_by
FROM public.task_messages m
WHERE m.is_open_point = true
  AND m.deleted_at IS NULL
  AND char_length(btrim(COALESCE(m.body, ''))) >= 3
  AND NOT EXISTS (
    SELECT 1 FROM public.task_action_items a
    WHERE a.task_id = m.task_id
      AND a.created_at = m.created_at
  );
