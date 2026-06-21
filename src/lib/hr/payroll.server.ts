import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ── Access guard ──────────────────────────────────────────────────────────────

export async function assertCallerCanManagePayroll(callerId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId);
  if (error) throw error;
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  const ok = roles.some((r) => ["admin", "super_admin", "hr_manager"].includes(r));
  if (!ok) throw new Error("forbidden: payroll management requires admin or hr_manager");
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type OtherComponent = {
  name: string;
  amount: number;
  type: "earning" | "deduction";
};

export type SalaryStructureInput = {
  employee_id: string;
  effective_from: string;
  effective_to?: string | null;
  basic_monthly: number;
  hra_monthly: number;
  ta_monthly: number;
  other_components?: OtherComponent[];
  pf_applicable: boolean;
  pt_applicable: boolean;
  tds_monthly: number;
  ctc_monthly: number;
  notes?: string | null;
};

export type LeavePolicyInput = {
  employee_id: string;
  policy_year: number;
  cl_quota: number;
  sl_quota: number;
  el_quota: number;
  leave_type_map?: Record<string, string>;
  el_carry_forward_max: number;
  cl_carry_forward_max: number;
  sl_carry_forward_max: number;
  cl_opening_balance: number;
  sl_opening_balance: number;
  el_opening_balance: number;
};

// ── Salary structure CRUD ─────────────────────────────────────────────────────

export async function upsertSalaryStructureServer(input: SalaryStructureInput, actorId: string) {
  const { data, error } = await supabaseAdmin
    .from("payroll_salary_structures" as never)
    .upsert(
      {
        ...input,
        other_components: input.other_components ?? [],
        created_by: actorId,
      } as never,
      { onConflict: "employee_id,effective_from" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getSalaryStructureServer(employeeId: string, asOfDate?: string) {
  const date = asOfDate ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("payroll_salary_structures" as never)
    .select("*")
    .eq("employee_id", employeeId)
    .lte("effective_from", date)
    .or("effective_to.is.null,effective_to.gte." + date)
    .order("effective_from", { ascending: false })
    .limit(1)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data ?? null;
}

export async function listSalaryStructuresServer(employeeId: string) {
  const { data, error } = await supabaseAdmin
    .from("payroll_salary_structures" as never)
    .select("*")
    .eq("employee_id", employeeId)
    .order("effective_from", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ── Leave policy CRUD ─────────────────────────────────────────────────────────

export async function upsertLeavePolicyServer(input: LeavePolicyInput, actorId: string) {
  const { data, error } = await supabaseAdmin
    .from("payroll_leave_policies" as never)
    .upsert({ ...input, created_by: actorId } as never, { onConflict: "employee_id,policy_year" })
    .select()
    .single();
  if (error) throw error;

  // Ensure leave balance rows exist for this employee+year
  await ensureLeaveBalancesServer(input.employee_id, input.policy_year, {
    cl: input.cl_opening_balance,
    sl: input.sl_opening_balance,
    el: input.el_opening_balance,
  });

  return data;
}

export async function getLeavePolicyServer(employeeId: string, year: number) {
  const { data, error } = await supabaseAdmin
    .from("payroll_leave_policies" as never)
    .select("*")
    .eq("employee_id", employeeId)
    .eq("policy_year", year)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data ?? null;
}

export async function getLeaveBalancesServer(employeeId: string, year: number) {
  const { data, error } = await supabaseAdmin
    .from("payroll_leave_balances" as never)
    .select("*")
    .eq("employee_id", employeeId)
    .eq("balance_year", year);
  if (error) throw error;
  return data ?? [];
}

export async function adjustLeaveBalanceServer(
  employeeId: string,
  year: number,
  category: "cl" | "sl" | "el",
  delta: number,
) {
  let error: unknown = null;
  try {
    await supabaseAdmin.rpc(
      "increment_leave_balance" as never,
      {
        p_employee_id: employeeId,
        p_year: year,
        p_category: category,
        p_delta: delta,
      } as never,
    );
  } catch (e) {
    error = e;
  }

  // Fallback: direct upsert if RPC not available
  const { data: existing } = (await supabaseAdmin
    .from("payroll_leave_balances" as never)
    .select("adjusted")
    .eq("employee_id", employeeId)
    .eq("balance_year", year)
    .eq("leave_category", category)
    .single()) as { data: { adjusted: number } | null };

  const newAdjusted = ((existing as any)?.adjusted ?? 0) + delta;
  const { error: upsertErr } = await supabaseAdmin.from("payroll_leave_balances" as never).upsert(
    {
      employee_id: employeeId,
      balance_year: year,
      leave_category: category,
      adjusted: newAdjusted,
    } as never,
    { onConflict: "employee_id,balance_year,leave_category" },
  );
  if (upsertErr) throw upsertErr;
  void error; // suppress unused var warning
}

async function ensureLeaveBalancesServer(
  employeeId: string,
  year: number,
  opening: { cl: number; sl: number; el: number },
) {
  const categories = ["cl", "sl", "el"] as const;
  for (const cat of categories) {
    await supabaseAdmin.from("payroll_leave_balances" as never).upsert(
      {
        employee_id: employeeId,
        balance_year: year,
        leave_category: cat,
        opening_balance: opening[cat],
      } as never,
      { onConflict: "employee_id,balance_year,leave_category", ignoreDuplicates: true },
    );
  }
}

// ── Holiday CRUD ──────────────────────────────────────────────────────────────

type UpsertHolidayInput = {
  id?: string;
  name: string;
  is_optional: boolean;
  // Regular holiday
  date?: string | null;
  // Festival
  is_festival?: boolean;
  is_recurring?: boolean;
  festival_month?: number | null;
  festival_day?: number | null;
  festival_dates?: Array<{ year: number; date: string }>;
};

export async function upsertHolidayServer(input: UpsertHolidayInput, actorId: string) {
  const {
    id,
    name,
    is_optional,
    date,
    is_festival,
    is_recurring = true,
    festival_month,
    festival_day,
    festival_dates = [],
  } = input;

  const payload: Record<string, unknown> = { name, is_optional, created_by: actorId };

  if (is_festival) {
    payload.is_festival = true;
    payload.is_recurring = is_recurring;
    payload.holiday_date = null;
    if (is_recurring) {
      payload.festival_month = festival_month;
      payload.festival_day = festival_day;
      payload.festival_dates = [];
    } else {
      payload.festival_month = null;
      payload.festival_day = null;
      payload.festival_dates = festival_dates;
    }
  } else {
    payload.is_festival = false;
    payload.is_recurring = true;
    payload.holiday_date = date;
    payload.festival_month = null;
    payload.festival_day = null;
    payload.festival_dates = [];
  }

  if (id) {
    const { data, error } = await supabaseAdmin
      .from("payroll_holidays" as never)
      .update(payload as never)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from("payroll_holidays" as never)
    .insert(payload as never)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteHolidayServer(holidayId: string) {
  const { error } = await supabaseAdmin
    .from("payroll_holidays" as never)
    .delete()
    .eq("id", holidayId);
  if (error) throw error;
}

export async function listHolidaysServer(year: number) {
  // Fetch regular holidays for the year
  const { data: regular, error: rErr } = await supabaseAdmin
    .from("payroll_holidays" as never)
    .select("*")
    .eq("is_festival", false as never)
    .gte("holiday_date", `${year}-01-01`)
    .lte("holiday_date", `${year}-12-31`)
    .order("holiday_date");
  if (rErr) throw rErr;

  // Fetch all festivals and materialise them for this year
  const { data: festivals, error: fErr } = await supabaseAdmin
    .from("payroll_holidays" as never)
    .select("*")
    .eq("is_festival", true as never);
  if (fErr) throw fErr;

  const materialisedFestivals = (festivals ?? []).map((f: any) => {
    if (f.is_recurring !== false) {
      const mm = String(f.festival_month).padStart(2, "0");
      const dd = String(f.festival_day).padStart(2, "0");
      return { ...f, holiday_date: `${year}-${mm}-${dd}` };
    }
    const entry = ((f.festival_dates ?? []) as { year: number; date: string }[]).find(
      (d) => Number(d.year) === year,
    );
    return { ...f, holiday_date: entry?.date ?? null };
  });

  const all = [...(regular ?? []), ...materialisedFestivals];
  all.sort((a: any, b: any) => a.holiday_date.localeCompare(b.holiday_date));
  return all;
}

// ── Payroll run lifecycle ─────────────────────────────────────────────────────

function getMonthBounds(year: number, month: number) {
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDate = new Date(year, month, 0);
  const lastDay = `${year}-${String(month).padStart(2, "0")}-${String(lastDate.getDate()).padStart(2, "0")}`;
  return { firstDay, lastDay, daysInMonth: lastDate.getDate() };
}

function computeWorkingDays(year: number, month: number, mandatoryHolidays: Set<string>): string[] {
  const { daysInMonth } = getMonthBounds(year, month);
  const working: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const iso = date.toISOString().slice(0, 10);
    if (date.getDay() === 0) continue; // exclude Sundays
    if (mandatoryHolidays.has(iso)) continue;
    working.push(iso);
  }
  return working;
}

function ptSlab(gross: number): number {
  if (gross <= 15000) return 0;
  if (gross <= 29999) return 150;
  return 200;
}

export async function createPayrollRunServer(year: number, month: number, actorId: string) {
  const holidays = await listHolidaysServer(year);
  const mandatoryHolidayDates = new Set(
    holidays.filter((h: any) => !h.is_optional).map((h: any) => h.holiday_date as string),
  );
  const workingDays = computeWorkingDays(year, month, mandatoryHolidayDates);

  const { data, error } = await supabaseAdmin
    .from("payroll_runs" as never)
    .insert({
      pay_period_year: year,
      pay_period_month: month,
      total_working_days: workingDays.length,
      status: "draft",
      created_by: actorId,
    } as never)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function computePayrollRunServer(runId: string, actorId: string) {
  const { data: run, error: runErr } = await supabaseAdmin
    .from("payroll_runs" as never)
    .select("*")
    .eq("id", runId)
    .single();
  if (runErr) throw runErr;

  const { pay_period_year: year, pay_period_month: month } = run as {
    pay_period_year: number;
    pay_period_month: number;
  };
  const { firstDay, lastDay } = getMonthBounds(year, month);

  const holidays = await listHolidaysServer(year);
  const mandatoryHolidayDates = new Set(
    holidays.filter((h: any) => !h.is_optional).map((h: any) => h.holiday_date as string),
  );
  const workingDaysList = computeWorkingDays(year, month, mandatoryHolidayDates);
  const workingDaysInMonth = workingDaysList.length;
  const workingDaysSet = new Set(workingDaysList);
  const holidaySet = new Set(holidays.map((h: any) => h.holiday_date as string));

  // Load all active employees
  const { data: employees, error: empErr } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, employee_id, department, position_title, firm_id")
    .eq("status", "active");
  if (empErr) throw empErr;

  const warnings: string[] = [];
  let entriesComputed = 0;

  for (const emp of (employees ?? []) as {
    id: string;
    full_name: string | null;
    employee_id: string | null;
  }[]) {
    // a. Active salary structure
    const structure = await getSalaryStructureServer(emp.id, lastDay);
    if (!structure) {
      warnings.push(`${emp.full_name ?? emp.id}: no active salary structure — skipped`);
      continue;
    }
    const s = structure as any;

    // b. Leave policy
    const leavePolicy = await getLeavePolicyServer(emp.id, year);
    const leaveTypeMap: Record<string, string> = (leavePolicy as any)?.leave_type_map ?? {
      vacation: "el",
      sick: "sl",
      personal: "cl",
      unpaid: "lwp",
      bereavement: "cl",
      other: "cl",
    };

    // c. Build attendance map from attendance_logs
    const { data: attLogs } = await supabaseAdmin
      .from("attendance_logs")
      .select("entry_date, auto_status, raw_status")
      .eq("matched_employee_id", emp.id)
      .gte("entry_date", firstDay)
      .lte("entry_date", lastDay);

    const attendanceMap = new Map<string, { autoStatus: string; rawStatus: string }>();
    for (const log of (attLogs ?? []) as {
      entry_date: string;
      auto_status: string | null;
      raw_status: string | null;
    }[]) {
      if (log.entry_date) {
        attendanceMap.set(log.entry_date, {
          autoStatus: log.auto_status ?? "",
          rawStatus: (log.raw_status ?? "").trim(),
        });
      }
    }

    // d. Load approved leaves overlapping the month
    const { data: leaves } = await supabaseAdmin
      .from("leave_requests")
      .select("start_date, end_date, days, type")
      .eq("employee_id", emp.id)
      .eq("status", "approved")
      .lte("start_date", lastDay)
      .gte("end_date", firstDay);

    // Build per-date leave map
    const leaveDateMap = new Map<string, "cl" | "sl" | "el" | "lwp">();
    for (const leave of (leaves ?? []) as {
      start_date: string;
      end_date: string;
      type: string;
    }[]) {
      const category = (leaveTypeMap[leave.type] ?? "cl") as "cl" | "sl" | "el" | "lwp";
      const start = new Date(leave.start_date);
      const end = new Date(leave.end_date);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        leaveDateMap.set(d.toISOString().slice(0, 10), category);
      }
    }

    // e-f. Classify each date in month
    let presentDays = 0;
    let halfDays = 0;
    const absentDays = 0;
    let weekOffDays = 0;
    let holidayDays = 0;
    let clDays = 0;
    let slDays = 0;
    let elDays = 0;
    let lwpDays = 0;

    const { daysInMonth } = getMonthBounds(year, month);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      const iso = date.toISOString().slice(0, 10);

      if (date.getDay() === 0) {
        weekOffDays += 1;
        continue;
      }
      if (holidaySet.has(iso) && mandatoryHolidayDates.has(iso)) {
        holidayDays += 1;
        continue;
      }

      const att = attendanceMap.get(iso);
      if (!att) {
        // No attendance record — treat as absent/LWP
        const leaveCategory = leaveDateMap.get(iso);
        if (leaveCategory && leaveCategory !== "lwp") {
          if (leaveCategory === "cl") clDays += 1;
          else if (leaveCategory === "sl") slDays += 1;
          else if (leaveCategory === "el") elDays += 1;
        } else {
          lwpDays += 1;
        }
        continue;
      }

      const raw = att.rawStatus;

      if (raw === "Week Off" || raw === "Week off") {
        weekOffDays += 1;
        continue;
      }
      if (raw === "FD" || att.autoStatus === "present") {
        presentDays += 1;
        continue;
      }
      if (raw === "HD") {
        halfDays += 1;
        continue;
      }
      if (raw === "HD/HD LWP" || raw === "HD/LWP") {
        halfDays += 0.5;
        lwpDays += 0.5;
        continue;
      }
      if (raw === "LWP") {
        lwpDays += 1;
        continue;
      }
      if (raw === "Absent" || att.autoStatus === "absent") {
        const leaveCategory = leaveDateMap.get(iso);
        if (leaveCategory && leaveCategory !== "lwp") {
          if (leaveCategory === "cl") clDays += 1;
          else if (leaveCategory === "sl") slDays += 1;
          else if (leaveCategory === "el") elDays += 1;
        } else {
          lwpDays += 1;
        }
        continue;
      }
      if (att.autoStatus === "half_day") {
        halfDays += 1;
        continue;
      }
      // Default: present (late, remote, etc.)
      presentDays += 1;
    }

    // g. Paid days
    const paidDays = presentDays + halfDays * 0.5 + clDays + slDays + elDays;
    const lopDays = lwpDays;
    const multiplier = workingDaysInMonth > 0 ? paidDays / workingDaysInMonth : 0;

    // h. Earnings breakdown
    const otherComponents: OtherComponent[] = Array.isArray(s.other_components)
      ? (s.other_components as OtherComponent[])
      : [];

    const earningsBreakdown: Array<{
      name: string;
      monthly_amount: number;
      actual_amount: number;
    }> = [
      {
        name: "Basic",
        monthly_amount: s.basic_monthly,
        actual_amount: round2(s.basic_monthly * multiplier),
      },
      {
        name: "HRA",
        monthly_amount: s.hra_monthly,
        actual_amount: round2(s.hra_monthly * multiplier),
      },
      {
        name: "Travel Allowance",
        monthly_amount: s.ta_monthly,
        actual_amount: round2(s.ta_monthly * multiplier),
      },
    ];
    for (const c of otherComponents.filter((c) => c.type === "earning")) {
      earningsBreakdown.push({
        name: c.name,
        monthly_amount: c.amount,
        actual_amount: round2(c.amount * multiplier),
      });
    }

    const grossEarnings = round2(earningsBreakdown.reduce((sum, e) => sum + e.actual_amount, 0));
    const basicActual = earningsBreakdown.find((e) => e.name === "Basic")?.actual_amount ?? 0;

    // i. Deductions
    const pfEmployee = s.pf_applicable ? round2(basicActual * 0.12) : 0;
    const pfEmployer = s.pf_applicable ? round2(basicActual * 0.12) : 0;
    const ptAmount = s.pt_applicable ? ptSlab(grossEarnings) : 0;
    const tdsAmount = round2(s.tds_monthly * multiplier);

    const otherDeductions: Array<{ name: string; amount: number }> = [];
    for (const c of otherComponents.filter((c) => c.type === "deduction")) {
      otherDeductions.push({ name: c.name, amount: round2(c.amount * multiplier) });
    }
    const otherDeductionsTotal = otherDeductions.reduce((sum, d) => sum + d.amount, 0);
    const totalDeductions = round2(pfEmployee + ptAmount + tdsAmount + otherDeductionsTotal);

    // j. Net
    const netPay = round2(grossEarnings - totalDeductions);

    // k. Upsert entry
    const { error: entryErr } = await supabaseAdmin.from("payroll_entries" as never).upsert(
      {
        run_id: runId,
        employee_id: emp.id,
        salary_structure_id: s.id,
        total_working_days: workingDaysInMonth,
        present_days: presentDays,
        half_days: halfDays,
        absent_days: absentDays,
        week_off_days: weekOffDays,
        holiday_days: holidayDays,
        cl_days: clDays,
        sl_days: slDays,
        el_days: elDays,
        lwp_days: lwpDays,
        paid_days: paidDays,
        lop_deduction_days: lopDays,
        earnings_breakdown: earningsBreakdown,
        gross_earnings: grossEarnings,
        pf_employee: pfEmployee,
        pf_employer: pfEmployer,
        pt_amount: ptAmount,
        tds_amount: tdsAmount,
        other_deductions: otherDeductions,
        total_deductions: totalDeductions,
        net_pay: netPay,
        is_locked: false,
        computed_at: new Date().toISOString(),
      } as never,
      { onConflict: "run_id,employee_id" },
    );
    if (entryErr) {
      warnings.push(`${emp.full_name ?? emp.id}: error saving entry — ${entryErr.message}`);
      continue;
    }

    entriesComputed++;
  }

  // Update run status
  await supabaseAdmin
    .from("payroll_runs" as never)
    .update({ computed_at: new Date().toISOString(), status: "draft" } as never)
    .eq("id", runId);

  return { runId, entriesComputed, warnings };
}

export async function approvePayrollRunServer(runId: string, actorId: string) {
  // Lock all entries
  const { error: lockErr } = await supabaseAdmin
    .from("payroll_entries" as never)
    .update({ is_locked: true } as never)
    .eq("run_id", runId);
  if (lockErr) throw lockErr;

  // Update leave balances for consumed leaves
  const { data: entries } = await supabaseAdmin
    .from("payroll_entries" as never)
    .select("employee_id, cl_days, sl_days, el_days")
    .eq("run_id", runId);

  const { data: run } = await supabaseAdmin
    .from("payroll_runs" as never)
    .select("pay_period_year")
    .eq("id", runId)
    .single();
  const year = (run as any)?.pay_period_year ?? new Date().getFullYear();

  for (const entry of (entries ?? []) as {
    employee_id: string;
    cl_days: number;
    sl_days: number;
    el_days: number;
  }[]) {
    for (const [cat, days] of [
      ["cl", entry.cl_days],
      ["sl", entry.sl_days],
      ["el", entry.el_days],
    ] as const) {
      if (days > 0) {
        await supabaseAdmin.from("payroll_leave_balances" as never).upsert(
          {
            employee_id: entry.employee_id,
            balance_year: year,
            leave_category: cat,
            consumed: days,
          } as never,
          { onConflict: "employee_id,balance_year,leave_category" },
        );
      }
    }
  }

  // Update run status
  const { data, error } = await supabaseAdmin
    .from("payroll_runs" as never)
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: actorId,
    } as never)
    .eq("id", runId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markPayrollRunPaidServer(runId: string, actorId: string) {
  const { data, error } = await supabaseAdmin
    .from("payroll_runs" as never)
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      paid_by: actorId,
    } as never)
    .eq("id", runId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function overridePayrollEntryServer(
  entryId: string,
  overrides: Partial<{
    gross_earnings: number;
    total_deductions: number;
    net_pay: number;
    lwp_days: number;
    paid_days: number;
  }>,
  notes: string,
) {
  const { data, error } = await supabaseAdmin
    .from("payroll_entries" as never)
    .update({ ...overrides, override_notes: notes } as never)
    .eq("id", entryId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Read helpers ──────────────────────────────────────────────────────────────

export async function listPayrollRunsServer() {
  const { data, error } = await supabaseAdmin
    .from("payroll_runs" as never)
    .select("*")
    .order("pay_period_year", { ascending: false })
    .order("pay_period_month", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPayrollRunServer(runId: string) {
  const { data: run, error: runErr } = await supabaseAdmin
    .from("payroll_runs" as never)
    .select("*")
    .eq("id", runId)
    .single();
  if (runErr) throw runErr;

  const { data: entries, error: entErr } = await supabaseAdmin
    .from("payroll_entries" as never)
    .select("*")
    .eq("run_id", runId)
    .order("employee_id");
  if (entErr) throw entErr;

  const employeeIds = (entries ?? []).map((e: any) => e.employee_id as string);
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, employee_id, department, position_title")
    .in("id", employeeIds.length > 0 ? employeeIds : ["00000000-0000-0000-0000-000000000000"]);

  return { run, entries: entries ?? [], profiles: profiles ?? [] };
}

export async function getPayrollEntryServer(runId: string, employeeId: string) {
  const { data, error } = await supabaseAdmin
    .from("payroll_entries" as never)
    .select("*")
    .eq("run_id", runId)
    .eq("employee_id", employeeId)
    .single();
  if (error) throw error;
  return data;
}

// ── Setup overview ────────────────────────────────────────────────────────────

export async function getPayrollSetupOverviewServer(year: number) {
  // Exclude clients regardless of provisioning path — filter by role, not provisioned_via,
  // because firm_hub clients also land in this table (e.g. clients from a B2B firm).
  const { data: internalRoles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("role", ["super_admin", "admin", "hr_manager", "employee"]);
  const internalIds = [...new Set((internalRoles ?? []).map((r: any) => r.user_id as string))];

  const { data: employees } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, full_name, employee_id, department, position_title, attendance_settings_id, holiday_calendar_year",
    )
    .eq("status", "active")
    .in("id", internalIds.length > 0 ? internalIds : ["00000000-0000-0000-0000-000000000000"])
    .order("full_name");

  const { data: structures } = await supabaseAdmin
    .from("payroll_salary_structures" as never)
    .select("employee_id, effective_from, effective_to, ctc_monthly")
    .is("effective_to", null);

  const { data: policies } = await supabaseAdmin
    .from("payroll_leave_policies" as never)
    .select("employee_id, policy_year, cl_quota, sl_quota, el_quota")
    .eq("policy_year", year);

  // Fetch all named attendance policies for the dropdown
  const { data: attendancePolicies } = await supabaseAdmin
    .from("company_hr_settings")
    .select("id, name, standard_start_time, standard_end_time")
    .order("name" as never);

  const structureMap = new Map((structures ?? []).map((s: any) => [s.employee_id as string, s]));
  const policyMap = new Map((policies ?? []).map((p: any) => [p.employee_id as string, p]));

  return {
    employees: (employees ?? []).map((emp: any) => ({
      ...emp,
      salaryStructure: structureMap.get(emp.id) ?? null,
      leavePolicy: policyMap.get(emp.id) ?? null,
    })),
    attendancePolicies: (attendancePolicies ?? []) as unknown as {
      id: string;
      name: string | null;
      standard_start_time: string;
      standard_end_time: string;
      el_quota: number;
      cl_quota: number;
      sl_quota: number;
      el_carry_forward_max: number;
      cl_carry_forward_max: number;
      sl_carry_forward_max: number;
      el_opening_balance: number;
      cl_opening_balance: number;
      sl_opening_balance: number;
      opening_balance_date: string | null;
    }[],
  };
}

export async function updateEmployeePayrollAssignmentsServer(args: {
  employeeId: string;
  attendanceSettingsId: string | null;
  holidayCalendarYear: number | null;
}) {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      attendance_settings_id: args.attendanceSettingsId,
      holiday_calendar_year: args.holidayCalendarYear,
    } as never)
    .eq("id", args.employeeId);
  if (error) throw error;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
