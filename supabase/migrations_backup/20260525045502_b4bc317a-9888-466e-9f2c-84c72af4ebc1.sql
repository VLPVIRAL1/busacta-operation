DROP TRIGGER IF EXISTS trg_prevent_project_code_change ON public.projects;
DROP FUNCTION IF EXISTS public.prevent_project_code_change_after_tasks();