import { supabase } from "@/integrations/supabase/client";

export type ImportRunStatus = "running" | "completed" | "failed";

export type RowFailure = {
  row: number;
  employee_name: string;
  entry_date: string;
  error: string;
  /** Original payload — used by Retry Failed Rows. */
  payload: Record<string, unknown>;
};

export async function createImportRun(input: {
  file_name: string;
  file_size: number | null;
  mapping: Record<string, string>;
  total_rows: number;
  parent_run_id?: string | null;
}): Promise<string | null> {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("attendance_import_runs")
    .insert({
      file_name: input.file_name,
      file_size: input.file_size,
      mapping: input.mapping,
      total_rows: input.total_rows,
      status: "running",
      parent_run_id: input.parent_run_id ?? null,
      created_by: u.user?.id ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("createImportRun failed", error);
    return null;
  }
  return data.id;
}

export async function finalizeImportRun(
  runId: string,
  status: ImportRunStatus,
  counts: { inserted_rows: number; failed_rows: number; notes?: string | null },
) {
  await supabase
    .from("attendance_import_runs")
    .update({
      status,
      inserted_rows: counts.inserted_rows,
      failed_rows: counts.failed_rows,
      notes: counts.notes ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

export async function recordRowErrors(runId: string, failures: RowFailure[]) {
  if (!failures.length) return;
  const CHUNK = 200;
  for (let i = 0; i < failures.length; i += CHUNK) {
    const slice = failures.slice(i, i + CHUNK).map((f) => ({
      run_id: runId,
      row_index: f.row,
      employee_name: f.employee_name,
      entry_date: f.entry_date && /^\d{4}-\d{2}-\d{2}$/.test(f.entry_date) ? f.entry_date : null,
      error_message: f.error,
      payload: JSON.parse(JSON.stringify(f.payload)),
    }));
    const { error } = await (
      supabase.from("attendance_import_row_errors") as unknown as {
        insert: (s: unknown) => Promise<{ error: { message: string } | null }>;
      }
    ).insert(slice);
    if (error) console.error("recordRowErrors batch failed", error);
  }
}

/** Build an error CSV from row failures, including the canonical payload columns. */
export function buildErrorCsv(failures: RowFailure[]): Blob {
  if (!failures.length) return new Blob([""], { type: "text/csv;charset=utf-8;" });
  const cols = new Set<string>(["row", "employee_name", "entry_date", "error"]);
  for (const f of failures) Object.keys(f.payload).forEach((k) => cols.add(k));
  const headers = Array.from(cols);
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(",")];
  for (const f of failures) {
    const flat: Record<string, unknown> = {
      row: f.row,
      employee_name: f.employee_name,
      entry_date: f.entry_date,
      error: f.error,
      ...f.payload,
    };
    lines.push(headers.map((h) => escape(flat[h])).join(","));
  }
  return new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
