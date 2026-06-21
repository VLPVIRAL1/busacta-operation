import { createFileRoute, Link, Outlet, useChildMatches } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History, ArrowLeft, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

function HistoryLayout() {
  const children = useChildMatches();
  if (children.length > 0) return <Outlet />;
  return (
    <AuthGuard allow={["admin", "super_admin", "hr_manager"]}>
      <AppShell
        crumbs={[
          { label: "Human Resources", to: "/hr/employees" },
          { label: "Attendance", to: "/hr/attendance" },
          { label: "Import", to: "/hr/attendance/import" },
          { label: "History" },
        ]}
      >
        <HistoryPage />
      </AppShell>
    </AuthGuard>
  );
}

export const Route = createFileRoute("/hr/attendance/import/history")({
  component: HistoryLayout,
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
  started_at: string;
  finished_at: string | null;
  created_by: string | null;
  parent_run_id: string | null;
};

function HistoryPage() {
  const runsQ = useQuery({
    queryKey: ["attendance-import-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_import_runs")
        .select(
          "id, file_name, file_size, status, total_rows, inserted_rows, failed_rows, started_at, finished_at, created_by, parent_run_id",
        )
        .order("started_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Run[];
    },
  });

  const userIds = Array.from(
    new Set((runsQ.data ?? []).map((r) => r.created_by).filter(Boolean)),
  ) as string[];
  const profilesQ = useQuery({
    queryKey: ["attendance-import-runs-users", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const userMap = new Map((profilesQ.data ?? []).map((p) => [p.id, p.full_name || p.email || "—"]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Attendance Import History"
        description="Every CSV/XLSX import run, with row-level errors and retry."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/hr/attendance/import">
              <ArrowLeft className="h-4 w-4" /> Back to importer
            </Link>
          </Button>
        }
      />

      {runsQ.isLoading ? (
        <Skeleton className="h-64" />
      ) : !runsQ.data || runsQ.data.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
            No imports yet.{" "}
            <Link to="/hr/attendance/import" className="text-primary underline">
              Run your first import
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr className="text-left">
                  <th className="p-2">Started</th>
                  <th className="p-2">File</th>
                  <th className="p-2">User</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-right">Inserted</th>
                  <th className="p-2 text-right">Failed</th>
                  <th className="p-2">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {runsQ.data.map((r) => (
                  <tr key={r.id} className="border-t border-border-subtle hover:bg-muted/30">
                    <td className="p-2 whitespace-nowrap">
                      {new Date(r.started_at).toLocaleString()}
                    </td>
                    <td className="p-2">
                      <div className="font-medium truncate max-w-[260px]" title={r.file_name}>
                        {r.file_name}
                      </div>
                      {r.parent_run_id && (
                        <div className="text-[10px] text-muted-foreground">
                          retry of earlier run
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {userMap.get(r.created_by ?? "") ?? "—"}
                    </td>
                    <td className="p-2 text-right tabular-nums">{r.total_rows.toLocaleString()}</td>
                    <td className="p-2 text-right tabular-nums text-green-600 dark:text-green-400">
                      {r.inserted_rows.toLocaleString()}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {r.failed_rows > 0 ? (
                        <span className="text-destructive">{r.failed_rows.toLocaleString()}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="p-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="p-2 text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/hr/attendance/import/history/$runId" params={{ runId: r.id }}>
                          Open
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Run["status"] }) {
  if (status === "completed")
    return (
      <Badge variant="outline" className="border-green-500/40 text-green-700 dark:text-green-300">
        <CheckCircle2 className="h-3 w-3" /> Completed
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="destructive">
        <AlertTriangle className="h-3 w-3" /> Failed
      </Badge>
    );
  return (
    <Badge variant="outline">
      <Loader2 className="h-3 w-3 animate-spin" /> Running
    </Badge>
  );
}
