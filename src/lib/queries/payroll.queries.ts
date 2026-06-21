import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PayrollRun = {
  id: string;
  pay_period_year: number;
  pay_period_month: number;
  total_working_days: number;
  status: "draft" | "processing" | "approved" | "paid" | "cancelled";
  computed_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type EarningsRow = { name: string; monthly_amount: number; actual_amount: number };
export type DeductionRow = { name: string; amount: number };

export type PayrollEntry = {
  id: string;
  run_id: string;
  employee_id: string;
  salary_structure_id: string | null;
  total_working_days: number;
  present_days: number;
  half_days: number;
  absent_days: number;
  week_off_days: number;
  holiday_days: number;
  cl_days: number;
  sl_days: number;
  el_days: number;
  lwp_days: number;
  paid_days: number;
  lop_deduction_days: number;
  earnings_breakdown: EarningsRow[];
  gross_earnings: number;
  pf_employee: number;
  pf_employer: number;
  pt_amount: number;
  tds_amount: number;
  other_deductions: DeductionRow[];
  total_deductions: number;
  net_pay: number;
  is_locked: boolean;
  override_notes: string | null;
  computed_at: string;
  updated_at: string;
};

export type PayrollSalaryStructure = {
  id: string;
  employee_id: string;
  effective_from: string;
  effective_to: string | null;
  basic_monthly: number;
  hra_monthly: number;
  ta_monthly: number;
  other_components: Array<{ name: string; amount: number; type: "earning" | "deduction" }>;
  pf_applicable: boolean;
  pt_applicable: boolean;
  tds_monthly: number;
  ctc_monthly: number;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type PayrollLeavePolicy = {
  id: string;
  employee_id: string;
  policy_year: number;
  cl_quota: number;
  sl_quota: number;
  el_quota: number;
  leave_type_map: Record<string, string>;
  el_carry_forward_max: number;
  cl_carry_forward_max: number;
  sl_carry_forward_max: number;
  cl_opening_balance: number;
  sl_opening_balance: number;
  el_opening_balance: number;
  created_at: string;
  updated_at: string;
};

export type PayrollLeaveBalance = {
  id: string;
  employee_id: string;
  balance_year: number;
  leave_category: "cl" | "sl" | "el";
  opening_balance: number;
  accrued: number;
  consumed: number;
  adjusted: number;
  closing_balance: number;
  updated_at: string;
};

export type FestivalDateEntry = { year: number; date: string };

export type PayrollHoliday = {
  id: string;
  holiday_date: string | null; // null for non-recurring festivals with no date for the queried year
  name: string;
  is_optional: boolean;
  is_festival: boolean;
  is_recurring: boolean; // true = fixed month+day every year; false = year-specific dates
  festival_month: number | null;
  festival_day: number | null;
  festival_dates: FestivalDateEntry[];
  created_by: string;
  created_at: string;
};

// ── Query options ─────────────────────────────────────────────────────────────

export const payrollRunsQuery = () =>
  queryOptions({
    queryKey: ["payroll", "runs"],
    queryFn: async (): Promise<PayrollRun[]> => {
      const { data, error } = await (supabase as any)
        .from("payroll_runs")
        .select("*")
        .order("pay_period_year", { ascending: false })
        .order("pay_period_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PayrollRun[];
    },
    staleTime: 60_000,
  });

export const payrollRunQuery = (runId: string) =>
  queryOptions({
    queryKey: ["payroll", "run", runId],
    queryFn: async () => {
      const [runRes, entriesRes] = await Promise.all([
        (supabase as any).from("payroll_runs").select("*").eq("id", runId).single(),
        (supabase as any)
          .from("payroll_entries")
          .select("*")
          .eq("run_id", runId)
          .order("employee_id"),
      ]);
      if (runRes.error) throw runRes.error;
      const employeeIds = (entriesRes.data ?? []).map((e: any) => e.employee_id as string);
      const profilesRes =
        employeeIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, full_name, employee_id, department, position_title")
              .in("id", employeeIds)
          : { data: [] };
      return {
        run: runRes.data as PayrollRun,
        entries: (entriesRes.data ?? []) as PayrollEntry[],
        profiles: (profilesRes.data ?? []) as {
          id: string;
          full_name: string | null;
          employee_id: string | null;
          department: string | null;
          position_title: string | null;
        }[],
      };
    },
    staleTime: 30_000,
    enabled: !!runId,
  });

export const payrollEntryQuery = (runId: string, employeeId: string) =>
  queryOptions({
    queryKey: ["payroll", "entry", runId, employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("payroll_entries")
        .select("*")
        .eq("run_id", runId)
        .eq("employee_id", employeeId)
        .single();
      if (error) throw error;
      return data as PayrollEntry;
    },
    enabled: !!runId && !!employeeId,
  });

export const salaryStructureQuery = (employeeId: string) =>
  queryOptions({
    queryKey: ["payroll", "structure", employeeId],
    queryFn: async (): Promise<PayrollSalaryStructure | null> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await (supabase as any)
        .from("payroll_salary_structures")
        .select("*")
        .eq("employee_id", employeeId)
        .lte("effective_from", today)
        .or(`effective_to.is.null,effective_to.gte.${today}`)
        .order("effective_from", { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return (data ?? null) as PayrollSalaryStructure | null;
    },
    staleTime: 5 * 60_000,
    enabled: !!employeeId,
  });

export const leavePolicyQuery = (employeeId: string, year: number) =>
  queryOptions({
    queryKey: ["payroll", "leave-policy", employeeId, year],
    queryFn: async (): Promise<PayrollLeavePolicy | null> => {
      const { data, error } = await (supabase as any)
        .from("payroll_leave_policies")
        .select("*")
        .eq("employee_id", employeeId)
        .eq("policy_year", year)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return (data ?? null) as PayrollLeavePolicy | null;
    },
    staleTime: 5 * 60_000,
    enabled: !!employeeId,
  });

export const leaveBalancesQuery = (employeeId: string, year: number) =>
  queryOptions({
    queryKey: ["payroll", "leave-balances", employeeId, year],
    queryFn: async (): Promise<PayrollLeaveBalance[]> => {
      const { data, error } = await (supabase as any)
        .from("payroll_leave_balances")
        .select("*")
        .eq("employee_id", employeeId)
        .eq("balance_year", year);
      if (error) throw error;
      return (data ?? []) as PayrollLeaveBalance[];
    },
    staleTime: 60_000,
    enabled: !!employeeId,
  });

export const payrollHolidaysQuery = (year: number) =>
  queryOptions({
    queryKey: ["payroll", "holidays", year],
    queryFn: async (): Promise<PayrollHoliday[]> => {
      const [regularRes, festivalRes] = await Promise.all([
        (supabase as any)
          .from("payroll_holidays")
          .select("*")
          .eq("is_festival", false)
          .gte("holiday_date", `${year}-01-01`)
          .lte("holiday_date", `${year}-12-31`),
        (supabase as any).from("payroll_holidays").select("*").eq("is_festival", true),
      ]);
      if (regularRes.error) throw regularRes.error;
      if (festivalRes.error) throw festivalRes.error;

      const materialisedFestivals = (festivalRes.data ?? []).map((f: any) => {
        if (f.is_recurring !== false) {
          return {
            ...f,
            holiday_date: `${year}-${String(f.festival_month).padStart(2, "0")}-${String(f.festival_day).padStart(2, "0")}`,
          };
        }
        const entry = ((f.festival_dates ?? []) as FestivalDateEntry[]).find(
          (d) => Number(d.year) === year,
        );
        return { ...f, holiday_date: entry?.date ?? null };
      });

      const all: PayrollHoliday[] = [...(regularRes.data ?? []), ...materialisedFestivals];
      all.sort((a, b) => {
        if (!a.holiday_date) return 1;
        if (!b.holiday_date) return -1;
        return a.holiday_date.localeCompare(b.holiday_date);
      });
      return all;
    },
    staleTime: 10 * 60_000,
  });

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatPayPeriod(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function statusColor(status: PayrollRun["status"]): string {
  switch (status) {
    case "draft":
      return "secondary";
    case "processing":
      return "secondary";
    case "approved":
      return "default";
    case "paid":
      return "default";
    case "cancelled":
      return "destructive";
    default:
      return "secondary";
  }
}
