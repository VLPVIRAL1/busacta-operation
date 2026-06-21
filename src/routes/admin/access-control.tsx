import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Users, UserCog, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/shared/utils";
import { TeamPage } from "./team";
import { HubPermissionsPage } from "./hub-permissions";

type TabKey = "members" | "roles";

const VALID: TabKey[] = ["members", "roles"];

export const Route = createFileRoute("/admin/access-control")({
  validateSearch: (s: Record<string, unknown>): { tab: TabKey } => ({
    tab: VALID.includes(s.tab as TabKey) ? (s.tab as TabKey) : "members",
  }),
  component: () => (
    <AuthGuard allow={["super_admin"]}>
      <AppShell crumbs={[{ label: "Admin", to: "/admin" }, { label: "Access Control" }]}>
        <AccessControlPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function AccessControlPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [tab, setTab] = useState<TabKey>(search.tab);

  const handleChange = (next: TabKey) => {
    setTab(next);
    navigate({ search: { tab: next }, replace: true });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 space-y-2">
        <p className="text-[11px] leading-snug text-muted-foreground">
          Centralized access control. Members added in <span className="font-medium">HR Hub</span>,{" "}
          <span className="font-medium">Firm Hub</span>, or{" "}
          <span className="font-medium">B2C Client Hub</span> appear here automatically.
        </p>
        <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
          <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertDescription className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Quick tip:</strong> Add new employees in{" "}
            <Link to="/hr/employees" className="underline font-medium hover:no-underline">
              HR → Employees
            </Link>{" "}
            and manage their access here, or edit roles directly in the employee's Permissions tab.
          </AlertDescription>
        </Alert>
      </div>

      {/* Pill tab switcher (matches the Operations hub view tabs) */}
      <div className="mt-3 flex shrink-0 items-center gap-1">
        <ViewTab
          active={tab === "members"}
          onClick={() => handleChange("members")}
          icon={<Users className="h-3.5 w-3.5" />}
          label="Members"
        />
        <ViewTab
          active={tab === "roles"}
          onClick={() => handleChange("roles")}
          icon={<UserCog className="h-3.5 w-3.5" />}
          label="Roles & Capabilities"
        />
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        {tab === "members" ? (
          <TeamPage embedded forceSection="members" />
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-6">
            <TeamPage embedded forceSection="permissions" />
            <HubPermissionsPage embedded />
          </div>
        )}
      </div>
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
