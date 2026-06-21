
CREATE TYPE public.training_category AS ENUM ('compliance', 'technical', 'soft_skills', 'onboarding', 'other');
CREATE TYPE public.training_status AS ENUM ('assigned', 'in_progress', 'completed', 'overdue', 'waived');

CREATE TABLE public.training_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category public.training_category NOT NULL DEFAULT 'other',
  provider TEXT,
  duration_hours NUMERIC(5,2),
  cpe_credits NUMERIC(5,2),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone signed-in reads courses"
  ON public.training_courses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/HR insert courses"
  ON public.training_courses FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Admin/HR update courses"
  ON public.training_courses FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Admin/HR delete courses"
  ON public.training_courses FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE TRIGGER training_courses_updated_at
  BEFORE UPDATE ON public.training_courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.training_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  assigned_by UUID,
  due_date DATE,
  status public.training_status NOT NULL DEFAULT 'assigned',
  completed_at TIMESTAMPTZ,
  score NUMERIC(5,2),
  certificate_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, employee_id)
);

ALTER TABLE public.training_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own or admin/hr"
  ON public.training_assignments FOR SELECT
  USING (
    employee_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Admin/HR insert assignments"
  ON public.training_assignments FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Update own progress or admin/hr"
  ON public.training_assignments FOR UPDATE
  USING (
    employee_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Admin/HR delete assignments"
  ON public.training_assignments FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE TRIGGER training_assignments_updated_at
  BEFORE UPDATE ON public.training_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX training_assignments_employee_idx ON public.training_assignments(employee_id);
CREATE INDEX training_assignments_course_idx ON public.training_assignments(course_id);
