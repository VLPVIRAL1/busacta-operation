-- ── payroll_salary_structures ─────────────────────────────────────────────────
-- Per-employee salary structure. Supports multiple effective periods.
-- other_components stores flexible earning/deduction rows as JSONB.
CREATE TABLE public.payroll_salary_structures (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  effective_from      DATE         NOT NULL,
  effective_to        DATE,
  basic_monthly       NUMERIC(12,2) NOT NULL DEFAULT 0,
  hra_monthly         NUMERIC(12,2) NOT NULL DEFAULT 0,
  ta_monthly          NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- [{name: string, amount: number, type: 'earning'|'deduction'}]
  other_components    JSONB        NOT NULL DEFAULT '[]',
  pf_applicable       BOOLEAN      NOT NULL DEFAULT false,
  pt_applicable       BOOLEAN      NOT NULL DEFAULT false,
  tds_monthly         NUMERIC(12,2) NOT NULL DEFAULT 0,
  ctc_monthly         NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes               TEXT,
  created_by          UUID         NOT NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_salary_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_structures_manage"
  ON public.payroll_salary_structures FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
    OR public.has_role(auth.uid(), 'finance_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
    OR public.has_role(auth.uid(), 'finance_manager')
  );

CREATE INDEX payroll_structures_employee_idx
  ON public.payroll_salary_structures(employee_id, effective_from DESC);

CREATE TRIGGER update_payroll_salary_structures_updated_at
  BEFORE UPDATE ON public.payroll_salary_structures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
