# Seed Test Data Guide - Access Control System

## Overview

This guide will help you populate test employee data for validating the access control system.

## Test Employees to Create

Below are 5 sample employees with different roles and permissions:

### 1. **Priya Sharma** (HR Manager)

- **Email:** priya.sharma@busacta.com
- **Role:** HR Manager
- **Employee ID:** EMP-001
- **Department:** Human Resources
- **Position:** Manager
- **Hub Access:** HR module visible
- **Capabilities:** Invite users, Manage members & roles, View time logs

### 2. **Rajesh Patel** (Finance Manager)

- **Email:** rajesh.patel@busacta.com
- **Role:** Finance Manager
- **Employee ID:** EMP-002
- **Department:** Finance
- **Position:** Manager
- **Hub Access:** Finance & Projects modules visible
- **Capabilities:** Create/edit/delete firms, clients, projects; view invoices

### 3. **Arun Kumar** (Senior Accountant)

- **Email:** arun.kumar@busacta.com
- **Role:** Employee
- **Employee ID:** EMP-003
- **Department:** Finance
- **Position:** Senior
- **Hub Access:** Uses role defaults
- **Capabilities:** Basic employee access only

### 4. **Meera Singh** (Accounts Clerk)

- **Email:** meera.singh@busacta.com
- **Role:** Employee
- **Employee ID:** EMP-004
- **Department:** Operations
- **Position:** Staff
- **Hub Access:** Finance hub visible (override)
- **Capabilities:** Basic employee access only

### 5. **Vikram Sharma** (Managing Partner)

- **Email:** vikram.sharma@busacta.com
- **Role:** Admin
- **Employee ID:** EMP-005
- **Department:** Executive
- **Position:** Partner
- **Hub Access:** All hubs visible
- **Capabilities:** All capabilities

---

## Option 1: Manual Setup via UI (Recommended for Testing)

### Steps:

1. **Go to HR → Employees**
   - Click "+ Add employee"
2. **Add Employee 1: Priya Sharma**
   - First Name: Priya
   - Last Name: Sharma
   - Email: priya.sharma@busacta.com
   - Phone: +91-98765-43210
   - Employee ID: EMP-001
   - Department: HR
   - Position: Manager
   - Position Title: HR Manager
   - Employment Type: Full-time
   - Join Date: 2024-01-15
   - System Role: **HR Manager**
   - Click Save

3. **Add Employee 2: Rajesh Patel**
   - Follow same process with details above
   - System Role: **Finance Manager**
   - After saving, go to Permissions tab:
     - Override Finance hub: Show
     - Override Projects hub: Show

4. **Add Employee 3: Arun Kumar**
   - System Role: **Employee**
   - Leave permissions as default

5. **Add Employee 4: Meera Singh**
   - System Role: **Employee**
   - After saving, go to Permissions tab:
     - Override Finance hub: Show

6. **Add Employee 5: Vikram Sharma**
   - System Role: **Admin**
   - All hubs will be visible by default

---

## Option 2: Bulk Create via Admin Access Control

### Steps:

1. **Go to Admin → Access Control → Members tab**

2. **Search for each employee** (they should appear after manual creation)

3. **Assign roles:**
   - Click in the Roles cell
   - Use the "+ Add" dropdown to assign multiple roles if needed
   - Confirm role assignments

---

## Validation Checklist

After seeding data, validate the following:

### ✅ Employee Creation

- [ ] All 5 employees appear in HR → Employees list
- [ ] Employee IDs are correct (EMP-001 through EMP-005)
- [ ] Departments and positions are visible

### ✅ Role Assignment

- [ ] In Admin → Access Control → Members tab, all employees visible
- [ ] Priya shows "hr_manager" role
- [ ] Rajesh shows "finance_manager" role
- [ ] Arun and Meera show "employee" role
- [ ] Vikram shows "admin" role

### ✅ Role Capabilities

- [ ] Admin → Access Control → Roles & Capabilities shows role matrix
- [ ] HR Manager has "people.manage" and "people.invite" capabilities
- [ ] Finance Manager has "firms.create", "clients.create" capabilities
- [ ] Employee role has limited capabilities

### ✅ Hub Permissions

- [ ] Admin → Access Control → Roles & Capabilities → view hub matrix
- [ ] Priya (HR Manager) has Finance hub hidden (unless overridden)
- [ ] Rajesh (Finance Manager) has Finance and Projects visible
- [ ] Meera (Employee) has Finance visible (override confirmed)

### ✅ HR Integration

- [ ] In HR Employees → select Priya → Permissions tab
- [ ] Shows "HR Manager" role badge
- [ ] Shows option to remove role or add additional roles
- [ ] Hub permissions matrix visible and editable
- [ ] "Manage in Admin →" link works

### ✅ Sub-Roles (Optional Test)

- [ ] Admin → Access Control → Roles & Capabilities
- [ ] Can create a sub-role like "Reviewer" based on "Employee"
- [ ] Can customize capabilities for the sub-role
- [ ] Sub-role respects parent role ceiling

---

## Testing Scenarios

### Scenario 1: Promote Employee to Manager

1. Go to HR → Employees → Arun Kumar
2. Permissions tab → Add role → select "Finance Manager"
3. Should see confirmation toast
4. Go to Admin → Access Control → Members
5. Verify Arun now has both "employee" and "finance_manager" roles

### Scenario 2: Override Hub Access

1. Go to HR → Employees → Meera Singh
2. Permissions tab → Hub Module Visibility
3. Toggle Finance module to "Show"
4. Click Save
5. Go to Admin → Access Control → Roles & Capabilities
6. In hub matrix, find Meera Singh row
7. Finance column should show "Show" (override)

### Scenario 3: Create and Apply Sub-Role

1. Admin → Access Control → Roles & Capabilities
2. Sub-Roles panel → Create new
   - Name: "Reviewer"
   - Base Role: "Employee"
   - Description: "Can view and comment on tasks"
3. Click "Edit capabilities"
4. Enable: "tasks.view" (if available)
5. Assign to Arun Kumar in the Members tab
6. Verify Arun can now access reviewer capabilities

---

## Troubleshooting

### Employees Don't Appear in Admin Page

- **Solution:** The HR → Admin sync happens automatically
- **Check:** Refresh the Admin page (Ctrl+F5)
- **If still missing:** Check that employee status is "active"

### Role Assignment Shows Error

- **Cause:** May be CAPTCHA verification
- **Solution:** Complete the CAPTCHA prompt when assigning roles

### Hub Permissions Not Saving

- **Cause:** May be RLS policy blocking the update
- **Solution:** Verify admin user has proper permissions
- **Check:** Look at browser console for error details

### Employees Created But No Roles Show

- **Cause:** User roles not assigned
- **Solution:** In HR Permissions tab, use "+ Add" to assign a role
- **Verify:** Roles should appear immediately

---

## Reset Test Data

To remove test data and start fresh:

1. **Go to Admin → Access Control → Members**
2. **For each test employee:**
   - Search by name (e.g., "Priya Sharma")
   - Right-click → Delete (if available)
   - Or set status to "Inactive"

Alternatively, contact your Supabase admin to run a cleanup migration.

---

## Next Steps After Validation

Once validation is complete:

1. **Share findings** with team lead
2. **Document any issues** found during testing
3. **Create user documentation** for your staff
4. **Set up production roles** based on test validation
5. **Begin onboarding** actual employees through HR module
