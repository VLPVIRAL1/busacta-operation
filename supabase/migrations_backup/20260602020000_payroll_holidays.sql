-- ── payroll_holidays ──────────────────────────────────────────────────────────
-- Company holiday calendar. Mandatory holidays exclude days from working day count.
-- Optional holidays are displayed but do not auto-deduct.
CREATE TABLE public.payroll_holidays (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date  DATE        NOT NULL,
  name          TEXT        NOT NULL,
  is_optional   BOOLEAN     NOT NULL DEFAULT false,
  created_by    UUID        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (holiday_date)
);

ALTER TABLE public.payroll_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_holidays_read"
  ON public.payroll_holidays FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
    OR public.has_role(auth.uid(), 'finance_manager')
  );

CREATE POLICY "payroll_holidays_manage"
  ON public.payroll_holidays FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE INDEX payroll_holidays_date_idx ON public.payroll_holidays(holiday_date);
