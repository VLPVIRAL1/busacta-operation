// Server-only helpers for the Employee Hierarchy module.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type OrgNode = {
  id: string;
  full_name: string | null;
  email: string | null;
  position_title: string | null;
  department: string | null;
  avatar_url: string | null;
  status: string | null;
  /** All manager IDs this employee currently reports to. */
  manager_ids: string[];
};

export async function getOrgTreeServer(): Promise<OrgNode[]> {
  // Fetch all internal (non-client) profiles.
  const { data: profiles, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, position_title, department, avatar_url, status")
    .neq("provisioned_via" as never, "direct_client_hub" as never);
  if (pErr) throw pErr;

  // Fetch all manager relationships from the junction table.
  const { data: relations, error: rErr } = await supabaseAdmin
    .from("employee_managers" as never)
    .select("employee_id, manager_id");
  if (rErr) throw rErr;

  // Build employee_id → manager_ids[] map.
  const managerMap = new Map<string, string[]>();
  for (const r of (relations ?? []) as { employee_id: string; manager_id: string }[]) {
    const arr = managerMap.get(r.employee_id) ?? [];
    arr.push(r.manager_id);
    managerMap.set(r.employee_id, arr);
  }

  return (profiles ?? []).map((p: any) => ({
    id: p.id,
    full_name: p.full_name ?? null,
    email: p.email ?? null,
    position_title: p.position_title ?? null,
    department: p.department ?? null,
    avatar_url: p.avatar_url ?? null,
    status: p.status ?? null,
    manager_ids: managerMap.get(p.id) ?? [],
  }));
}

/** Returns the set of descendant ids for the given employee — used to prevent
 *  cycle creation in the manager picker. */
export async function listDescendantIdsServer(employeeId: string): Promise<string[]> {
  const tree = await getOrgTreeServer();
  const descendants = new Set<string>();
  const stack = [employeeId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const n of tree) {
      if (n.manager_ids.includes(id) && !descendants.has(n.id)) {
        descendants.add(n.id);
        stack.push(n.id);
      }
    }
  }
  return [...descendants];
}

/** Replace all managers for an employee with the given set. */
export async function setManagersServer(args: {
  employeeId: string;
  managerIds: string[];
  actorId: string;
}) {
  const { employeeId, managerIds, actorId } = args;

  if (managerIds.includes(employeeId)) {
    throw new Error("An employee cannot be their own manager");
  }

  // Read current managers.
  const { data: current, error: cErr } = await supabaseAdmin
    .from("employee_managers" as never)
    .select("manager_id")
    .eq("employee_id", employeeId);
  if (cErr) throw cErr;

  const oldIds = ((current ?? []) as { manager_id: string }[]).map((r) => r.manager_id);
  const newIds = [...new Set(managerIds)];

  const toAdd = newIds.filter((id) => !oldIds.includes(id));
  const toRemove = oldIds.filter((id) => !newIds.includes(id));

  if (toAdd.length === 0 && toRemove.length === 0) {
    return { ok: true, unchanged: true };
  }

  if (toRemove.length > 0) {
    const { error } = await supabaseAdmin
      .from("employee_managers" as never)
      .delete()
      .eq("employee_id", employeeId)
      .in("manager_id", toRemove);
    if (error) throw error;
  }

  if (toAdd.length > 0) {
    const { error } = await supabaseAdmin
      .from("employee_managers" as never)
      .insert(toAdd.map((manager_id) => ({ employee_id: employeeId, manager_id })) as never);
    if (error) throw error;
  }

  // Keep profiles.reports_to in sync with the first manager (or null).
  const primaryManager = newIds[0] ?? null;
  await supabaseAdmin
    .from("profiles")
    .update({ reports_to: primaryManager } as never)
    .eq("id", employeeId);

  // History rows for each change.
  const historyRows = [
    ...toAdd.map((mid) => ({
      employee_id: employeeId,
      old_manager_id: null,
      new_manager_id: mid,
      changed_by: actorId,
    })),
    ...toRemove.map((mid) => ({
      employee_id: employeeId,
      old_manager_id: mid,
      new_manager_id: null,
      changed_by: actorId,
    })),
  ];
  if (historyRows.length > 0) {
    await supabaseAdmin.from("profiles_hierarchy_history" as never).insert(historyRows as never);
  }

  return { ok: true, unchanged: false };
}

export type HierarchyHistoryRow = {
  id: string;
  changed_at: string;
  employee: { id: string; full_name: string | null; email: string | null };
  old_manager: { id: string; full_name: string | null } | null;
  new_manager: { id: string; full_name: string | null } | null;
  actor: { id: string; full_name: string | null; email: string | null } | null;
};

export async function listHierarchyHistoryServer(args: {
  employeeId?: string | null;
  actorId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
  unlimited?: boolean;
}): Promise<{ rows: HierarchyHistoryRow[]; total: number }> {
  const unlimited = !!args.unlimited;
  const limit = unlimited ? 5000 : Math.min(Math.max(args.limit ?? 50, 1), 200);
  const offset = unlimited ? 0 : Math.max(args.offset ?? 0, 0);

  let searchIds: string[] | null = null;
  const term = (args.search ?? "").trim();
  if (term) {
    const pattern = `%${term.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const { data: matches, error: mErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(500);
    if (mErr) throw mErr;
    searchIds = (matches ?? []).map((p: { id: string }) => p.id);
    if (searchIds.length === 0) return { rows: [], total: 0 };
  }

  let q = supabaseAdmin
    .from("profiles_hierarchy_history" as never)
    .select("id, changed_at, employee_id, old_manager_id, new_manager_id, changed_by", {
      count: "exact",
    })
    .order("changed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (args.employeeId) q = q.eq("employee_id", args.employeeId);
  if (args.actorId) q = q.eq("changed_by", args.actorId);
  if (args.fromDate) q = q.gte("changed_at", args.fromDate);
  if (args.toDate) {
    const to = args.toDate.length === 10 ? `${args.toDate}T23:59:59.999Z` : args.toDate;
    q = q.lte("changed_at", to);
  }
  if (searchIds) {
    const list = `(${searchIds.join(",")})`;
    q = q.or(`employee_id.in.${list},changed_by.in.${list}`);
  }

  const { data, error, count } = await q;
  if (error) throw error;

  const raw = (data ?? []) as Array<{
    id: string;
    changed_at: string;
    employee_id: string;
    old_manager_id: string | null;
    new_manager_id: string | null;
    changed_by: string;
  }>;

  const ids = new Set<string>();
  for (const r of raw) {
    ids.add(r.employee_id);
    ids.add(r.changed_by);
    if (r.old_manager_id) ids.add(r.old_manager_id);
    if (r.new_manager_id) ids.add(r.new_manager_id);
  }

  const profileById = new Map<
    string,
    { id: string; full_name: string | null; email: string | null }
  >();
  if (ids.size) {
    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", [...ids]);
    if (pErr) throw pErr;
    for (const p of profiles ?? []) {
      profileById.set(p.id, { id: p.id, full_name: p.full_name ?? null, email: p.email ?? null });
    }
  }

  const rows: HierarchyHistoryRow[] = raw.map((r) => ({
    id: r.id,
    changed_at: r.changed_at,
    employee: profileById.get(r.employee_id) ?? { id: r.employee_id, full_name: null, email: null },
    old_manager: r.old_manager_id
      ? { id: r.old_manager_id, full_name: profileById.get(r.old_manager_id)?.full_name ?? null }
      : null,
    new_manager: r.new_manager_id
      ? { id: r.new_manager_id, full_name: profileById.get(r.new_manager_id)?.full_name ?? null }
      : null,
    actor: profileById.get(r.changed_by) ?? null,
  }));

  return { rows, total: count ?? rows.length };
}
