-- ── payroll_run_status enum ───────────────────────────────────────────────────
CREATE TYPE public.payroll_run_status AS ENUM (
  'draft', 'processing', 'approved', 'paid', 'cancelled'
);

-- ── payroll_runs ──────────────────────────────────────────────────────────────
-- One record per calendar month. Tracks the full lifecycle of a payroll run.
CREATE TABLE public.payroll_runs (
  id                  UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_period_year     INT                      NOT NULL,
  pay_period_month    INT                      NOT NULL CHECK (pay_period_month BETWEEN 1 AND 12),
  total_working_days  INT                      NOT NULL DEFAULT 0,
  status              public.payroll_run_status NOT NULL DEFAULT 'draft',
  computed_at         TIMESTAMPTZ,
  approved_at         TIMESTAMPTZ,
  approved_by         UUID,
  paid_at             TIMESTAMPTZ,
  paid_by             UUID,
  notes               TEXT,
  created_by          UUID                     NOT NULL,
  created_at          TIMESTAMPTZ              NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ              NOT NULL DEFAULT now(),
  UNIQUE (pay_period_year, pay_period_month)
);

ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_runs_manage"
  ON public.payroll_runs FOR ALL
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

CREATE INDEX payroll_runs_period_idx
  ON public.payroll_runs(pay_period_year DESC, pay_period_month DESC);

CREATE TRIGGER update_payroll_runs_updated_at
  BEFORE UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ── payroll_entries ───────────────────────────────────────────────────────────
-- One row per employee per payroll run — the computed result.
CREATE TABLE public.payroll_entries (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                UUID         NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id           UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  salary_structure_id   UUID         REFERENCES public.payroll_salary_structures(id) ON DELETE SET NULL,

  -- Attendance day counts
  total_working_days    NUMERIC(5,2) NOT NULL DEFAULT 0,
  present_days          NUMERIC(5,2) NOT NULL DEFAULT 0,
  half_days             NUMERIC(5,2) NOT NULL DEFAULT 0,
  absent_days           NUMERIC(5,2) NOT NULL DEFAULT 0,
  week_off_days         NUMERIC(5,2) NOT NULL DEFAULT 0,
  holiday_days          NUMERIC(5,2) NOT NULL DEFAULT 0,

  -- Leave days (from approved leave_requests)
  cl_days               NUMERIC(5,2) NOT NULL DEFAULT 0,
  sl_days               NUMERIC(5,2) NOT NULL DEFAULT 0,
  el_days               NUMERIC(5,2) NOT NULL DEFAULT 0,
  lwp_days              NUMERIC(5,2) NOT NULL DEFAULT 0,

  -- Computed pay
  paid_days             NUMERIC(5,2) NOT NULL DEFAULT 0,
  lop_deduction_days    NUMERIC(5,2) NOT NULL DEFAULT 0,

  -- Earnings
  -- [{name: string, monthly_amount: number, actual_amount: number}]
  earnings_breakdown    JSONB        NOT NULL DEFAULT '[]',
  gross_earnings        NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Deductions
  pf_employee           NUMERIC(12,2) NOT NULL DEFAULT 0,
  pf_employer           NUMERIC(12,2) NOT NULL DEFAULT 0,
  pt_amount             NUMERIC(12,2) NOT NULL DEFAULT 0,
  tds_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- [{name: string, amount: number}]
  other_deductions      JSONB        NOT NULL DEFAULT '[]',
  total_deductions      NUMERIC(12,2) NOT NULL DEFAULT 0,

  net_pay               NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Audit / override
  is_locked             BOOLEAN      NOT NULL DEFAULT false,
  override_notes        TEXT,
  computed_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),

  UNIQUE (run_id, employee_id)
);

ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_entries_manage"
  ON public.payroll_entries FOR ALL
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

CREATE INDEX payroll_entries_run_idx ON public.payroll_entries(run_id);
CREATE INDEX payroll_entries_employee_idx ON public.payroll_entries(employee_id, run_id);

CREATE TRIGGER update_payroll_entries_updated_at
  BEFORE UPDATE ON public.payroll_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
