import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldCheck, Rocket, DatabaseBackup } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { useAuth } from "@/lib/auth/auth-context";
import { AdminGuide } from "@/components/admin/admin-guide";
import { AdminTabBar, ViewTab } from "@/components/admin/admin-tabs";
import { RlsCheckPage } from "./rls-check";
import { GoLivePage } from "./go-live";
import { RestoreDrillPage } from "./restore-drill";

type TabKey = "rls" | "golive" | "restore";
const VALID: TabKey[] = ["rls", "golive", "restore"];

export const Route = createFileRoute("/admin/verify")({
  validateSearch: (s: Record<string, unknown>): { tab: TabKey } => ({
    tab: VALID.includes(s.tab as TabKey) ? (s.tab as TabKey) : "rls",
  }),
  component: () => (
    <AuthGuard allow={["super_admin", "admin"]}>
      <AppShell crumbs={[{ label: "Admin", to: "/admin" }, { label: "Pre-launch" }]}>
        <VerifyPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function VerifyPage() {
  const { role } = useAuth();
  const canRestore = role === "super_admin";

  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  // Non-super-admins cannot open the restore tab — fall back to rls.
  const initial = search.tab === "restore" && !canRestore ? "rls" : search.tab;
  const [tab, setTab] = useState<TabKey>(initial);

  const handleChange = (next: TabKey) => {
    setTab(next);
    navigate({ search: { tab: next }, replace: true });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title="Pre-launch"
        description="Operational readiness checks — confirm row-level security holds per role, work the go-live checklist, and log your backup-restore drills."
      />

      <AdminGuide pageName="verify" className="mb-3 shrink-0">
        Everything you should green-light before (and periodically after) going live.{" "}
        <strong>RLS Verification</strong> probes row-level security as each role.{" "}
        <strong>Go-Live</strong> runs the pre-launch checklist across data, security and seed state.{" "}
        <strong>Restore Drill</strong> records annual backup/restore tests for SOC&nbsp;2 evidence.
      </AdminGuide>

      <AdminTabBar>
        <ViewTab
          active={tab === "rls"}
          onClick={() => handleChange("rls")}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="RLS Verification"
        />
        <ViewTab
          active={tab === "golive"}
          onClick={() => handleChange("golive")}
          icon={<Rocket className="h-3.5 w-3.5" />}
          label="Go-Live"
        />
        {canRestore && (
          <ViewTab
            active={tab === "restore"}
            onClick={() => handleChange("restore")}
            icon={<DatabaseBackup className="h-3.5 w-3.5" />}
            label="Restore Drill"
          />
        )}
      </AdminTabBar>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-6">
        {tab === "rls" && <RlsCheckPage embedded />}
        {tab === "golive" && <GoLivePage embedded />}
        {tab === "restore" && canRestore && <RestoreDrillPage embedded />}
      </div>
    </div>
  );
}
