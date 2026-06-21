-- Employees can hold MULTIPLE specialties, each with a free-text description.
-- This supersedes the single profiles.specialty text field for the HR directory,
-- which is kept intact for legacy member pickers.
CREATE TABLE IF NOT EXISTS employee_specialties (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  specialty   text        NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employee_specialties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_manage_employee_specialties"
  ON employee_specialties FOR ALL TO authenticated
  USING     (current_user_role() IN ('admin', 'super_admin', 'hr_manager'))
  WITH CHECK(current_user_role() IN ('admin', 'super_admin', 'hr_manager'));

CREATE POLICY "employee_read_own_specialties"
  ON employee_specialties FOR SELECT TO authenticated
  USING (employee_id = auth.uid());

CREATE INDEX IF NOT EXISTS employee_specialties_employee_id_idx
  ON employee_specialties (employee_id);

-- No duplicate specialty label per employee.
CREATE UNIQUE INDEX IF NOT EXISTS employee_specialties_unique_label
  ON employee_specialties (employee_id, lower(specialty));
