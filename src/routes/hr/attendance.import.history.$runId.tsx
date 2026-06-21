import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download, RotateCw, AlertTriangle, Search } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  buildErrorCsv,
  downloadBlob,
  createImportRun,
  finalizeImportRun,
  recordRowErrors,
  type RowFailure,
} from "@/lib/hr/import-runs";

export const Route = createFileRoute("/hr/attendance/import/history/$runId")({
  component: () => (
    <AuthGuard allow={["admin", "super_admin", "hr_manager"]}>
      <AppShell
        crumbs={[
          { label: "Human Resources", to: "/hr/employees" },
          { label: "Attendance", to: "/hr/attendance" },
          { label: "Import", to: "/hr/attendance/import" },
          { label: "History", to: "/hr/attendance/import/history" },
          { label: "Run" },
        ]}
      >
        <DetailPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type Run = {
  id: string;
  file_name: string;
  file_size: number | null;
  status: "running" | "completed" | "failed";
  total_rows: number;
  inserted_rows: number;
  failed_rows: number;
  mapping: Record<string, string> | null;
  notes: string | null;
  started_at: string;
  finished_at: string | null;
  created_by: string | null;
  parent_run_id: string | null;
};

type RowError = {
  id: string;
  row_index: number;
  employee_name: string | null;
  entry_date: string | null;
  error_message: string;
  payload: Record<string, unknown>;
};

function DetailPage() {
  const { runId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const runQ = useQuery({
    queryKey: ["attendance-import-run", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_import_runs")
        .select("*")
        .eq("id", runId)
        .single();
      if (error) throw error;
      return data as Run;
    },
  });

  const errorsQ = useQuery({
    queryKey: ["attendance-import-row-errors", runId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_import_row_errors")
        .select("id, row_index, employee_name, entry_date, error_message, payload")
        .eq("run_id", runId)
        .order("row_index", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as RowError[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return errorsQ.data ?? [];
    return (errorsQ.data ?? []).filter((r) =>
      [r.employee_name, r.error_message, r.entry_date, String(r.row_index)].some(
        (v) => v && String(v).toLowerCase().includes(q),
      ),
    );
  }, [errorsQ.data, search]);

  const retry = useMutation({
    mutationFn: async () => {
      const errors = errorsQ.data ?? [];
      if (errors.length === 0) throw new Error("Nothing to retry");
      const run = runQ.data!;
      const newRunId = await createImportRun({
        file_name: run.file_name,
        file_size: run.file_size,
        mapping: run.mapping ?? {},
        total_rows: errors.length,
        parent_run_id: runId,
      });

      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id ?? null;
      let inserted = 0;
      const failures: RowFailure[] = [];
      const succeededErrorIds: string[] = [];

      const CHUNK = 200;
      for (let i = 0; i < errors.length; i += CHUNK) {
        const slice = errors.slice(i, i + CHUNK);
        // Retry per-row so we know which ones still fail.
        for (const e of slice) {
          const payload = { ...e.payload, created_by: userId };
          // Strip any keys not on attendance_logs to be safe.
          delete (payload as Record<string, unknown>).row;
          delete (payload as Record<string, unknown>).error;
          const { error } = await (
            supabase.from("attendance_logs") as unknown as {
              insert: (
                s: unknown,
              ) => Promise<{ error: { message: string; details?: string } | null }>;
            }
          ).insert([payload]);
          if (error) {
            failures.push({
              row: e.row_index,
              employee_name: e.employee_name ?? "",
              entry_date: e.entry_date ?? "",
              error: `${error.message}${error.details ? ` · ${error.details}` : ""}`,
              payload: e.payload,
            });
          } else {
            inserted += 1;
            succeededErrorIds.push(e.id);
          }
        }
      }

      if (newRunId) {
        await recordRowErrors(newRunId, failures);
        await finalizeImportRun(newRunId, failures.length === 0 ? "completed" : "completed", {
          inserted_rows: inserted,
          failed_rows: failures.length,
          notes: `Retry of run ${runId}`,
        });
      }

      // Drop fixed rows from the old run's error list so its counter converges.
      if (succeededErrorIds.length) {
        await supabase.from("attendance_import_row_errors").delete().in("id", succeededErrorIds);
        await supabase
          .from("attendance_import_runs")
          .update({ failed_rows: failures.length })
          .eq("id", runId);
      }

      return { inserted, failedCount: failures.length, newRunId };
    },
    onSuccess: (res) => {
      toast.success(`Retried — ${res.inserted} succeeded, ${res.failedCount} still failing`);
      qc.invalidateQueries({ queryKey: ["attendance-import-runs"] });
      qc.invalidateQueries({ queryKey: ["attendance-import-run", runId] });
      qc.invalidateQueries({ queryKey: ["attendance-import-row-errors", runId] });
      if (res.newRunId)
        navigate({ to: "/hr/attendance/import/history/$runId", params: { runId: res.newRunId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (runQ.isLoading) return <Skeleton className="h-64" />;
  if (!runQ.data)
    return (
      <Card>
        <CardContent className="p-6 text-sm">Run not found.</CardContent>
      </Card>
    );
  const run = runQ.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title={run.file_name}
        description={`Started ${new Date(run.started_at).toLocaleString()} · ${run.total_rows.toLocaleString()} rows · ${run.inserted_rows.toLocaleString()} inserted · ${run.failed_rows.toLocaleString()} failed`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/hr/attendance/import/history">
              <ArrowLeft className="h-4 w-4" /> All imports
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Status: {run.status}</Badge>
        {run.parent_run_id && (
          <Button asChild variant="ghost" size="sm">
            <Link to="/hr/attendance/import/history/$runId" params={{ runId: run.parent_run_id }}>
              ← Parent run
            </Link>
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          {(errorsQ.data?.length ?? 0) > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const failures: RowFailure[] = (errorsQ.data ?? []).map((e) => ({
                    row: e.row_index,
                    employee_name: e.employee_name ?? "",
                    entry_date: e.entry_date ?? "",
                    error: e.error_message,
                    payload: e.payload,
                  }));
                  downloadBlob(buildErrorCsv(failures), `attendance-errors-${runId}.csv`);
                }}
              >
                <Download className="h-4 w-4" /> Download error CSV
              </Button>
              <Button size="sm" onClick={() => retry.mutate()} disabled={retry.isPending}>
                <RotateCw className={`h-4 w-4 ${retry.isPending ? "animate-spin" : ""}`} /> Retry
                failed rows
              </Button>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by employee, error, date…"
                className="pl-7 h-8 text-xs"
              />
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {filtered.length.toLocaleString()} of {(errorsQ.data?.length ?? 0).toLocaleString()}
            </div>
          </div>

          {errorsQ.isLoading ? (
            <Skeleton className="h-40" />
          ) : (errorsQ.data ?? []).length === 0 ? (
            <div className="rounded-md border border-border-subtle bg-muted/30 p-4 text-sm text-muted-foreground text-center">
              No row-level errors for this run.
            </div>
          ) : (
            <div className="overflow-auto border border-border-subtle rounded-md max-h-[60vh]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="p-2">Row</th>
                    <th className="p-2">Employee</th>
                    <th className="p-2">Date</th>
                    <th className="p-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-t border-border-subtle">
                      <td className="p-2 tabular-nums">{e.row_index}</td>
                      <td className="p-2">{e.employee_name || "—"}</td>
                      <td className="p-2">{e.entry_date || "—"}</td>
                      <td className="p-2 text-destructive flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{e.error_message}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
