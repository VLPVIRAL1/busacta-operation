
CREATE TABLE public.attendance_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  file_size bigint,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  total_rows integer NOT NULL DEFAULT 0,
  inserted_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  mapping jsonb,
  notes text,
  parent_run_id uuid REFERENCES public.attendance_import_runs(id) ON DELETE SET NULL,
  created_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX idx_attendance_import_runs_started ON public.attendance_import_runs (started_at DESC);
CREATE INDEX idx_attendance_import_runs_creator ON public.attendance_import_runs (created_by);

CREATE TABLE public.attendance_import_row_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.attendance_import_runs(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  employee_name text,
  entry_date date,
  error_message text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendance_import_row_errors_run ON public.attendance_import_row_errors (run_id);

ALTER TABLE public.attendance_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_import_row_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR read import runs" ON public.attendance_import_runs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'hr_manager'));

CREATE POLICY "HR insert import runs" ON public.attendance_import_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'hr_manager'));

CREATE POLICY "HR update import runs" ON public.attendance_import_runs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'hr_manager'));

CREATE POLICY "HR delete import runs" ON public.attendance_import_runs
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'hr_manager'));

CREATE POLICY "HR read row errors" ON public.attendance_import_row_errors
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'hr_manager'));

CREATE POLICY "HR insert row errors" ON public.attendance_import_row_errors
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'hr_manager'));

CREATE POLICY "HR update row errors" ON public.attendance_import_row_errors
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'hr_manager'));

CREATE POLICY "HR delete row errors" ON public.attendance_import_row_errors
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'hr_manager'));
