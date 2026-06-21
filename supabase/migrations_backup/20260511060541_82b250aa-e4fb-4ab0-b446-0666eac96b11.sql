-- Petty cash transactions
CREATE INDEX IF NOT EXISTS idx_pct_entry_date ON public.petty_cash_transactions (entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_pct_account ON public.petty_cash_transactions (account_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_pct_holder ON public.petty_cash_transactions (holder_user_id, entry_date DESC);

-- Journal lines & entries
CREATE INDEX IF NOT EXISTS idx_jl_account ON public.journal_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_jl_entry ON public.journal_lines (entry_id);
CREATE INDEX IF NOT EXISTS idx_je_posted_at ON public.journal_entries (posted_at) WHERE posted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_je_entry_date ON public.journal_entries (entry_date DESC);

-- Chart of accounts
CREATE INDEX IF NOT EXISTS idx_coa_petty ON public.chart_of_accounts (enable_for_petty_cash) WHERE enable_for_petty_cash = true;
CREATE INDEX IF NOT EXISTS idx_coa_type_active ON public.chart_of_accounts (account_type, is_active);

-- Login events
CREATE INDEX IF NOT EXISTS idx_login_events_user_time ON public.login_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_events_created ON public.login_events (created_at DESC);

-- Attendance
CREATE INDEX IF NOT EXISTS idx_attendance_entries_emp_date ON public.attendance_entries (employee_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_date ON public.attendance_logs (entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_emp ON public.attendance_logs (matched_employee_id, entry_date DESC);

-- Page load telemetry table for the admin perf view
CREATE TABLE IF NOT EXISTS public.page_perf_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  route text NOT NULL,
  ttfb_ms integer,
  fcp_ms integer,
  load_ms integer,
  query_ms integer,
  render_ms integer,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ppe_route_time ON public.page_perf_events (route, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ppe_created ON public.page_perf_events (created_at DESC);

ALTER TABLE public.page_perf_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own perf events"
  ON public.page_perf_events FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Admins read perf events"
  ON public.page_perf_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins delete perf events"
  ON public.page_perf_events FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));