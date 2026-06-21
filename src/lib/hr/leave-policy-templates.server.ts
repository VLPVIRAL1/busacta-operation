import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type LeavePolicyTemplate = {
  id: string;
  name: string | null;
  is_active: boolean;
  standard_start_time: string;
  standard_end_time: string;
  grace_period_minutes: number;
  early_checkout_grace_minutes: number;
  min_hours_full_day: number;
  min_hours_half_day: number;
  el_quota: number;
  cl_quota: number;
  sl_quota: number;
  el_carry_forward_max: number;
  cl_carry_forward_max: number;
  sl_carry_forward_max: number;
  opening_balance_date: string | null;
  el_opening_balance: number;
  cl_opening_balance: number;
  sl_opening_balance: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // virtual — populated by joining leave_policy_assignments
  leave_policy_assignments: { employee_id: string }[];
};

export async function listLeavePolicyTemplatesServer(): Promise<LeavePolicyTemplate[]> {
  const { data: policies, error } = await supabaseAdmin
    .from("company_hr_settings" as any)
    .select("*")
    .order("name");
  if (error) throw error;

  const ids = (policies ?? []).map((p: any) => p.id as string);
  let assignments: { attendance_settings_id: string; id: string }[] = [];
  if (ids.length > 0) {
    const { data: aData } = await supabaseAdmin
      .from("profiles" as any)
      .select("id, attendance_settings_id")
      .in("attendance_settings_id", ids);
    assignments = (aData ?? []) as unknown as typeof assignments;
  }

  return (policies ?? []).map((p: any) => ({
    ...p,
    leave_policy_assignments: assignments
      .filter((a) => a.attendance_settings_id === p.id)
      .map((a) => ({ employee_id: a.id })),
  })) as LeavePolicyTemplate[];
}

export async function upsertLeavePolicyTemplateServer(
  input: Partial<LeavePolicyTemplate> & { id?: string; name: string },
  userId: string,
): Promise<LeavePolicyTemplate> {
  const { id, leave_policy_assignments: _assignments, ...rest } = input as any;
  const payload = { ...rest, updated_by: userId };
  if (id) {
    const { data, error } = await supabaseAdmin
      .from("company_hr_settings" as any)
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return { ...(data as any), leave_policy_assignments: [] };
  }
  const { data, error } = await supabaseAdmin
    .from("company_hr_settings" as any)
    .insert({ ...payload, is_active: true, created_by: userId })
    .select()
    .single();
  if (error) throw error;
  return { ...(data as any), leave_policy_assignments: [] };
}

export async function deleteLeavePolicyTemplateServer(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("company_hr_settings" as any)
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function toggleLeavePolicyActiveServer(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabaseAdmin
    .from("company_hr_settings" as any)
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw error;
}

export async function applyLeavePolicyTemplateServer(
  policyId: string,
  employeeIds: string[],
  userId: string,
): Promise<void> {
  const { data: tpl, error: tErr } = await supabaseAdmin
    .from("company_hr_settings" as any)
    .select("*")
    .eq("id", policyId)
    .single();
  if (tErr) throw tErr;

  const currentYear = new Date().getFullYear();

  // Update profiles.attendance_settings_id for selected employees
  if (employeeIds.length > 0) {
    const { error: pErr } = await supabaseAdmin
      .from("profiles" as any)
      .update({ attendance_settings_id: policyId })
      .in("id", employeeIds);
    if (pErr) throw pErr;

    // Also seed payroll_leave_policies for current year
    const policies = employeeIds.map((empId) => ({
      employee_id: empId,
      policy_year: currentYear,
      el_quota: (tpl as any).el_quota,
      cl_quota: (tpl as any).cl_quota,
      sl_quota: (tpl as any).sl_quota,
      el_carry_forward_max: (tpl as any).el_carry_forward_max,
      cl_carry_forward_max: (tpl as any).cl_carry_forward_max,
      sl_carry_forward_max: (tpl as any).sl_carry_forward_max,
      el_opening_balance: (tpl as any).el_opening_balance,
      cl_opening_balance: (tpl as any).cl_opening_balance,
      sl_opening_balance: (tpl as any).sl_opening_balance,
      created_by: userId,
    }));
    const { error: lpErr } = await supabaseAdmin
      .from("payroll_leave_policies" as any)
      .upsert(policies, { onConflict: "employee_id,policy_year" });
    if (lpErr) throw lpErr;
  }
}
