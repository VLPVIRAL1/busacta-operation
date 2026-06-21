
-- Project code: require non-empty + lock after tasks exist + restrict change to capable users.

-- 1) Add CHECK NOT VALID so legacy null/invalid rows aren't broken.
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_code_format_check;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_code_format_check
  CHECK (code IS NULL OR (code ~ '^[A-Z0-9-]{2,12}$'))
  NOT VALID;

-- Validate format on existing non-null rows (won't error on nulls).
ALTER TABLE public.projects VALIDATE CONSTRAINT projects_code_format_check;

-- 2) Lock the code field once any task exists for the project.
CREATE OR REPLACE FUNCTION public.prevent_project_code_change_after_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN
    IF EXISTS (SELECT 1 FROM public.tasks WHERE project_id = OLD.id) THEN
      RAISE EXCEPTION 'Project code cannot be changed after tasks have been created (project %)', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
    -- Only firm members with manage capability (CEO/admin) can change.
    IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin')
            OR public.firm_member_can(NEW.firm_id, 'manage_projects')) THEN
      RAISE EXCEPTION 'Only the firm CEO/admin can change the project code'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_prevent_project_code_change ON public.projects;
CREATE TRIGGER trg_prevent_project_code_change
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.prevent_project_code_change_after_tasks();
