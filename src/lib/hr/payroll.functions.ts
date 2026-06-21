import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertCallerCanManagePayroll,
  upsertSalaryStructureServer,
  getSalaryStructureServer,
  listSalaryStructuresServer,
  upsertLeavePolicyServer,
  getLeavePolicyServer,
  getLeaveBalancesServer,
  adjustLeaveBalanceServer,
  upsertHolidayServer,
  deleteHolidayServer,
  listHolidaysServer,
  createPayrollRunServer,
  computePayrollRunServer,
  approvePayrollRunServer,
  markPayrollRunPaidServer,
  overridePayrollEntryServer,
  listPayrollRunsServer,
  getPayrollRunServer,
  getPayrollEntryServer,
  getPayrollSetupOverviewServer,
  updateEmployeePayrollAssignmentsServer,
} from "./payroll.server";

// ── Salary structure ──────────────────────────────────────────────────────────

const otherComponentSchema = z.object({
  name: z.string().min(1).max(80),
  amount: z.number().nonnegative(),
  type: z.enum(["earning", "deduction"]),
});

const salaryStructureSchema = z.object({
  employee_id: z.string().uuid(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effective_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  basic_monthly: z.number().nonnegative(),
  hra_monthly: z.number().nonnegative(),
  ta_monthly: z.number().nonnegative(),
  other_components: z.array(otherComponentSchema).optional(),
  pf_applicable: z.boolean(),
  pt_applicable: z.boolean(),
  tds_monthly: z.number().nonnegative(),
  ctc_monthly: z.number().nonnegative(),
  notes: z.string().nullable().optional(),
});

export const upsertSalaryStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => salaryStructureSchema.parse(input))
  .handler(
    async ({ data, context }: { data: z.infer<typeof salaryStructureSchema>; context: any }) => {
      await assertCallerCanManagePayroll(context.userId);
      return upsertSalaryStructureServer(data, context.userId);
    },
  );

export const getSalaryStructure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ employee_id: z.string().uuid(), as_of_date: z.string().optional() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return getSalaryStructureServer(data.employee_id, data.as_of_date);
  });

export const listSalaryStructures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ employee_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return listSalaryStructuresServer(data.employee_id);
  });

// ── Leave policy ──────────────────────────────────────────────────────────────

const leavePolicySchema = z.object({
  employee_id: z.string().uuid(),
  policy_year: z.number().int().min(2020).max(2100),
  cl_quota: z.number().nonnegative(),
  sl_quota: z.number().nonnegative(),
  el_quota: z.number().nonnegative(),
  leave_type_map: z.record(z.string()).optional(),
  el_carry_forward_max: z.number().nonnegative(),
  cl_carry_forward_max: z.number().nonnegative(),
  sl_carry_forward_max: z.number().nonnegative(),
  cl_opening_balance: z.number().nonnegative(),
  sl_opening_balance: z.number().nonnegative(),
  el_opening_balance: z.number().nonnegative(),
});

export const upsertLeavePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => leavePolicySchema.parse(input))
  .handler(async ({ data, context }: { data: z.infer<typeof leavePolicySchema>; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return upsertLeavePolicyServer(data, context.userId);
  });

export const getLeavePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ employee_id: z.string().uuid(), policy_year: z.number().int() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return getLeavePolicyServer(data.employee_id, data.policy_year);
  });

export const getLeaveBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ employee_id: z.string().uuid(), year: z.number().int() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return getLeaveBalancesServer(data.employee_id, data.year);
  });

export const adjustLeaveBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        employee_id: z.string().uuid(),
        year: z.number().int(),
        category: z.enum(["cl", "sl", "el"]),
        delta: z.number(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return adjustLeaveBalanceServer(data.employee_id, data.year, data.category, data.delta);
  });

// ── Holidays ──────────────────────────────────────────────────────────────────

const festivalDateEntrySchema = z.object({
  year: z.number().int().min(2000).max(2100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const holidaySchema = z.discriminatedUnion("is_festival", [
  z.object({
    id: z.string().uuid().optional(),
    is_festival: z.literal(false),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    name: z.string().min(1).max(120),
    is_optional: z.boolean(),
  }),
  z
    .object({
      id: z.string().uuid().optional(),
      is_festival: z.literal(true),
      is_recurring: z.boolean().default(true),
      festival_month: z.number().int().min(1).max(12).optional(),
      festival_day: z.number().int().min(1).max(31).optional(),
      festival_dates: z.array(festivalDateEntrySchema).default([]),
      name: z.string().min(1).max(120),
      is_optional: z.boolean().optional().default(false),
    })
    .refine((d) => (d.is_recurring ? d.festival_month != null && d.festival_day != null : true), {
      message: "Recurring festivals require a month and day",
    }),
]);

export const upsertHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => holidaySchema.parse(input))
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return upsertHolidayServer(data, context.userId);
  });

export const deleteHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ holiday_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return deleteHolidayServer(data.holiday_id);
  });

export const listHolidays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ year: z.number().int() }).parse(input))
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return listHolidaysServer(data.year);
  });

// ── Payroll runs ──────────────────────────────────────────────────────────────

export const createPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        year: z.number().int().min(2020).max(2100),
        month: z.number().int().min(1).max(12),
      })
      .parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return createPayrollRunServer(data.year, data.month, context.userId);
  });

export const computePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ run_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return computePayrollRunServer(data.run_id, context.userId);
  });

export const approvePayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ run_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return approvePayrollRunServer(data.run_id, context.userId);
  });

export const markPayrollRunPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ run_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return markPayrollRunPaidServer(data.run_id, context.userId);
  });

export const overridePayrollEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entry_id: z.string().uuid(),
        overrides: z.object({
          gross_earnings: z.number().optional(),
          total_deductions: z.number().optional(),
          net_pay: z.number().optional(),
          lwp_days: z.number().optional(),
          paid_days: z.number().optional(),
        }),
        notes: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return overridePayrollEntryServer(data.entry_id, data.overrides, data.notes);
  });

// ── Read functions ────────────────────────────────────────────────────────────

export const listPayrollRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])

  .handler(async ({ context }: { context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return listPayrollRunsServer();
  });

export const getPayrollRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ run_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return getPayrollRunServer(data.run_id);
  });

export const getPayrollEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ run_id: z.string().uuid(), employee_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return getPayrollEntryServer(data.run_id, data.employee_id);
  });

export const getPayrollSetupOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ year: z.number().int() }).parse(input))
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return getPayrollSetupOverviewServer(data.year);
  });

export const updateEmployeePayrollAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        employee_id: z.string().uuid(),
        attendance_settings_id: z.string().uuid().nullable(),
        holiday_calendar_year: z.number().int().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }: { data: any; context: any }) => {
    await assertCallerCanManagePayroll(context.userId);
    return updateEmployeePayrollAssignmentsServer({
      employeeId: data.employee_id,
      attendanceSettingsId: data.attendance_settings_id,
      holidayCalendarYear: data.holiday_calendar_year,
    });
  });
