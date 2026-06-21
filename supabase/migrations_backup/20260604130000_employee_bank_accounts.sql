CREATE TABLE IF NOT EXISTS employee_bank_accounts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bank_name           text        NOT NULL,
  account_holder_name text        NOT NULL,
  account_number      text        NOT NULL,
  ifsc_code           text,
  account_type        text        NOT NULL DEFAULT 'savings'
    CHECK (account_type IN ('savings', 'current', 'salary')),
  is_payroll_account  boolean     NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid        REFERENCES profiles(id),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE employee_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_manage_employee_bank_accounts"
  ON employee_bank_accounts FOR ALL TO authenticated
  USING     (current_user_role() IN ('admin', 'super_admin', 'hr_manager'))
  WITH CHECK(current_user_role() IN ('admin', 'super_admin', 'hr_manager'));

CREATE POLICY "employee_read_own_bank_accounts"
  ON employee_bank_accounts FOR SELECT TO authenticated
  USING (employee_id = auth.uid());

-- Only one payroll account per employee
CREATE UNIQUE INDEX IF NOT EXISTS employee_bank_accounts_one_payroll
  ON employee_bank_accounts (employee_id)
  WHERE is_payroll_account = true;
