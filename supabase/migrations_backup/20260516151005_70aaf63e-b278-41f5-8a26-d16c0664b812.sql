-- Start / Due as timestamptz
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS start_date timestamptz;

ALTER TABLE public.tasks
  ALTER COLUMN due_date TYPE timestamptz USING due_date::timestamptz;

-- Link firm Master Entities (clients) to project-scoped client_entities
ALTER TABLE public.client_entities
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS client_entities_project_client_uk
  ON public.client_entities (project_id, client_id)
  WHERE client_id IS NOT NULL;

-- Helper: ensure a client_entities row exists for a given (project, firm-client)
CREATE OR REPLACE FUNCTION public.ensure_entity_for_firm_client(_project_id uuid, _client_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _entity_id uuid;
  _name text;
BEGIN
  IF _project_id IS NULL OR _client_id IS NULL THEN
    RAISE EXCEPTION 'project_id and client_id required';
  END IF;

  SELECT id INTO _entity_id
    FROM public.client_entities
   WHERE project_id = _project_id AND client_id = _client_id
   LIMIT 1;

  IF _entity_id IS NOT NULL THEN
    RETURN _entity_id;
  END IF;

  SELECT name INTO _name FROM public.clients WHERE id = _client_id;
  IF _name IS NULL THEN
    RAISE EXCEPTION 'client % not found', _client_id;
  END IF;

  INSERT INTO public.client_entities (project_id, name, entity_type, client_id)
  VALUES (_project_id, _name, 'individual', _client_id)
  RETURNING id INTO _entity_id;

  RETURN _entity_id;
END;
$$;