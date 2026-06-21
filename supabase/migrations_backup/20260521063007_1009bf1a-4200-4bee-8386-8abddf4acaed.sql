
-- 0. De-dup existing direct_clients so the unique index can be created.
UPDATE public.direct_clients
SET display_name = display_name || ' (' || substr(id::text, 1, 4) || ')'
WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY lower(display_name) ORDER BY created_at) AS rn
    FROM public.direct_clients
  ) t WHERE rn > 1
);

-- 1. Tasks: unique title within a project (CPA stream).
CREATE UNIQUE INDEX IF NOT EXISTS tasks_title_unique_per_project
  ON public.tasks (project_id, lower(title))
  WHERE project_id IS NOT NULL;

-- 2. Tasks: unique title within a direct client (Direct stream).
CREATE UNIQUE INDEX IF NOT EXISTS tasks_title_unique_per_direct_client
  ON public.tasks (direct_client_id, lower(title))
  WHERE direct_client_id IS NOT NULL;

-- 3. Clients / Groups: unique name per firm.
CREATE UNIQUE INDEX IF NOT EXISTS clients_name_unique_per_firm
  ON public.clients (firm_id, lower(name));

-- 4. Client Entities: unique name per project (ignore hidden default sentinel).
CREATE UNIQUE INDEX IF NOT EXISTS client_entities_name_unique_per_project
  ON public.client_entities (project_id, lower(name))
  WHERE name <> '__project_default';

-- 5. Projects: unique name per firm.
CREATE UNIQUE INDEX IF NOT EXISTS projects_name_unique_per_firm
  ON public.projects (firm_id, lower(name));

-- 6. Firms: unique name (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS firms_name_unique_ci
  ON public.firms (lower(name));

-- 7. Direct Clients: unique display_name (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS direct_clients_name_unique_ci
  ON public.direct_clients (lower(display_name));

-- 8. Cross-table guard: firm name <> any direct client display name.
CREATE OR REPLACE FUNCTION public.enforce_firm_directclient_name_unique()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_name text;
BEGIN
  IF TG_TABLE_NAME = 'firms' THEN
    new_name := lower(NEW.name);
    IF EXISTS (SELECT 1 FROM public.direct_clients WHERE lower(display_name) = new_name) THEN
      RAISE EXCEPTION 'A direct client with this name already exists' USING ERRCODE = '23505';
    END IF;
  ELSE
    new_name := lower(NEW.display_name);
    IF EXISTS (SELECT 1 FROM public.firms WHERE lower(name) = new_name) THEN
      RAISE EXCEPTION 'A firm with this name already exists' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_firms_name_no_directclient ON public.firms;
CREATE TRIGGER trg_firms_name_no_directclient
  BEFORE INSERT OR UPDATE OF name ON public.firms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_firm_directclient_name_unique();

DROP TRIGGER IF EXISTS trg_directclients_name_no_firm ON public.direct_clients;
CREATE TRIGGER trg_directclients_name_no_firm
  BEFORE INSERT OR UPDATE OF display_name ON public.direct_clients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_firm_directclient_name_unique();
