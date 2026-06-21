import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertCallerCanManageHr,
  createEmployeeServer,
  deactivateEmployeeServer,
  reactivateEmployeeServer,
  updateEmployeeServer,
  updateEmployeeEmailServer,
  setFirmAssignmentsServer,
  setClientAssignmentsServer,
  upsertBankAccountServer,
  deleteBankAccountServer,
  upsertSpecialtyServer,
  deleteSpecialtyServer,
} from "./employees.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyPortalLockout } from "./portal-lockout.server";

const internalRole = z.enum(["employee", "admin", "super_admin", "hr_manager"]);

const permissionMap = z
  .record(z.string().min(1).max(60), z.union([z.boolean(), z.literal("inherit")]))
  .optional();

const createSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).nullable().optional(),
  avatar_url: z.string().url().max(2048).nullable().optional(),
  specialty: z.string().trim().max(120).nullable().optional(),
  employee_id: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/),
  department: z.enum(["ops", "finance", "hr", "exec"]).nullable().optional(),
  position: z.string().max(40).nullable().optional(),
  position_title: z.string().trim().max(120).nullable().optional(),
  employment_type: z.enum(["full_time", "part_time", "contractor", "intern"]).nullable().optional(),
  join_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  assigned_firm_id: z.string().uuid().nullable().optional(),
  system_role: internalRole,
  subrole_id: z.string().uuid().nullable().optional(),
  permissions: permissionMap,
  // Provenance guard: internal users can ONLY be provisioned from the HR Hub.
  // Any caller that omits or alters this discriminator fails validation.
  origin: z.literal("hr_hub"),
});

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    const { origin: _origin, ...payload } = data;
    return createEmployeeServer(payload, { actorId: context.userId });
  });

const idSchema = z.object({ userId: z.string().uuid() });

const deactivateSchema = z.object({
  userId: z.string().uuid(),
  separationType: z.enum(["inactive", "left"]),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const deactivateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deactivateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    return deactivateEmployeeServer({
      userId: data.userId,
      actorId: context.userId,
      separationType: data.separationType,
      effectiveDate: data.effectiveDate,
    });
  });

const firmAssignmentsSchema = z.object({
  userId: z.string().uuid(),
  firmIds: z.array(z.string().uuid()).max(50),
});

export const setFirmAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmAssignmentsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    return setFirmAssignmentsServer({
      userId: data.userId,
      firmIds: data.firmIds,
      actorId: context.userId,
    });
  });

const clientAssignmentsSchema = z.object({
  userId: z.string().uuid(),
  clientIds: z.array(z.string().uuid()).max(200),
});

export const setClientAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => clientAssignmentsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    return setClientAssignmentsServer({
      userId: data.userId,
      clientIds: data.clientIds,
      actorId: context.userId,
    });
  });

export const reactivateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    return reactivateEmployeeServer({ userId: data.userId, actorId: context.userId });
  });

const updateSchema = z.object({
  userId: z.string().uuid(),
  patch: createSchema.partial().omit({ email: true, system_role: true, permissions: true }),
  permissions: permissionMap,
});

export const updateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    return updateEmployeeServer({
      userId: data.userId,
      patch: data.patch,
      permissions: data.permissions,
      actorId: context.userId,
    });
  });

const updateEmailSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().trim().email().max(255),
});

export const updateEmployeeEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateEmailSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    return updateEmployeeEmailServer({
      userId: data.userId,
      email: data.email,
      actorId: context.userId,
    });
  });

// --- Permission read for the matrix editor ---
export const readEmployeePermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("user_hub_permissions" as never)
      .select("module_key, allowed")
      .eq("user_id", data.userId);
    if (error) throw error;
    return { rows: (rows ?? []) as { module_key: string; allowed: boolean }[] };
  });

// --- Verify portal lockout on demand ---
export const verifyEmployeePortalLockout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    const result = await verifyPortalLockout(data.userId);
    return result;
  });

// --- Bulk import ---
// Bulk import rows: same shape as createSchema but the `origin` discriminator
// is asserted once at the envelope level (see bulkInputSchema), not per row.
const bulkRowSchema = createSchema.omit({ origin: true });

const bulkInputSchema = z.object({
  fileName: z.string().max(255).optional(),
  rows: z.array(bulkRowSchema).min(1).max(500),
  parentRunId: z.string().uuid().nullable().optional(),
  origin: z.literal("hr_hub"),
});

export const bulkCreateEmployees = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bulkInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    const admin = supabaseAdmin;
    const { data: run, error: runErr } = await admin
      .from("employee_import_runs")
      .insert({
        actor_id: context.userId,
        file_name: data.fileName ?? null,
        total_rows: data.rows.length,
        valid_rows: data.rows.length,
        parent_run_id: data.parentRunId ?? null,
      } as never)
      .select("id")
      .single();
    if (runErr) throw runErr;
    const runId = (run as { id: string }).id;

    const failures: { row: number; email: string; error: string }[] = [];
    let imported = 0;
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      try {
        await createEmployeeServer(r, { actorId: context.userId, importRunId: runId });
        imported += 1;
      } catch (e: any) {
        failures.push({ row: i + 1, email: r.email, error: e?.message ?? String(e) });
      }
    }

    await admin
      .from("employee_import_runs")
      .update({
        imported_rows: imported,
        failed_rows: failures.length,
        failures: failures as never,
        finished_at: new Date().toISOString(),
      } as never)
      .eq("id", runId);

    return { runId, imported, failed: failures.length, failures };
  });

// ── Bank account server functions ─────────────────────────────────────

const bankAccountSchema = z.object({
  id: z.string().uuid().optional(),
  employeeId: z.string().uuid(),
  bankName: z.string().trim().min(1).max(120),
  accountHolderName: z.string().trim().min(1).max(150),
  accountNumber: z.string().trim().min(1).max(30),
  ifscCode: z.string().trim().max(20).nullable().optional(),
  accountType: z.enum(["savings", "current", "salary"]),
  isPayrollAccount: z.boolean(),
});

export const upsertEmployeeBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => bankAccountSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    return upsertBankAccountServer({ input: data, actorId: context.userId });
  });

const deleteBankAccountSchema = z.object({
  accountId: z.string().uuid(),
  employeeId: z.string().uuid(),
});

export const deleteEmployeeBankAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteBankAccountSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    return deleteBankAccountServer({
      accountId: data.accountId,
      employeeId: data.employeeId,
      actorId: context.userId,
    });
  });

// ── Specialty server functions ────────────────────────────────────────

const specialtySchema = z.object({
  id: z.string().uuid().optional(),
  employeeId: z.string().uuid(),
  specialty: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
});

export const upsertEmployeeSpecialty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => specialtySchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    return upsertSpecialtyServer({ input: data, actorId: context.userId });
  });

const deleteSpecialtySchema = z.object({
  specialtyId: z.string().uuid(),
  employeeId: z.string().uuid(),
});

export const deleteEmployeeSpecialty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteSpecialtySchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCallerCanManageHr(context.userId);
    return deleteSpecialtyServer({
      specialtyId: data.specialtyId,
      employeeId: data.employeeId,
      actorId: context.userId,
    });
  });
