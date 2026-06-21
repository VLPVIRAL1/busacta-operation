-- 0. Loosen the project-code guard: allow setting a code when there isn't one yet.
--    Still blocks renaming a code after tasks exist.
CREATE OR REPLACE FUNCTION public.prevent_project_code_change_after_tasks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.code IS DISTINCT FROM NEW.code
     AND OLD.code IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.tasks t WHERE t.project_id = NEW.id) THEN
    RAISE EXCEPTION 'Project code cannot be changed after tasks have been created (project %)', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- 1. Column
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS firm_identifier text;

-- 2. Normalize trigger
CREATE OR REPLACE FUNCTION public.firms_normalize_identifier()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.firm_identifier IS NOT NULL THEN
    NEW.firm_identifier := upper(btrim(NEW.firm_identifier));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_firms_normalize_identifier ON public.firms;
CREATE TRIGGER trg_firms_normalize_identifier
BEFORE INSERT OR UPDATE OF firm_identifier ON public.firms
FOR EACH ROW EXECUTE FUNCTION public.firms_normalize_identifier();

-- 3. Backfill firms
DO $$
DECLARE
  r RECORD;
  base text;
  candidate text;
  n int;
  stopwords text[] := ARRAY['LLC','LLP','INC','CO','COMPANY','GROUP','AND','OF','THE','PC','PA','CPA','CPAS','LTD','LIMITED','CORP','CORPORATION'];
  words text[];
  w text;
  initials text;
  first_word text;
BEGIN
  FOR r IN SELECT id, name FROM public.firms WHERE firm_identifier IS NULL OR firm_identifier = '' LOOP
    words := regexp_split_to_array(
      btrim(regexp_replace(upper(coalesce(r.name,'')), '[^A-Z0-9 ]+', ' ', 'g')),
      '\s+'
    );
    initials := '';
    first_word := NULL;
    FOREACH w IN ARRAY words LOOP
      IF length(w) = 0 THEN CONTINUE; END IF;
      IF w = ANY(stopwords) THEN CONTINUE; END IF;
      IF first_word IS NULL THEN first_word := w; END IF;
      initials := initials || substr(w, 1, 1);
      EXIT WHEN length(initials) >= 5;
    END LOOP;

    IF length(initials) < 2 THEN
      IF first_word IS NOT NULL AND length(first_word) >= 2 THEN
        base := substr(first_word, 1, 3);
      ELSE
        base := 'FRM';
      END IF;
    ELSE
      base := initials;
    END IF;

    base := substr(base, 1, 10);
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM public.firms f WHERE upper(f.firm_identifier) = candidate AND f.id <> r.id) LOOP
      n := n + 1;
      candidate := substr(base, 1, greatest(2, 10 - length(n::text))) || n::text;
    END LOOP;

    UPDATE public.firms SET firm_identifier = candidate WHERE id = r.id;
  END LOOP;
END$$;

-- 4. Backfill projects.code where null
DO $$
DECLARE
  r RECORD;
  base text;
  candidate text;
  n int;
BEGIN
  FOR r IN SELECT id, firm_id, name FROM public.projects WHERE code IS NULL OR code = '' LOOP
    base := upper(regexp_replace(coalesce(r.name,''), '[^A-Za-z0-9]+', '', 'g'));
    IF length(base) < 2 THEN base := 'PRJ'; END IF;
    base := substr(base, 1, 6);
    candidate := base;
    n := 1;
    WHILE EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.firm_id = r.firm_id
        AND upper(p.code) = candidate
        AND p.id <> r.id
    ) LOOP
      n := n + 1;
      candidate := substr(base, 1, greatest(2, 12 - length(n::text))) || n::text;
    END LOOP;
    UPDATE public.projects SET code = candidate WHERE id = r.id;
  END LOOP;
END$$;

-- 5. Enforce
ALTER TABLE public.firms
  ADD CONSTRAINT firms_firm_identifier_format
  CHECK (firm_identifier ~ '^[A-Z0-9]{2,10}$');

ALTER TABLE public.firms ALTER COLUMN firm_identifier SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS firms_firm_identifier_unique
  ON public.firms (upper(firm_identifier));
