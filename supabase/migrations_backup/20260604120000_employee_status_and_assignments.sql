-- ── Employee status tracking ──────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS status_effective_date date,
  ADD COLUMN IF NOT EXISTS separation_type       text
    CHECK (separation_type IS NULL OR separation_type IN ('inactive', 'left'));

-- ── Employee ↔ Firm multi-assignment ──────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_firm_assignments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid        NOT NULL REFERENCES profiles(id)  ON DELETE CASCADE,
  firm_id     uuid        NOT NULL REFERENCES firms(id)     ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid                 REFERENCES profiles(id),
  UNIQUE (employee_id, firm_id)
);

ALTER TABLE employee_firm_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_manage_employee_firm_assignments"
  ON employee_firm_assignments FOR ALL TO authenticated
  USING     (current_user_role() IN ('admin', 'super_admin', 'hr_manager'))
  WITH CHECK(current_user_role() IN ('admin', 'super_admin', 'hr_manager'));

CREATE POLICY "employee_read_own_firm_assignments"
  ON employee_firm_assignments FOR SELECT TO authenticated
  USING (employee_id = auth.uid());

-- ── Employee ↔ Direct-client multi-assignment ─────────────────────────
CREATE TABLE IF NOT EXISTS employee_client_assignments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid        NOT NULL REFERENCES profiles(id)       ON DELETE CASCADE,
  client_id   uuid        NOT NULL REFERENCES direct_clients(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid                 REFERENCES profiles(id),
  UNIQUE (employee_id, client_id)
);

ALTER TABLE employee_client_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_manage_employee_client_assignments"
  ON employee_client_assignments FOR ALL TO authenticated
  USING     (current_user_role() IN ('admin', 'super_admin', 'hr_manager'))
  WITH CHECK(current_user_role() IN ('admin', 'super_admin', 'hr_manager'));

CREATE POLICY "employee_read_own_client_assignments"
  ON employee_client_assignments FOR SELECT TO authenticated
  USING (employee_id = auth.uid());
