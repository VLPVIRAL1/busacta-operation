-- 1. Header mapping presets
CREATE TABLE public.attendance_import_mapping_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  mapping jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX attendance_import_mapping_presets_one_default
  ON public.attendance_import_mapping_presets (is_default)
  WHERE is_default = true;

ALTER TABLE public.attendance_import_mapping_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR read mapping presets"
  ON public.attendance_import_mapping_presets
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  );

CREATE POLICY "HR manage mapping presets"
  ON public.attendance_import_mapping_presets
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  );

CREATE TRIGGER trg_mapping_presets_updated_at
  BEFORE UPDATE ON public.attendance_import_mapping_presets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Employee aliases for fuzzy / unmatched resolution memory
CREATE TABLE public.attendance_employee_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_code text NOT NULL DEFAULT '',
  raw_name text NOT NULL DEFAULT '',
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (raw_code, raw_name)
);

CREATE INDEX idx_attendance_employee_aliases_employee
  ON public.attendance_employee_aliases (employee_id);

ALTER TABLE public.attendance_employee_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR read employee aliases"
  ON public.attendance_employee_aliases
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  );

CREATE POLICY "HR manage employee aliases"
  ON public.attendance_employee_aliases
  FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'hr_manager'::app_role)
  );

-- 3. Link attendance_logs rows back to their import run (for "download imported rows")
ALTER TABLE public.attendance_logs
  ADD COLUMN import_run_id uuid REFERENCES public.attendance_import_runs(id) ON DELETE SET NULL;

CREATE INDEX idx_attendance_logs_import_run
  ON public.attendance_logs (import_run_id)
  WHERE import_run_id IS NOT NULL;
