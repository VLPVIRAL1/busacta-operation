import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Skeleton } from "@/components/ui/skeleton";
import { SalarySlip } from "@/components/hr/salary-slip";
import {
  payrollRunQuery,
  payrollEntryQuery,
  salaryStructureQuery,
  formatPayPeriod,
} from "@/lib/queries/payroll.queries";
import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";

export const Route = createFileRoute("/hr/payroll/slip/$runId/$employeeId")({
  component: () => (
    <AuthGuard allow={["super_admin", "hr_manager"]}>
      <SalarySlipPage />
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

const employeeProfileQuery = (employeeId: string) =>
  queryOptions({
    queryKey: ["profile-lite", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, employee_id, department, position_title")
        .eq("id", employeeId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
    staleTime: 5 * 60_000,
  });

function SalarySlipPage() {
  const { runId, employeeId } = Route.useParams();

  const { data: runData, isLoading: runLoading } = useQuery(payrollRunQuery(runId));
  const { data: entry, isLoading: entryLoading } = useQuery(payrollEntryQuery(runId, employeeId));
  const { data: employee, isLoading: profileLoading } = useQuery(employeeProfileQuery(employeeId));
  const { data: structure } = useQuery(salaryStructureQuery(employeeId));

  const isLoading = runLoading || entryLoading || profileLoading;
  const period = runData?.run
    ? formatPayPeriod(runData.run.pay_period_year, runData.run.pay_period_month)
    : "Salary Slip";

  return (
    <AppShell
      crumbs={[
        { label: "Human Resources", to: "/hr/employees" },
        { label: "Payroll", to: "/hr/payroll" },
        { label: period, to: `/hr/payroll/run/${runId}` },
        { label: employee?.full_name ?? "Slip" },
      ]}
    >
      {isLoading ? (
        <div className="space-y-3 max-w-3xl mx-auto">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : runData && entry && employee ? (
        <SalarySlip
          run={runData.run}
          entry={entry}
          employee={employee}
          structure={structure ?? null}
        />
      ) : (
        <p className="text-muted-foreground text-sm text-center py-10">Salary slip not found.</p>
      )}
    </AppShell>
  );
}
