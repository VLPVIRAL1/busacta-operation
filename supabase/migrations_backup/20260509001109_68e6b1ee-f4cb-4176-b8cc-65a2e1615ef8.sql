
-- Enums
CREATE TYPE public.leave_type AS ENUM ('vacation', 'sick', 'personal', 'unpaid', 'bereavement', 'other');
CREATE TYPE public.leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'late', 'half_day', 'remote', 'holiday');

-- Leave requests
CREATE TABLE public.leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  type public.leave_type NOT NULL DEFAULT 'vacation',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days NUMERIC(5,2) NOT NULL DEFAULT 1,
  reason TEXT,
  status public.leave_status NOT NULL DEFAULT 'pending',
  reviewer_id UUID,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own or admin/hr"
  ON public.leave_requests FOR SELECT
  USING (
    employee_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Insert own"
  ON public.leave_requests FOR INSERT
  WITH CHECK (employee_id = auth.uid());

CREATE POLICY "Update own pending or admin/hr"
  ON public.leave_requests FOR UPDATE
  USING (
    (employee_id = auth.uid() AND status = 'pending')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Delete own pending or admin"
  ON public.leave_requests FOR DELETE
  USING (
    (employee_id = auth.uid() AND status = 'pending')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE TRIGGER leave_requests_updated_at
  BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX leave_requests_employee_idx ON public.leave_requests(employee_id, start_date DESC);
CREATE INDEX leave_requests_status_idx ON public.leave_requests(status);

-- Attendance entries
CREATE TABLE public.attendance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL,
  entry_date DATE NOT NULL,
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  status public.attendance_status NOT NULL DEFAULT 'present',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, entry_date)
);

ALTER TABLE public.attendance_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own or admin/hr"
  ON public.attendance_entries FOR SELECT
  USING (
    employee_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Insert own or admin/hr"
  ON public.attendance_entries FOR INSERT
  WITH CHECK (
    employee_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Update own or admin/hr"
  ON public.attendance_entries FOR UPDATE
  USING (
    employee_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE POLICY "Delete admin/hr"
  ON public.attendance_entries FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'hr_manager')
  );

CREATE TRIGGER attendance_entries_updated_at
  BEFORE UPDATE ON public.attendance_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX attendance_entries_employee_idx ON public.attendance_entries(employee_id, entry_date DESC);
