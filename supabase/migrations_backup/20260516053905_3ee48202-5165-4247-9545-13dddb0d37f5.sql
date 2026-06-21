
-- 1) Many-to-many assignees for task_action_items
CREATE TABLE IF NOT EXISTS public.task_action_item_assignees (
  item_id     uuid NOT NULL REFERENCES public.task_action_items(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_taia_user ON public.task_action_item_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_taia_item ON public.task_action_item_assignees(item_id);

ALTER TABLE public.task_action_item_assignees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taia_select" ON public.task_action_item_assignees;
CREATE POLICY "taia_select" ON public.task_action_item_assignees FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.task_action_items i
    WHERE i.id = item_id AND public.task_capability(i.task_id, 'can_view')
  ));

DROP POLICY IF EXISTS "taia_insert" ON public.task_action_item_assignees;
CREATE POLICY "taia_insert" ON public.task_action_item_assignees FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.task_action_items i
    WHERE i.id = item_id AND public.task_capability(i.task_id, 'can_edit')
  ));

DROP POLICY IF EXISTS "taia_delete" ON public.task_action_item_assignees;
CREATE POLICY "taia_delete" ON public.task_action_item_assignees FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.task_action_items i
    WHERE i.id = item_id AND public.task_capability(i.task_id, 'can_edit')
  ));

-- Backfill from existing single assignee_id
INSERT INTO public.task_action_item_assignees (item_id, user_id, assigned_at)
SELECT i.id, i.assignee_id, COALESCE(i.created_at, now())
FROM public.task_action_items i
WHERE i.assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2) Audit events for sub-tasks (mirrors task_action_item_events shape)
CREATE TABLE IF NOT EXISTS public.task_subtask_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subtask_id  uuid NOT NULL REFERENCES public.task_subtasks(id) ON DELETE CASCADE,
  task_id     uuid NOT NULL,
  actor_id    uuid,
  event       text NOT NULL,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tse_subtask ON public.task_subtask_events(subtask_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tse_task ON public.task_subtask_events(task_id, created_at DESC);

ALTER TABLE public.task_subtask_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subtask_events_select" ON public.task_subtask_events;
CREATE POLICY "subtask_events_select" ON public.task_subtask_events FOR SELECT
  USING (public.task_capability(task_id, 'can_view'));

CREATE OR REPLACE FUNCTION public.task_subtasks_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_subtask_events(subtask_id, task_id, actor_id, event, after)
    VALUES (NEW.id, NEW.task_id, _actor, 'created',
      jsonb_build_object('title', NEW.title, 'status', NEW.status, 'assignee_id', NEW.assignee_id, 'due_date', NEW.due_date));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      INSERT INTO public.task_subtask_events(subtask_id, task_id, actor_id, event, before, after)
      VALUES (NEW.id, NEW.task_id, _actor, 'title_changed',
        jsonb_build_object('title', OLD.title), jsonb_build_object('title', NEW.title));
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.task_subtask_events(subtask_id, task_id, actor_id, event, before, after)
      VALUES (NEW.id, NEW.task_id, _actor,
        CASE WHEN NEW.status::text = 'done' THEN 'completed'
             WHEN OLD.status::text = 'done' THEN 'reopened'
             ELSE 'status_changed' END,
        jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    END IF;
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
      INSERT INTO public.task_subtask_events(subtask_id, task_id, actor_id, event, before, after)
      VALUES (NEW.id, NEW.task_id, _actor, 'assigned',
        jsonb_build_object('assignee_id', OLD.assignee_id),
        jsonb_build_object('assignee_id', NEW.assignee_id));
    END IF;
    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      INSERT INTO public.task_subtask_events(subtask_id, task_id, actor_id, event, before, after)
      VALUES (NEW.id, NEW.task_id, _actor, 'due_changed',
        jsonb_build_object('due_date', OLD.due_date),
        jsonb_build_object('due_date', NEW.due_date));
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.task_subtask_events(subtask_id, task_id, actor_id, event, before)
    VALUES (OLD.id, OLD.task_id, _actor, 'deleted',
      jsonb_build_object('title', OLD.title, 'status', OLD.status));
    RETURN OLD;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_task_subtasks_audit ON public.task_subtasks;
CREATE TRIGGER trg_task_subtasks_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.task_subtasks
  FOR EACH ROW EXECUTE FUNCTION public.task_subtasks_audit();
