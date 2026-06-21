-- 1. Move template from projects to tasks (tax_year already exists on tasks).
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS template public.template_type;

-- Backfill task.template and task.tax_year from parent project where null.
UPDATE public.tasks t
SET template = COALESCE(t.template, p.template),
    tax_year = COALESCE(t.tax_year, p.tax_year)
FROM public.client_entities ce
JOIN public.projects p ON p.id = ce.project_id
WHERE ce.id = t.entity_id
  AND (t.template IS NULL OR t.tax_year IS NULL);

-- Drop tax_year and template from projects (data preserved on tasks above).
ALTER TABLE public.projects DROP COLUMN IF EXISTS tax_year;
ALTER TABLE public.projects DROP COLUMN IF EXISTS template;

-- 2. task_subtasks: enforce unique contiguous sort_order per task.
-- Renumber existing rows first to satisfy the upcoming unique index.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY sort_order, created_at) AS rn
  FROM public.task_subtasks
)
UPDATE public.task_subtasks s
SET sort_order = r.rn
FROM ranked r
WHERE r.id = s.id AND s.sort_order <> r.rn;

CREATE UNIQUE INDEX IF NOT EXISTS task_subtasks_task_sort_uq
  ON public.task_subtasks(task_id, sort_order);

-- Renumber function: rewrites sort_order to 1..N contiguously per task.
CREATE OR REPLACE FUNCTION public.renumber_subtask_sort_order(_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Two-step rewrite to avoid colliding with the unique index mid-update.
  UPDATE public.task_subtasks
  SET sort_order = -sort_order
  WHERE task_id = _task_id;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY (-sort_order), created_at) AS rn
    FROM public.task_subtasks
    WHERE task_id = _task_id
  )
  UPDATE public.task_subtasks s
  SET sort_order = r.rn
  FROM ranked r
  WHERE r.id = s.id;
END;
$$;

-- AFTER trigger: normalize sort_order whenever rows change for a task.
-- pg_trigger_depth() guard prevents infinite recursion when the function
-- itself updates sort_order.
CREATE OR REPLACE FUNCTION public.trg_task_subtasks_normalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;
  affected := COALESCE(NEW.task_id, OLD.task_id);
  PERFORM public.renumber_subtask_sort_order(affected);
  -- If task_id was changed (rare), normalize the old task too.
  IF TG_OP = 'UPDATE' AND OLD.task_id IS DISTINCT FROM NEW.task_id THEN
    PERFORM public.renumber_subtask_sort_order(OLD.task_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS task_subtasks_normalize_after ON public.task_subtasks;
CREATE TRIGGER task_subtasks_normalize_after
AFTER INSERT OR UPDATE OR DELETE ON public.task_subtasks
FOR EACH ROW EXECUTE FUNCTION public.trg_task_subtasks_normalize();

-- BEFORE INSERT: auto-assign sort_order = max+1 when not provided.
CREATE OR REPLACE FUNCTION public.trg_task_subtasks_default_sort()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sort_order IS NULL OR NEW.sort_order <= 0 THEN
    SELECT COALESCE(MAX(sort_order), 0) + 1 INTO NEW.sort_order
    FROM public.task_subtasks
    WHERE task_id = NEW.task_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_subtasks_default_sort_before ON public.task_subtasks;
CREATE TRIGGER task_subtasks_default_sort_before
BEFORE INSERT ON public.task_subtasks
FOR EACH ROW EXECUTE FUNCTION public.trg_task_subtasks_default_sort();