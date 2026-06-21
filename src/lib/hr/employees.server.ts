// Server-only helpers for HR employee creation/management.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { enforcePortalLockout, verifyPortalLockout } from "./portal-lockout.server";
import { resolvePasswordResetUrl } from "@/lib/shared/request-origin.server";

export type InternalRole = "employee" | "admin" | "super_admin" | "hr_manager";

export type PermissionOverride = boolean | "inherit";
export type PermissionMap = Record<string, PermissionOverride>;

export type CreateEmployeeInput = {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  employee_id: string;
  department?: "ops" | "finance" | "hr" | "exec" | null;
  position?: string | null; // position_type enum
  position_title?: string | null;
  employment_type?: "full_time" | "part_time" | "contractor" | "intern" | null;
  join_date?: string | null;
  assigned_firm_id?: string | null;
  system_role: InternalRole;
  subrole_id?: string | null;
  permissions?: PermissionMap;
};

const INTERNAL_ROLES: InternalRole[] = ["employee", "admin", "super_admin", "hr_manager"];

function randomPassword(len = 24) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(
    bytes,
    (b) => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%"[b % 60],
  ).join("");
}

export async function assertCallerCanManageHr(callerId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId);
  if (error) throw error;
  const roles = (data ?? []).map((r: any) => r.role);
  const ok = roles.some((r: string) => ["admin", "super_admin", "hr_manager"].includes(r));
  if (!ok) throw new Error("forbidden: HR management requires admin or hr_manager");
}

async function writePermissionMap(
  userId: string,
  perms: PermissionMap | undefined,
  actorId: string | null,
): Promise<{ before: PermissionMap; after: PermissionMap } | null> {
  if (!perms || Object.keys(perms).length === 0) return null;
  const admin = supabaseAdmin;

  // Snapshot current permissions for diff.
  const { data: existing } = await admin
    .from("user_hub_permissions" as never)
    .select("module_key, allowed")
    .eq("user_id", userId);
  const before: PermissionMap = {};
  for (const r of (existing ?? []) as { module_key: string; allowed: boolean }[]) {
    before[r.module_key] = r.allowed;
  }

  const upserts: {
    user_id: string;
    module_key: string;
    allowed: boolean;
    updated_by: string | null;
  }[] = [];
  const deletes: string[] = [];
  for (const [mk, v] of Object.entries(perms)) {
    if (v === "inherit") deletes.push(mk);
    else upserts.push({ user_id: userId, module_key: mk, allowed: v, updated_by: actorId });
  }
  if (upserts.length > 0) {
    await admin
      .from("user_hub_permissions" as never)
      .upsert(upserts as never, { onConflict: "user_id,module_key" });
  }
  for (const mk of deletes) {
    await admin
      .from("user_hub_permissions" as never)
      .delete()
      .eq("user_id", userId)
      .eq("module_key", mk);
  }

  const after: PermissionMap = { ...before };
  for (const [mk, v] of Object.entries(perms)) {
    if (v === "inherit") delete after[mk];
    else after[mk] = v;
  }
  return { before, after };
}

export type CreateEmployeeOptions = {
  importRunId?: string | null;
  actorId: string;
};

export async function createEmployeeServer(
  input: CreateEmployeeInput,
  opts: CreateEmployeeOptions,
) {
  const admin = supabaseAdmin;
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("Email is required");

  // SECURITY GUARDRAIL: never allow client role here.
  if (!INTERNAL_ROLES.includes(input.system_role)) {
    throw new Error("Invalid role: HR can only assign internal roles (no client).");
  }

  // 1. Create auth user (or reuse existing).
  let userId: string | null = null;
  const created = await admin.auth.admin.createUser({
    email,
    password: randomPassword(),
    email_confirm: true,
    user_metadata: {
      full_name: `${input.first_name} ${input.last_name}`.trim(),
      portal: false,
    },
  });

  if (created.error) {
    if (!/already|exists|registered/i.test(created.error.message)) throw created.error;
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (list.error) throw list.error;
    const existing = list.data.users.find((u) => (u.email || "").toLowerCase() === email);
    if (!existing) throw created.error;
    userId = existing.id;
  } else {
    userId = created.data.user?.id ?? null;
  }
  if (!userId) throw new Error("Failed to resolve user id");

  // 2. Upsert profile.
  const fullName = `${input.first_name} ${input.last_name}`.trim();
  const profilePatch: Record<string, unknown> = {
    id: userId,
    email,
    full_name: fullName,
    first_name: input.first_name,
    last_name: input.last_name,
    phone: input.phone ?? null,
    avatar_url: input.avatar_url ?? null,
    employee_id: input.employee_id,
    department: input.department ?? null,
    position: input.position ?? "other",
    position_title: input.position_title ?? null,
    employment_type: input.employment_type ?? null,
    join_date: input.join_date ?? null,
    firm_id: input.assigned_firm_id ?? null,
    status: "active",
    portal_enabled: false,
    provisioned_via: "hr_hub",
  };
  const { error: profileErr } = await admin
    .from("profiles")
    .upsert(profilePatch as never, { onConflict: "id" });
  if (profileErr) throw profileErr;

  // 3. Assign internal role (with optional sub-role).
  const { error: roleErr } = await admin.from("user_roles").upsert(
    {
      user_id: userId,
      role: input.system_role as never,
      subrole_id: input.subrole_id ?? null,
    } as never,
    { onConflict: "user_id,role" },
  );
  if (roleErr) throw roleErr;

  // 4. Persist permission overrides (if any).
  const permDiff = await writePermissionMap(userId, input.permissions, opts.actorId);

  // 5. Send password reset so the user sets their own password.
  try {
    await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: resolvePasswordResetUrl() },
    });
  } catch (e) {
    console.warn("[hr] generateLink failed (non-fatal):", e);
  }

  // 6. Enforce + verify portal lockout (end-to-end).
  await enforcePortalLockout(userId);
  const lockout = await verifyPortalLockout(userId);

  if (!lockout.ok) {
    throw new Error(`Portal lockout verification failed: ${lockout.issues.join("; ")}`);
  }

  return { ok: true, userId, employeeId: input.employee_id };
}

export async function deactivateEmployeeServer(args: {
  userId: string;
  actorId: string;
  separationType: "inactive" | "left";
  effectiveDate: string;
}) {
  const admin = supabaseAdmin;
  const { data: before } = await admin
    .from("profiles")
    .select("status, deactivated_at, deactivated_by, status_effective_date, separation_type")
    .eq("id", args.userId)
    .maybeSingle();
  const after = {
    status: args.separationType,
    deactivated_at: new Date().toISOString(),
    deactivated_by: args.actorId,
    status_effective_date: args.effectiveDate,
    separation_type: args.separationType,
  };
  const { error: upd } = await admin
    .from("profiles")
    .update(after as never)
    .eq("id", args.userId);
  if (upd) throw upd;
  const ban = await admin.auth.admin.updateUserById(args.userId, {
    ban_duration: "876000h",
  } as any);
  if (ban.error) throw ban.error;
  return { ok: true };
}

export async function setFirmAssignmentsServer(args: {
  userId: string;
  firmIds: string[];
  actorId: string;
}) {
  const admin = supabaseAdmin;
  const { error: delErr } = await admin
    .from("employee_firm_assignments" as never)
    .delete()
    .eq("employee_id", args.userId);
  if (delErr) throw delErr;
  if (args.firmIds.length > 0) {
    const rows = args.firmIds.map((fid) => ({
      employee_id: args.userId,
      firm_id: fid,
      created_by: args.actorId,
    }));
    const { error: insErr } = await admin
      .from("employee_firm_assignments" as never)
      .insert(rows as never);
    if (insErr) throw insErr;
  }
  return { ok: true };
}

export async function setClientAssignmentsServer(args: {
  userId: string;
  clientIds: string[];
  actorId: string;
}) {
  const admin = supabaseAdmin;
  const { error: delErr } = await admin
    .from("employee_client_assignments" as never)
    .delete()
    .eq("employee_id", args.userId);
  if (delErr) throw delErr;
  if (args.clientIds.length > 0) {
    const rows = args.clientIds.map((cid) => ({
      employee_id: args.userId,
      client_id: cid,
      created_by: args.actorId,
    }));
    const { error: insErr } = await admin
      .from("employee_client_assignments" as never)
      .insert(rows as never);
    if (insErr) throw insErr;
  }
  return { ok: true };
}

export async function reactivateEmployeeServer(args: { userId: string; actorId: string }) {
  const admin = supabaseAdmin;
  const { data: before } = await admin
    .from("profiles")
    .select("status, deactivated_at, deactivated_by")
    .eq("id", args.userId)
    .maybeSingle();
  const after = { status: "active", deactivated_at: null, deactivated_by: null };
  const { error: upd } = await admin
    .from("profiles")
    .update(after as never)
    .eq("id", args.userId);
  if (upd) throw upd;
  const unban = await admin.auth.admin.updateUserById(args.userId, {
    ban_duration: "none",
  } as any);
  if (unban.error) throw unban.error;

  // Re-enforce portal lockout on reactivation.
  await enforcePortalLockout(args.userId);
  const lockout = await verifyPortalLockout(args.userId);

  if (!lockout.ok) {
    throw new Error(
      `Portal lockout verification failed on reactivate: ${lockout.issues.join("; ")}`,
    );
  }
  return { ok: true };
}

export async function updateEmployeeServer(args: {
  userId: string;
  patch: Partial<Omit<CreateEmployeeInput, "email" | "system_role" | "permissions">>;
  permissions?: PermissionMap;
  actorId: string;
}) {
  const admin = supabaseAdmin;
  const p = args.patch;
  const update: Record<string, unknown> = {};
  if (p.first_name !== undefined || p.last_name !== undefined) {
    update.first_name = p.first_name ?? null;
    update.last_name = p.last_name ?? null;
    update.full_name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  }
  for (const k of [
    "phone",
    "avatar_url",
    "specialty",
    "employee_id",
    "department",
    "position",
    "position_title",
    "employment_type",
    "join_date",
  ] as const) {
    if ((p as any)[k] !== undefined) update[k] = (p as any)[k];
  }
  if (p.assigned_firm_id !== undefined) update.firm_id = p.assigned_firm_id;

  let before: Record<string, unknown> | null = null;
  if (Object.keys(update).length > 0) {
    const { data: snapshot } = await admin
      .from("profiles")
      .select(Object.keys(update).join(","))
      .eq("id", args.userId)
      .maybeSingle();
    before = (snapshot ?? null) as never;
    const { error } = await admin
      .from("profiles")
      .update(update as never)
      .eq("id", args.userId);
    if (error) throw error;
  }

  if (args.permissions) {
    await writePermissionMap(args.userId, args.permissions, args.actorId);
  }

  return { ok: true };
}

export async function updateEmployeeEmailServer(args: {
  userId: string;
  email: string;
  actorId: string;
}) {
  const admin = supabaseAdmin;
  const email = args.email.trim().toLowerCase();
  if (!email) throw new Error("Email is required");

  // Update the login identity in auth.users, confirmed immediately so the
  // employee can keep signing in with the new address.
  const updated = await admin.auth.admin.updateUserById(args.userId, {
    email,
    email_confirm: true,
  } as any);
  if (updated.error) {
    if (/already|exists|registered|duplicate|in use/i.test(updated.error.message)) {
      throw new Error("That email is already in use by another account.");
    }
    throw updated.error;
  }

  // Mirror onto the profile row so directory listings stay in sync.
  const { error } = await admin
    .from("profiles")
    .update({ email } as never)
    .eq("id", args.userId);
  if (error) throw error;

  return { ok: true };
}

export type BankAccountInput = {
  id?: string;
  employeeId: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  ifscCode?: string | null;
  accountType: "savings" | "current" | "salary";
  isPayrollAccount: boolean;
};

export async function upsertBankAccountServer(args: { input: BankAccountInput; actorId: string }) {
  const admin = supabaseAdmin;
  const { input, actorId } = args;

  if (input.isPayrollAccount) {
    // Clear any existing payroll flag for this employee first
    await admin
      .from("employee_bank_accounts" as never)
      .update({ is_payroll_account: false } as never)
      .eq("employee_id", input.employeeId)
      .neq("id", input.id ?? "00000000-0000-0000-0000-000000000000");
  }

  const row = {
    employee_id: input.employeeId,
    bank_name: input.bankName,
    account_holder_name: input.accountHolderName,
    account_number: input.accountNumber,
    ifsc_code: input.ifscCode ?? null,
    account_type: input.accountType,
    is_payroll_account: input.isPayrollAccount,
    created_by: actorId,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await admin
      .from("employee_bank_accounts" as never)
      .update(row as never)
      .eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await admin
      .from("employee_bank_accounts" as never)
      .insert({ ...row } as never);
    if (error) throw error;
  }

  return { ok: true };
}

export async function deleteBankAccountServer(args: {
  accountId: string;
  employeeId: string;
  actorId: string;
}) {
  const admin = supabaseAdmin;
  const { error } = await admin
    .from("employee_bank_accounts" as never)
    .delete()
    .eq("id", args.accountId)
    .eq("employee_id", args.employeeId);
  if (error) throw error;
  return { ok: true };
}

// ── Specialties ───────────────────────────────────────────────────────

export type SpecialtyInput = {
  id?: string;
  employeeId: string;
  specialty: string;
  description?: string | null;
};

export async function upsertSpecialtyServer(args: { input: SpecialtyInput; actorId: string }) {
  const admin = supabaseAdmin;
  const { input, actorId } = args;

  const row = {
    employee_id: input.employeeId,
    specialty: input.specialty,
    description: input.description ?? null,
    created_by: actorId,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { error } = await admin
      .from("employee_specialties" as never)
      .update(row as never)
      .eq("id", input.id);
    if (error) throw error;
  } else {
    const { error } = await admin.from("employee_specialties" as never).insert(row as never);
    if (error) throw error;
  }

  return { ok: true };
}

export async function deleteSpecialtyServer(args: {
  specialtyId: string;
  employeeId: string;
  actorId: string;
}) {
  const admin = supabaseAdmin;
  const { error } = await admin
    .from("employee_specialties" as never)
    .delete()
    .eq("id", args.specialtyId)
    .eq("employee_id", args.employeeId);
  if (error) throw error;
  return { ok: true };
}
