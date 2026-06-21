-- Employee multi-manager: replace the single reports_to column with a
-- many-to-many junction table so one employee can report to several managers.

-- 1. Junction table
CREATE TABLE IF NOT EXISTS public.employee_managers (
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  manager_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, manager_id),
  CONSTRAINT no_self_report CHECK (employee_id <> manager_id)
);

-- 2. Seed from existing reports_to
INSERT INTO public.employee_managers (employee_id, manager_id)
SELECT id, reports_to
FROM public.profiles
WHERE reports_to IS NOT NULL
ON CONFLICT DO NOTHING;

-- 3. RLS — same roles that can manage HR can read/write
ALTER TABLE public.employee_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR managers can manage employee_managers"
  ON public.employee_managers
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'super_admin'::app_role) OR
    public.has_role(auth.uid(), 'hr_manager'::app_role) OR
    auth.uid() IS NULL  -- service role
  );

-- 4. Index for fast "who reports to manager X" lookups
CREATE INDEX IF NOT EXISTS employee_managers_manager_id_idx
  ON public.employee_managers (manager_id);
