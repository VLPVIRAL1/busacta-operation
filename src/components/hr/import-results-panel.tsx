import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Download, RotateCw, History, FileDown } from "lucide-react";
import { buildErrorCsv, downloadBlob, type RowFailure } from "@/lib/hr/import-runs";

export type ImportedRow = {
  id: string | null;
  employee_code: string | null;
  employee_name: string;
  entry_date: string;
  punch_in: string | null;
  punch_out: string | null;
  total_hours: string;
  attendance_status: string;
  is_late_arrival: boolean;
  late_by_minutes: number;
  is_early_checkout: boolean;
  early_by_minutes: number;
};

export type ImportResult = {
  runId: string | null;
  fileName: string;
  inserted: number;
  matchedCount: number;
  entriesUpserted: number;
  failures: RowFailure[];
  succeeded?: ImportedRow[];
  startedAt: number;
  finishedAt: number;
};

export function buildImportedCsv(rows: ImportedRow[]): Blob {
  const headers = [
    "id",
    "employee_code",
    "employee_name",
    "entry_date",
    "punch_in",
    "punch_out",
    "total_hours",
    "attendance_status",
    "is_late_arrival",
    "late_by_minutes",
    "is_early_checkout",
    "early_by_minutes",
  ];
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => escape((r as unknown as Record<string, unknown>)[h])).join(","));
  }
  return new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
}

export function ImportResultsPanel({
  result,
  onDismiss,
  onRetry,
  retrying,
  validationSummary,
}: {
  result: ImportResult;
  onDismiss: () => void;
  onRetry?: () => void;
  retrying?: boolean;
  validationSummary?: ReactNode;
}) {
  const failed = result.failures.length;
  const durSec = Math.max(1, Math.round((result.finishedAt - result.startedAt) / 1000));
  const succeeded = result.succeeded ?? [];

  return (
    <Card className="border-border-subtle">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {failed === 0 ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          )}
          Import results — {result.fileName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Inserted" value={result.inserted} tone="green" />
          <Stat label="Failed" value={failed} tone={failed ? "red" : undefined} />
          <Stat label="Matched users" value={result.matchedCount} />
          <Stat label="Attendance entries" value={result.entriesUpserted} />
          <Stat label="Duration" value={`${durSec}s`} />
        </div>

        {validationSummary}

        {succeeded.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-muted/30 p-2 text-xs">
            <span className="text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 inline -mt-0.5 text-green-600" />{" "}
              {succeeded.length.toLocaleString()} row{succeeded.length === 1 ? "" : "s"} imported
              successfully
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadBlob(
                  buildImportedCsv(succeeded),
                  `attendance-imported-${new Date().toISOString().slice(0, 10)}.csv`,
                )
              }
            >
              <FileDown className="h-3.5 w-3.5" /> Download imported rows
            </Button>
          </div>
        )}

        {failed > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {failed} row{failed === 1 ? "" : "s"} failed to insert
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadBlob(
                      buildErrorCsv(result.failures),
                      `attendance-errors-${new Date().toISOString().slice(0, 10)}.csv`,
                    )
                  }
                >
                  <Download className="h-3.5 w-3.5" /> Download error CSV
                </Button>
                {onRetry && (
                  <Button size="sm" onClick={onRetry} disabled={retrying}>
                    <RotateCw className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`} /> Retry
                    failed rows
                  </Button>
                )}
              </div>
            </div>
            <div className="max-h-64 overflow-auto text-xs">
              <table className="w-full">
                <thead className="text-muted-foreground sticky top-0 bg-card">
                  <tr>
                    <th className="text-left p-1.5">Row</th>
                    <th className="text-left p-1.5">Employee</th>
                    <th className="text-left p-1.5">Date</th>
                    <th className="text-left p-1.5">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.failures.slice(0, 200).map((f) => (
                    <tr
                      key={`${f.row}-${f.employee_name}`}
                      className="border-t border-border-subtle"
                    >
                      <td className="p-1.5 tabular-nums">{f.row}</td>
                      <td className="p-1.5">{f.employee_name || "—"}</td>
                      <td className="p-1.5">{f.entry_date || "—"}</td>
                      <td className="p-1.5 text-destructive">{f.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.failures.length > 200 && (
                <div className="p-2 text-center text-muted-foreground">
                  Showing 200 of {result.failures.length}. Download CSV for the full list.
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {result.runId && (
            <Button asChild variant="outline" size="sm">
              <Link to="/hr/attendance/import/history/$runId" params={{ runId: result.runId }}>
                <History className="h-4 w-4" /> View in history
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link to="/hr/attendance/import/history">All imports</Link>
          </Button>
          <Button size="sm" onClick={onDismiss} className="ml-auto">
            Start a new import
          </Button>
        </div>

        {failed === 0 && (
          <Badge
            variant="outline"
            className="border-green-500/40 text-green-700 dark:text-green-300"
          >
            All rows committed successfully
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "green" | "red";
}) {
  const cls =
    tone === "green"
      ? "text-green-600 dark:text-green-400"
      : tone === "red"
        ? "text-destructive"
        : "";
  return (
    <div className="rounded-md border border-border-subtle bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
