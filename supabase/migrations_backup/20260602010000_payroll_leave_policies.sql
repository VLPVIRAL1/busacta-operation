-- ── payroll_leave_policies ────────────────────────────────────────────────────
-- Per-employee leave quota per calendar year. Completely independent per person.
CREATE TABLE public.payroll_leave_policies (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id             UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  policy_year             INT          NOT NULL,
  cl_quota                NUMERIC(5,2) NOT NULL DEFAULT 12,
  sl_quota                NUMERIC(5,2) NOT NULL DEFAULT 12,
  el_quota                NUMERIC(5,2) NOT NULL DEFAULT 15,
  -- Maps leave_requests.type → payroll category (cl/sl/el/lwp)
  leave_type_map          JSONB        NOT NULL DEFAULT '{"vacation":"el","sick":"sl","personal":"cl","unpaid":"lwp","bereavement":"cl","other":"cl"}',
  el_carry_forward_max    NUMERIC(5,2) NOT NULL DEFAULT 30,
  cl_carry_forward_max    NUMERIC(5,2) NOT NULL DEFAULT 0,
  sl_carry_forward_max    NUMERIC(5,2) NOT NULL DEFAULT 0,
  cl_opening_balance      NUMERIC(5,2) NOT NULL DEFAULT 0,
  sl_opening_balance      NUMERIC(5,2) NOT NULL DEFAULT 0,
  el_opening_balance      NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_by              UUID         NOT NULL,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (employee_id, policy_year)
);

ALTER TABLE public.payroll_leave_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_leave_policies_manage"
  ON public.payroll_leave_policies FOR ALL
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

CREATE INDEX payroll_leave_policies_employee_year_idx
  ON public.payroll_leave_policies(employee_id, policy_year DESC);

CREATE TRIGGER update_payroll_leave_policies_updated_at
  BEFORE UPDATE ON public.payroll_leave_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ── payroll_leave_balances ────────────────────────────────────────────────────
-- Running leave balance per employee per year per category.
CREATE TABLE public.payroll_leave_balances (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_year     INT          NOT NULL,
  leave_category   TEXT         NOT NULL CHECK (leave_category IN ('cl', 'sl', 'el')),
  opening_balance  NUMERIC(5,2) NOT NULL DEFAULT 0,
  accrued          NUMERIC(5,2) NOT NULL DEFAULT 0,
  consumed         NUMERIC(5,2) NOT NULL DEFAULT 0,
  adjusted         NUMERIC(5,2) NOT NULL DEFAULT 0,
  closing_balance  NUMERIC(5,2) GENERATED ALWAYS AS
    (opening_balance + accrued - consumed + adjusted) STORED,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (employee_id, balance_year, leave_category)
);

ALTER TABLE public.payroll_leave_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_leave_balances_manage"
  ON public.payroll_leave_balances FOR ALL
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

CREATE INDEX payroll_leave_balances_employee_idx
  ON public.payroll_leave_balances(employee_id, balance_year, leave_category);
