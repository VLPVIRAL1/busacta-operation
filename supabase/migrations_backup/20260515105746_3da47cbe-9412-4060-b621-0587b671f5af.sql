-- 1. Add 'auditing' to project_type enum
ALTER TYPE public.project_type ADD VALUE IF NOT EXISTS 'auditing';

-- 2. Replace seed trigger so default skip flag follows project type
CREATE OR REPLACE FUNCTION public.seed_default_project_setup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _skip boolean := false;
BEGIN
  -- Tax Preparation flattens Project -> Task. Everything else keeps Project -> Entity -> Task.
  IF NEW.project_type = 'tax_preparation' THEN
    _skip := true;
  END IF;

  INSERT INTO public.project_feature_toggles (project_id, skip_entity_hierarchy)
  VALUES (NEW.id, _skip)
  ON CONFLICT (project_id) DO NOTHING;

  INSERT INTO public.project_task_options (project_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;

  IF _skip THEN
    PERFORM public.ensure_project_default_entity(NEW.id);
  END IF;

  RETURN NEW;
END $function$;

-- 3. Backfill: existing tax_preparation projects with no real entities yet
DO $$
DECLARE
  _p record;
BEGIN
  FOR _p IN
    SELECT p.id
    FROM public.projects p
    LEFT JOIN public.project_feature_toggles t ON t.project_id = p.id
    WHERE p.project_type = 'tax_preparation'
      AND COALESCE(t.skip_entity_hierarchy, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.client_entities ce
        WHERE ce.project_id = p.id AND ce.name <> '__project_default'
      )
  LOOP
    INSERT INTO public.project_feature_toggles (project_id, skip_entity_hierarchy)
    VALUES (_p.id, true)
    ON CONFLICT (project_id) DO UPDATE SET skip_entity_hierarchy = true;
    PERFORM public.ensure_project_default_entity(_p.id);
  END LOOP;
END $$;