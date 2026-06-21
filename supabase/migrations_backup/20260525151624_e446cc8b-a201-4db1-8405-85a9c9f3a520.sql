ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS currency text;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_currency_check;

ALTER TABLE public.projects
  ADD CONSTRAINT projects_currency_check
  CHECK (currency IS NULL OR (currency = upper(currency) AND length(currency) = 3));

CREATE OR REPLACE FUNCTION public.project_effective_currency(_project_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p.currency, f.currency, 'USD')
  FROM public.projects p
  JOIN public.firms f ON f.id = p.firm_id
  WHERE p.id = _project_id
$$;