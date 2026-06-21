ALTER TABLE public.project_feature_toggles
  ADD COLUMN IF NOT EXISTS skip_entity_hierarchy boolean NOT NULL DEFAULT false;

ALTER TABLE public.firm_messages
  ADD COLUMN IF NOT EXISTS project_id uuid NULL;

CREATE INDEX IF NOT EXISTS firm_messages_project_id_idx
  ON public.firm_messages (project_id) WHERE project_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_project_default_entity(_project_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _entity_id uuid;
BEGIN
  SELECT id INTO _entity_id
  FROM public.client_entities
  WHERE project_id = _project_id AND name = '__project_default'
  LIMIT 1;

  IF _entity_id IS NULL THEN
    INSERT INTO public.client_entities (project_id, name, entity_type)
    VALUES (_project_id, '__project_default', 'individual')
    RETURNING id INTO _entity_id;
  END IF;

  RETURN _entity_id;
END;
$$;