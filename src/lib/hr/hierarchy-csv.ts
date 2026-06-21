// Client-side CSV builders for the Employee Hierarchy module.
import { toCSV } from "@/lib/format/csv";
import type { HierarchyHistoryRow, OrgNode } from "./hierarchy.functions";

const ORG_COLS = [
  "employee_code",
  "full_name",
  "email",
  "designation",
  "department",
  "status",
  "manager_name",
  "manager_email",
  "depth",
  "reporting_path",
];

export function buildOrgTreeCsv(
  nodes: OrgNode[],
  extras: Map<string, { employee_code: string | null }> = new Map(),
): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rows = nodes.map((n) => {
    const mgr = n.reports_to ? (byId.get(n.reports_to) ?? null) : null;
    const path = (n.path ?? []).map((id) => byId.get(id)?.full_name ?? "—").join(" > ");
    return {
      employee_code: extras.get(n.id)?.employee_code ?? "",
      full_name: n.full_name ?? "",
      email: n.email ?? "",
      designation: n.position_title ?? "",
      department: n.department ?? "",
      status: n.status ?? "",
      manager_name: mgr?.full_name ?? "",
      manager_email: mgr?.email ?? "",
      depth: n.depth,
      reporting_path: path,
    };
  });
  return toCSV(rows, ORG_COLS);
}

const HIST_COLS = [
  "changed_at",
  "employee_name",
  "employee_email",
  "before_manager",
  "after_manager",
  "changed_by",
  "changed_by_email",
];

export function buildHistoryCsv(rows: HierarchyHistoryRow[]): string {
  const out = rows.map((r) => ({
    changed_at: r.changed_at,
    employee_name: r.employee.full_name ?? "",
    employee_email: r.employee.email ?? "",
    before_manager: r.old_manager?.full_name ?? "— none —",
    after_manager: r.new_manager?.full_name ?? "— none —",
    changed_by: r.actor?.full_name ?? "",
    changed_by_email: r.actor?.email ?? "",
  }));
  return toCSV(out, HIST_COLS);
}

export function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
