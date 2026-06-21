-- Readable slug URLs for projects → entities → tasks
--
-- Replaces UUID-addressed detail pages (/ops/projects/<uuid>) with human
-- readable links (/projects/<project-slug>/<entity-slug>/<task-slug> and a flat
-- /tasks/<task-slug> fallback). To support that we add a stable, unique `slug`
-- to each table.
--
-- Design notes:
--  * Slugs are generated ONCE on insert (BEFORE INSERT trigger) and never
--    regenerated on rename — renaming a project must not break shared links.
--  * Uniqueness scope: projects.slug is GLOBAL; client_entities.slug is unique
--    per project; tasks.slug is GLOBAL (the flat /tasks/<slug> route has no
--    project/entity context to scope by).
--  * Collisions disambiguate meaningfully — name → name-<year> →
--    name-<project-fragment> (tasks) → name-<short-id> → name-N — instead of an
--    arbitrary -2/-3.
--  * Existing RLS on these tables is unchanged; slug is just another column.

-- ---------------------------------------------------------------------------
-- 1. slugify(): kebab-case, ascii, trimmed, length-capped
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.slugify(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  -- lowercase, collapse any run of non [a-z0-9] into a single dash, trim dashes,
  -- cap to 60 chars, then re-trim any dash left dangling by the cut.
  SELECT trim(BOTH '-' FROM
    left(
      trim(BOTH '-' FROM regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g')),
      60
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. pick_unique_slug(): first free candidate, else <first>-N
-- ---------------------------------------------------------------------------
-- Tries each meaningful candidate in order and returns the first that is free
-- within the given scope. If every candidate is taken it falls back to a numeric
-- suffix on the first candidate, guaranteeing a unique result. Used by both the
-- one-time backfill and the insert triggers so behaviour is identical.
CREATE OR REPLACE FUNCTION public.pick_unique_slug(
  p_table       regclass,
  p_scope_col   text,   -- column to scope uniqueness by, or NULL for global
  p_scope_val   uuid,
  p_candidates  text[]
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  cand         text;
  base         text;
  n            int := 2;
  hit          int;
  scope_clause text;
BEGIN
  scope_clause := CASE
    WHEN p_scope_col IS NULL THEN ''
    ELSE format(' AND %I IS NOT DISTINCT FROM %L', p_scope_col, p_scope_val)
  END;

  FOREACH cand IN ARRAY p_candidates LOOP
    IF cand IS NULL OR cand = '' THEN CONTINUE; END IF;
    EXECUTE format('SELECT count(*) FROM %s WHERE slug = %L%s', p_table, cand, scope_clause)
      INTO hit;
    IF hit = 0 THEN RETURN cand; END IF;
  END LOOP;

  base := coalesce(nullif(p_candidates[1], ''), 'item');
  LOOP
    cand := base || '-' || n;
    EXECUTE format('SELECT count(*) FROM %s WHERE slug = %L%s', p_table, cand, scope_clause)
      INTO hit;
    IF hit = 0 THEN RETURN cand; END IF;
    n := n + 1;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Columns (nullable for now; backfilled then set NOT NULL below)
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects        ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.client_entities ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.tasks           ADD COLUMN IF NOT EXISTS slug text;

-- ---------------------------------------------------------------------------
-- 4. Backfill existing rows (deterministic order so older rows win the clean slug)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r    record;
  base text;
  yr   text;
BEGIN
  -- Projects (global scope)
  FOR r IN SELECT id, name, created_at FROM public.projects WHERE slug IS NULL ORDER BY created_at, id LOOP
    base := public.slugify(r.name);
    IF base = '' THEN base := left(r.id::text, 8); END IF;
    yr := extract(year FROM coalesce(r.created_at, now()))::text;
    UPDATE public.projects SET slug = public.pick_unique_slug(
      'public.projects'::regclass, NULL, NULL,
      ARRAY[base, base || '-' || yr, base || '-' || left(r.id::text, 4)]
    ) WHERE id = r.id;
  END LOOP;

  -- Entities (scoped per project)
  FOR r IN SELECT id, name, project_id FROM public.client_entities WHERE slug IS NULL ORDER BY created_at, id LOOP
    base := public.slugify(r.name);
    IF base = '' THEN base := left(r.id::text, 8); END IF;
    UPDATE public.client_entities SET slug = public.pick_unique_slug(
      'public.client_entities'::regclass, 'project_id', r.project_id,
      ARRAY[base, base || '-' || left(r.id::text, 4)]
    ) WHERE id = r.id;
  END LOOP;

  -- Tasks (global scope, project fragment for meaningful disambiguation)
  FOR r IN
    SELECT t.id, t.title, t.created_at, left(public.slugify(p.name), 8) AS pfrag
    FROM public.tasks t
    LEFT JOIN public.projects p ON p.id = t.project_id
    WHERE t.slug IS NULL
    ORDER BY t.created_at, t.id
  LOOP
    base := public.slugify(r.title);
    IF base = '' THEN base := left(r.id::text, 8); END IF;
    yr := extract(year FROM coalesce(r.created_at, now()))::text;
    UPDATE public.tasks SET slug = public.pick_unique_slug(
      'public.tasks'::regclass, NULL, NULL,
      ARRAY[
        base,
        CASE WHEN coalesce(r.pfrag, '') <> '' THEN base || '-' || r.pfrag END,
        base || '-' || yr,
        base || '-' || left(r.id::text, 4)
      ]
    ) WHERE id = r.id;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Insert triggers — same progression as the backfill; stable on update
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_project_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base text; yr text;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN RETURN NEW; END IF;
  base := public.slugify(NEW.name);
  IF base = '' THEN base := left(NEW.id::text, 8); END IF;
  yr := extract(year FROM coalesce(NEW.created_at, now()))::text;
  NEW.slug := public.pick_unique_slug(
    'public.projects'::regclass, NULL, NULL,
    ARRAY[base, base || '-' || yr, base || '-' || left(NEW.id::text, 4)]
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_entity_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base text;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN RETURN NEW; END IF;
  base := public.slugify(NEW.name);
  IF base = '' THEN base := left(NEW.id::text, 8); END IF;
  NEW.slug := public.pick_unique_slug(
    'public.client_entities'::regclass, 'project_id', NEW.project_id,
    ARRAY[base, base || '-' || left(NEW.id::text, 4)]
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_task_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE base text; yr text; pfrag text;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN RETURN NEW; END IF;
  base := public.slugify(NEW.title);
  IF base = '' THEN base := left(NEW.id::text, 8); END IF;
  yr := extract(year FROM coalesce(NEW.created_at, now()))::text;
  SELECT left(public.slugify(p.name), 8) INTO pfrag FROM public.projects p WHERE p.id = NEW.project_id;
  NEW.slug := public.pick_unique_slug(
    'public.tasks'::regclass, NULL, NULL,
    ARRAY[
      base,
      CASE WHEN coalesce(pfrag, '') <> '' THEN base || '-' || pfrag END,
      base || '-' || yr,
      base || '-' || left(NEW.id::text, 4)
    ]
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_project_slug ON public.projects;
CREATE TRIGGER trg_set_project_slug BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_project_slug();

DROP TRIGGER IF EXISTS trg_set_entity_slug ON public.client_entities;
CREATE TRIGGER trg_set_entity_slug BEFORE INSERT ON public.client_entities
  FOR EACH ROW EXECUTE FUNCTION public.set_entity_slug();

DROP TRIGGER IF EXISTS trg_set_task_slug ON public.tasks;
CREATE TRIGGER trg_set_task_slug BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_task_slug();

-- ---------------------------------------------------------------------------
-- 6. Unique indexes (the enforcement) + NOT NULL
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_slug        ON public.projects (slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_entities_slug ON public.client_entities (project_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_slug           ON public.tasks (slug);

ALTER TABLE public.projects        ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.client_entities ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.tasks           ALTER COLUMN slug SET NOT NULL;
