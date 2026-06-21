import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { EmployeeImportWizard } from "@/components/hr/employee-import-wizard";

export const Route = createFileRoute("/hr/employees/import")({
  component: () => (
    <AuthGuard allow={["admin", "super_admin", "hr_manager"]}>
      <AppShell
        crumbs={[
          { label: "Human Resources", to: "/hr/employees" },
          { label: "Employee Directory", to: "/hr/employees" },
          { label: "Bulk import" },
        ]}
      >
        <PageHeader
          title="Bulk import employees"
          description="Paste or upload data, review validation errors, then import only valid rows."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link to="/hr/employees">
                <ArrowLeft className="h-4 w-4" /> Back to directory
              </Link>
            </Button>
          }
        />
        <EmployeeImportWizard />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});
