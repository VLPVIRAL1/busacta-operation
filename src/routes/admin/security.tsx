import { createFileRoute, Link } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { AdminGuide } from "@/components/admin/admin-guide";
import { SecurityIssuesPage } from "./security-issues";

export const Route = createFileRoute("/admin/security")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin"]}>
      <AppShell crumbs={[{ label: "Admin", to: "/admin" }, { label: "Security" }]}>
        <SecurityPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function SecurityPage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title="Security"
        description="Live security-posture checks against the database, RLS, storage and client bundle."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/activity-audit" search={{ tab: "log" }}>
              <ScrollText className="h-4 w-4" /> View event log
            </Link>
          </Button>
        }
      />

      <AdminGuide pageName="security" className="mb-3 shrink-0">
        Run on-demand scanners that probe for open security gaps — missing RLS, public storage,
        weak auth config, leaked secrets in the client bundle. Fix findings, then re-run to confirm
        they clear. For the chronological record of security fixes and every system event, open the{" "}
        <Link
          to="/admin/activity-audit"
          search={{ tab: "log" }}
          className="font-medium underline hover:no-underline"
        >
          event log
        </Link>
        .
      </AdminGuide>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <SecurityIssuesPage embedded />
      </div>
    </div>
  );
}
