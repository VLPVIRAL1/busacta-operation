
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS is_employee boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_vendors_employee
  ON public.vendors (is_employee) WHERE is_employee = true;

ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS employee_vendor_id uuid
  REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jl_employee
  ON public.journal_lines (employee_vendor_id)
  WHERE employee_vendor_id IS NOT NULL;
