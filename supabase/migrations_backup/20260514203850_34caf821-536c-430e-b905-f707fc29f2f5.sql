
-- Blueprint: ONE project per invoice. Multi-project consolidation is forbidden.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_invoices_project ON public.invoices(project_id);

-- Backfill legacy rows: if the firm has exactly one project, link it.
UPDATE public.invoices i
SET project_id = p.id
FROM public.projects p
WHERE i.project_id IS NULL
  AND i.firm_id IS NOT NULL
  AND p.firm_id = i.firm_id
  AND (SELECT count(*) FROM public.projects pp WHERE pp.firm_id = i.firm_id) = 1;

-- Enforce: project_id required on new invoices and must belong to the same firm.
CREATE OR REPLACE FUNCTION public.enforce_invoice_one_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _firm uuid;
BEGIN
  IF NEW.project_id IS NULL THEN
    RAISE EXCEPTION 'invoices.project_id is required (one project per invoice)';
  END IF;
  SELECT firm_id INTO _firm FROM public.projects WHERE id = NEW.project_id;
  IF _firm IS NULL THEN
    RAISE EXCEPTION 'invoices.project_id references unknown project';
  END IF;
  IF NEW.firm_id IS NULL THEN
    NEW.firm_id := _firm;
  ELSIF NEW.firm_id <> _firm THEN
    RAISE EXCEPTION 'invoices.project_id (% / firm %) does not belong to invoices.firm_id (%)',
      NEW.project_id, _firm, NEW.firm_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoices_one_project ON public.invoices;
CREATE TRIGGER trg_invoices_one_project
BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_one_project();
