/**
 * Seed test employees for access control system validation
 *
 * Usage: bun scripts/seed-test-employees.ts
 *
 * This script creates test employee data with various roles and permissions
 * for validating the access control system.
 */

import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface TestEmployee {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  employeeId: string;
  department: string;
  position: string;
  positionTitle: string;
  employmentType: string;
  joinDate: string;
  role: "employee" | "hr_manager" | "finance_manager" | "admin" | "super_admin";
  hubPermissions?: Record<string, boolean>;
}

const TEST_EMPLOYEES: TestEmployee[] = [
  {
    firstName: "Priya",
    lastName: "Sharma",
    email: "priya.sharma@busacta.com",
    phone: "+91-98765-43210",
    employeeId: "EMP-001",
    department: "hr",
    position: "manager",
    positionTitle: "HR Manager",
    employmentType: "full_time",
    joinDate: "2024-01-15",
    role: "hr_manager",
    hubPermissions: { hr: true },
  },
  {
    firstName: "Rajesh",
    lastName: "Patel",
    email: "rajesh.patel@busacta.com",
    phone: "+91-99876-54321",
    employeeId: "EMP-002",
    department: "finance",
    position: "manager",
    positionTitle: "Finance Manager",
    employmentType: "full_time",
    joinDate: "2024-02-01",
    role: "finance_manager",
    hubPermissions: { finance: true, projects: true },
  },
  {
    firstName: "Arun",
    lastName: "Kumar",
    email: "arun.kumar@busacta.com",
    phone: "+91-97654-32109",
    employeeId: "EMP-003",
    department: "finance",
    position: "senior",
    positionTitle: "Senior Accountant",
    employmentType: "full_time",
    joinDate: "2023-06-10",
    role: "employee",
  },
  {
    firstName: "Meera",
    lastName: "Singh",
    email: "meera.singh@busacta.com",
    phone: "+91-96543-21098",
    employeeId: "EMP-004",
    department: "ops",
    position: "staff",
    positionTitle: "Accounts Clerk",
    employmentType: "full_time",
    joinDate: "2024-03-01",
    role: "employee",
    hubPermissions: { finance: true },
  },
  {
    firstName: "Vikram",
    lastName: "Sharma",
    email: "vikram.sharma@busacta.com",
    phone: "+91-95432-10987",
    employeeId: "EMP-005",
    department: "exec",
    position: "partner",
    positionTitle: "Managing Partner",
    employmentType: "full_time",
    joinDate: "2022-01-01",
    role: "admin",
  },
];

async function seedEmployees() {
  console.log("🌱 Seeding test employees for access control validation...\n");

  let created = 0;
  let skipped = 0;

  for (const emp of TEST_EMPLOYEES) {
    try {
      const fullName = `${emp.firstName} ${emp.lastName}`;

      // Check if user already exists
      const { data: existingUser } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 10,
      });

      const userExists = existingUser?.users?.some((u) => u.email === emp.email);

      let userId: string;

      if (userExists) {
        // Get existing user ID
        const { data: list } = await supabase.auth.admin.listUsers();
        const user = list?.users?.find((u) => u.email === emp.email);
        if (!user) throw new Error(`Could not find user for ${emp.email}`);
        userId = user.id;
        console.log(`⏭️  ${fullName} (${emp.email}) - User already exists`);
        skipped++;
      } else {
        // Create new auth user with random password
        const password = Math.random().toString(36).slice(-12) + "Aa1!";
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: emp.email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            portal: false,
          },
        });

        if (authError) throw authError;
        userId = authData.user!.id;
      }

      // Upsert profile
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: userId,
        email: emp.email,
        full_name: fullName,
        first_name: emp.firstName,
        last_name: emp.lastName,
        phone: emp.phone,
        employee_id: emp.employeeId,
        department: emp.department,
        position: emp.position,
        position_title: emp.positionTitle,
        employment_type: emp.employmentType,
        join_date: emp.joinDate,
        status: "active",
        provisioned_via: "hr_hub",
        portal_enabled: false,
      });

      if (profileError) throw profileError;

      // Assign role
      const { error: roleError } = await supabase.from("user_roles").upsert({
        user_id: userId,
        role: emp.role,
      });

      if (roleError) throw roleError;

      // Set hub permissions if specified
      if (emp.hubPermissions) {
        for (const [moduleKey, allowed] of Object.entries(emp.hubPermissions)) {
          const { error: permError } = await supabase.from("user_hub_permissions").upsert({
            user_id: userId,
            module_key: moduleKey,
            allowed,
          });

          if (permError) throw permError;
        }
      }

      console.log(`✅ ${fullName} (${emp.email}) - Role: ${emp.role.toUpperCase()}`);
      created++;
    } catch (err) {
      console.error(`❌ Failed to create ${emp.email}:`, err);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Created: ${created}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total:   ${TEST_EMPLOYEES.length}`);

  console.log(`\n🔍 Next Steps:`);
  console.log(`   1. Go to Admin → Access Control to verify employees appear`);
  console.log(`   2. Go to HR → Employees to manage permissions`);
  console.log(`   3. Check roles and hub permissions for each employee`);
  console.log(`\n✨ Seeding complete!`);
}

// Run seeding
seedEmployees().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
