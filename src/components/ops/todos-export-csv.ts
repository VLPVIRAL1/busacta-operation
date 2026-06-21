import type { TodoRow } from "@/lib/queries/ops.queries";
import { STAGE_STATE_LABEL, COMPLEXITY_LABEL } from "@/components/ops/todos-color-map";

export type CsvColumn = { key: string; label: string };

function esc(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtDate(iso: string | null, withTime = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
}

function peopleNames(
  row: TodoRow,
  role: "assignee" | "reviewer",
  nameById: Map<string, string>,
): string {
  const ids = (row.task_assignees ?? []).filter((p) => p.role === role).map((p) => p.user_id);
  return ids.map((id) => nameById.get(id) ?? id.slice(0, 6)).join(", ");
}

export function cellForCsv(key: string, row: TodoRow, nameById: Map<string, string>): string {
  switch (key) {
    case "task_id":
      return row.display_id ?? "";
    case "title":
      return row.title;
    case "firm":
      return row.client_entities?.projects?.firms?.name ?? "";
    case "project":
      return row.client_entities?.projects?.name ?? "";
    case "client":
      return row.client_entities?.name ?? "";
    case "tax_year":
      return row.tax_year != null ? String(row.tax_year) : "";
    case "period":
      return row.period ?? "";
    case "complexity":
      return COMPLEXITY_LABEL[row.complexity] ?? row.complexity ?? "";
    case "priority":
      return row.priority ?? "";
    case "due_date":
      return fmtDate(row.due_date);
    case "start_date":
      return fmtDate(row.start_date, true);
    case "stage": {
      const label = row.project_pipeline_stages?.label ?? "";
      const head = STAGE_STATE_LABEL[row.project_pipeline_stages?.primary_state ?? ""] ?? "";
      return head ? `${label} (${head})` : label;
    }
    case "stage_head":
      return STAGE_STATE_LABEL[row.project_pipeline_stages?.primary_state ?? ""] ?? "";
    case "assignees":
      return peopleNames(row, "assignee", nameById);
    case "reviewers":
      return peopleNames(row, "reviewer", nameById);
    default:
      return "";
  }
}

export function rowsToCsv(
  groups: { label: string; items: TodoRow[] }[],
  columns: CsvColumn[],
  nameById: Map<string, string>,
  includeGroup: boolean,
): string {
  const headerCols = includeGroup ? [{ key: "__group__", label: "Group" }, ...columns] : columns;
  const header = headerCols.map((c) => esc(c.label)).join(",");
  const lines: string[] = [header];
  for (const g of groups) {
    for (const r of g.items) {
      const row = headerCols.map((c) =>
        c.key === "__group__" ? esc(g.label) : esc(cellForCsv(c.key, r, nameById)),
      );
      lines.push(row.join(","));
    }
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
