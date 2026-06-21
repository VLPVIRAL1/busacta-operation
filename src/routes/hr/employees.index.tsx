import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { EmployeeDirectoryView } from "@/components/hr/employee-directory";

export const Route = createFileRoute("/hr/employees/")({
  component: () => (
    <AuthGuard allow={["admin", "super_admin", "hr_manager", "employee"]}>
      <AppShell
        crumbs={[
          { label: "Human Resources", to: "/hr/employees" },
          { label: "Employee Directory" },
        ]}
        fullBleed
      >
        <EmployeeDirectoryView />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});
