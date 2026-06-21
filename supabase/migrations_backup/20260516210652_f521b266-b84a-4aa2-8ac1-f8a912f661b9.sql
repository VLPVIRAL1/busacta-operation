-- 1) Project code (CEO-set, required to create tasks with auto-ID)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS code text;
CREATE UNIQUE INDEX IF NOT EXISTS projects_code_unique_per_firm
  ON public.projects (firm_id, upper(code)) WHERE code IS NOT NULL;

-- 2) Per-project task counter
CREATE TABLE IF NOT EXISTS public.project_task_counters (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  next_seq integer NOT NULL DEFAULT 1
);
ALTER TABLE public.project_task_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "internal read counters"
  ON public.project_task_counters FOR SELECT TO authenticated
  USING (public.is_internal_user_id(auth.uid()));

-- 3) Denormalized project_id on tasks (kept in sync by trigger)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS display_id text;

-- Backfill project_id for existing tasks
UPDATE public.tasks t
   SET project_id = p.id
  FROM public.client_entities ce
  JOIN public.projects p ON p.id = ce.project_id
 WHERE ce.id = t.entity_id AND t.project_id IS NULL;

CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON public.tasks(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS tasks_display_id_unique_per_project
  ON public.tasks (project_id, display_id) WHERE display_id IS NOT NULL;

-- Trigger to set project_id + assign display_id
CREATE OR REPLACE FUNCTION public.assign_task_display_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _project_id uuid;
  _code text;
  _seq int;
BEGIN
  SELECT p.id, p.code INTO _project_id, _code
    FROM public.client_entities ce
    JOIN public.projects p ON p.id = ce.project_id
    WHERE ce.id = NEW.entity_id
    LIMIT 1;

  IF _project_id IS NULL THEN RETURN NEW; END IF;
  NEW.project_id := _project_id;

  IF NEW.display_id IS NOT NULL THEN RETURN NEW; END IF;

  IF _code IS NULL OR length(trim(_code)) = 0 THEN
    RAISE EXCEPTION 'Project code is not set. The CEO must assign a project code in Firm Hub before tasks can be created.'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.project_task_counters(project_id, next_seq)
    VALUES (_project_id, 1)
    ON CONFLICT (project_id) DO NOTHING;

  UPDATE public.project_task_counters
     SET next_seq = next_seq + 1
   WHERE project_id = _project_id
   RETURNING next_seq - 1 INTO _seq;

  NEW.display_id := upper(trim(_code)) || '-' || lpad(_seq::text, 4, '0');
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_assign_task_display_id ON public.tasks;
CREATE TRIGGER trg_assign_task_display_id
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.assign_task_display_id();

-- 4) task_my_day (personal pin, Microsoft To-Do style)
CREATE TABLE IF NOT EXISTS public.task_my_day (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT current_date,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS task_my_day_unique_active
  ON public.task_my_day(task_id, user_id, day)
  WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS task_my_day_user_active
  ON public.task_my_day(user_id, day) WHERE removed_at IS NULL;

ALTER TABLE public.task_my_day ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own my_day"
  ON public.task_my_day FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Users insert own my_day"
  ON public.task_my_day FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own my_day"
  ON public.task_my_day FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own my_day"
  ON public.task_my_day FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Audit trigger -> task_audit
CREATE OR REPLACE FUNCTION public.task_my_day_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.task_audit(task_id, actor_id, event_type, payload)
      VALUES (NEW.task_id, auth.uid(), 'my_day_added',
        jsonb_build_object('user_id', NEW.user_id, 'day', NEW.day));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.removed_at IS NOT NULL AND OLD.removed_at IS NULL THEN
    INSERT INTO public.task_audit(task_id, actor_id, event_type, payload)
      VALUES (NEW.task_id, auth.uid(), 'my_day_removed',
        jsonb_build_object('user_id', NEW.user_id, 'day', NEW.day));
    RETURN NEW;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_task_my_day_audit ON public.task_my_day;
CREATE TRIGGER trg_task_my_day_audit
  AFTER INSERT OR UPDATE ON public.task_my_day
  FOR EACH ROW EXECUTE FUNCTION public.task_my_day_audit();