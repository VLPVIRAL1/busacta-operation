-- Seed test data for access control validation
-- Run this in Supabase SQL Editor to populate test employees

DO $$
DECLARE
  v_admin_id UUID;
  v_hr_mgr_id UUID;
  v_emp1_id UUID;
  v_emp2_id UUID;
  v_emp3_id UUID;
BEGIN
  -- Get or create a super admin user for reference
  SELECT user_id INTO v_admin_id
  FROM user_roles
  WHERE role = 'super_admin'
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE NOTICE 'No super_admin found. Using first admin role user.';
    SELECT user_id INTO v_admin_id
    FROM user_roles
    WHERE role = 'admin'
    LIMIT 1;
  END IF;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No admin users found. Cannot seed test data.';
  END IF;

  -- ─── Test Employee 1: HR Manager ──────────────────────────────
  v_hr_mgr_id := gen_random_uuid();

  INSERT INTO profiles (
    id, email, full_name, first_name, last_name, phone,
    employee_id, department, position, position_title,
    employment_type, join_date, status, provisioned_via,
    portal_enabled
  ) VALUES (
    v_hr_mgr_id,
    'priya.sharma@busacta.com',
    'Priya Sharma',
    'Priya',
    'Sharma',
    '+91-98765-43210',
    'EMP-001',
    'hr',
    'manager',
    'HR Manager',
    'full_time',
    '2024-01-15',
    'active',
    'hr_hub',
    false
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name;

  INSERT INTO user_roles (user_id, role) VALUES
    (v_hr_mgr_id, 'hr_manager')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- ─── Test Employee 2: Senior Accountant ───────────────────────
  v_emp1_id := gen_random_uuid();

  INSERT INTO profiles (
    id, email, full_name, first_name, last_name, phone,
    employee_id, department, position, position_title,
    employment_type, join_date, status, provisioned_via,
    portal_enabled
  ) VALUES (
    v_emp1_id,
    'arun.kumar@busacta.com',
    'Arun Kumar',
    'Arun',
    'Kumar',
    '+91-97654-32109',
    'EMP-003',
    'finance',
    'senior',
    'Senior Accountant',
    'full_time',
    '2023-06-10',
    'active',
    'hr_hub',
    false
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name;

  INSERT INTO user_roles (user_id, role) VALUES
    (v_emp1_id, 'employee')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- ─── Test Employee 4: Junior Staff ────────────────────────────
  v_emp2_id := gen_random_uuid();

  INSERT INTO profiles (
    id, email, full_name, first_name, last_name, phone,
    employee_id, department, position, position_title,
    employment_type, join_date, status, provisioned_via,
    portal_enabled
  ) VALUES (
    v_emp2_id,
    'meera.singh@busacta.com',
    'Meera Singh',
    'Meera',
    'Singh',
    '+91-96543-21098',
    'EMP-004',
    'ops',
    'staff',
    'Accounts Clerk',
    'full_time',
    '2024-03-01',
    'active',
    'hr_hub',
    false
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name;

  INSERT INTO user_roles (user_id, role) VALUES
    (v_emp2_id, 'employee')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- ─── Test Employee 5: Admin User ──────────────────────────────
  v_emp3_id := gen_random_uuid();

  INSERT INTO profiles (
    id, email, full_name, first_name, last_name, phone,
    employee_id, department, position, position_title,
    employment_type, join_date, status, provisioned_via,
    portal_enabled
  ) VALUES (
    v_emp3_id,
    'vikram.sharma@busacta.com',
    'Vikram Sharma',
    'Vikram',
    'Sharma',
    '+91-95432-10987',
    'EMP-005',
    'exec',
    'partner',
    'Managing Partner',
    'full_time',
    '2022-01-01',
    'active',
    'hr_hub',
    false
  ) ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name;

  INSERT INTO user_roles (user_id, role) VALUES
    (v_emp3_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- ─── Sample Hub Permission Overrides ───────────────────────────

  -- Priya (HR Manager) can see HR and People hubs
  INSERT INTO user_hub_permissions (user_id, module_key, allowed, updated_by)
  VALUES (v_hr_mgr_id, 'hr', true, v_admin_id)
  ON CONFLICT (user_id, module_key) DO UPDATE SET allowed = EXCLUDED.allowed;

  -- Arun (Senior Accountant) - inherit from employee role
  -- (no overrides needed, will use defaults)

  RAISE NOTICE 'Seeded 4 test employees with access control roles:';
  RAISE NOTICE '  1. Priya Sharma (priya.sharma@busacta.com) - HR Manager';
  RAISE NOTICE '  2. Arun Kumar (arun.kumar@busacta.com) - Employee (Senior Accountant)';
  RAISE NOTICE '  3. Meera Singh (meera.singh@busacta.com) - Employee (Accounts Clerk)';
  RAISE NOTICE '  4. Vikram Sharma (vikram.sharma@busacta.com) - Admin (Managing Partner)';
  RAISE NOTICE '';
  RAISE NOTICE 'Test data seeded successfully. Visit /admin/access-control to manage permissions.';
END $$;
