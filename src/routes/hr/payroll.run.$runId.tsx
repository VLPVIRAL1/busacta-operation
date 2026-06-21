import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, ArrowLeft } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PayrollSummaryTable } from "@/components/hr/payroll-summary-table";
import { computePayrollRun } from "@/lib/hr/payroll.functions";
import { payrollRunQuery, formatPayPeriod } from "@/lib/queries/payroll.queries";

export const Route = createFileRoute("/hr/payroll/run/$runId")({
  component: () => (
    <AuthGuard allow={["super_admin", "hr_manager"]}>
      <PayrollRunPage />
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function PayrollRunPage() {
  const { runId } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(payrollRunQuery(runId));

  const recomputeMutation = useMutation({
    mutationFn: () => computePayrollRun({ data: { run_id: runId } }),
    onSuccess: (result: any) => {
      toast.success(`Recomputed — ${result.entriesComputed} employees`);
      if (result.warnings?.length) {
        result.warnings.forEach((w: string) => toast.warning(w, { duration: 6000 }));
      }
      qc.invalidateQueries({ queryKey: ["payroll", "run", runId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const period = data?.run
    ? formatPayPeriod(data.run.pay_period_year, data.run.pay_period_month)
    : "Payroll Run";

  return (
    <AppShell
      crumbs={[
        { label: "Human Resources", to: "/hr/employees" },
        { label: "Payroll", to: "/hr/payroll" },
        { label: period },
      ]}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <PageHeader
            title={period}
            description="Review computed payroll entries for this period."
          />
          {data?.run.status === "draft" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => recomputeMutation.mutate()}
              disabled={recomputeMutation.isPending}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${recomputeMutation.isPending ? "animate-spin" : ""}`}
              />
              {recomputeMutation.isPending ? "Recomputing…" : "Recompute"}
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : data ? (
          <PayrollSummaryTable run={data.run} entries={data.entries} profiles={data.profiles} />
        ) : (
          <p className="text-muted-foreground text-sm">Run not found.</p>
        )}
      </div>
    </AppShell>
  );
}
