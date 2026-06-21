import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban, Mail, ClipboardList, CheckCircle2, Clock } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorBanner } from "@/components/shared/error-banner";
import { FirmCode } from "@/components/shared/entity-code";
import { FirmTabs } from "@/components/ops/firm-tabs";
import { LiveUsClock } from "@/components/shell/live-us-clock";
import { RouteErrorComponent } from "@/components/shared/route-error";
import {
  opsFirmHeaderQuery,
  firmProjectsQuery,
  firmUrgentTasksQuery,
  firmTotalHoursQuery,
  firmCompletedTasksQuery,
} from "@/lib/queries/ops.queries";

export const Route = createFileRoute("/ops/firms/$firmId")({
  component: FirmWorkspaceLayout,
  errorComponent: RouteErrorComponent,
});

function FirmWorkspaceLayout() {
  const { firmId } = Route.useParams();

  const { data: firm, isLoading, error, refetch } = useQuery(opsFirmHeaderQuery(firmId));
  const projectsQ = useQuery(firmProjectsQuery(firmId));
  const urgentQ = useQuery(firmUrgentTasksQuery(firmId));
  const hoursQ = useQuery(firmTotalHoursQuery(firmId));
  const completedQ = useQuery(firmCompletedTasksQuery(firmId));

  if (!isLoading && !firm && !error) {
    return (
      <AuthGuard allow={["admin", "employee", "client"]}>
        <AppShell crumbs={[{ label: "Firms", to: "/ops/firms" }, { label: "Not found" }]}>
          <EmptyState
            icon={<FolderKanban className="h-10 w-10" />}
            title="Firm not found"
            description="This firm doesn't exist, was deleted, or your role doesn't have access to it."
          />
        </AppShell>
      </AuthGuard>
    );
  }

  const tz = firm?.us_timezone ?? firm?.timezone ?? null;
  const activeProjects = (projectsQ.data ?? []).filter((p) => p.status === "active").length;
  const openTasks = (urgentQ.data ?? []).length;
  const completedTasks = completedQ.data ?? 0;
  const totalHours = ((hoursQ.data ?? 0) / 60).toFixed(1);

  return (
    <AuthGuard allow={["admin", "employee", "client"]}>
      <AppShell
        fullBleed
        crumbs={[{ label: "Firms", to: "/ops/firms" }, { label: firm?.name ?? "…" }]}
      >
        <div className="flex h-full min-h-0 flex-col">
          {/* Slim 3-column header */}
          <header className="shrink-0 border-b border-border-subtle bg-background px-4 sm:px-6 py-3">
            <div className="flex items-center gap-4">
              {/* LEFT — Name + Firm ID, with email + clock below */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-2xl font-semibold tracking-tight">
                    {firm?.name ?? "Firm Workspace"}
                  </h1>
                  {firm?.firm_identifier && (
                    <FirmCode code={firm.firm_identifier} name={firm.name ?? undefined} />
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                  {firm?.contact_email && (
                    <a
                      href={`mailto:${firm.contact_email}`}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      <Mail className="h-3 w-3" /> {firm.contact_email}
                    </a>
                  )}
                  <LiveUsClock timezone={tz} />
                </div>
              </div>

              {/* CENTER — stat strip */}
              <div className="hidden md:flex items-center gap-6 text-sm">
                <Stat
                  icon={<FolderKanban className="h-3.5 w-3.5 text-primary" />}
                  label="Active Projects"
                  value={activeProjects}
                />
                <Stat
                  icon={<ClipboardList className="h-3.5 w-3.5 text-amber-600" />}
                  label="Open Tasks"
                  value={openTasks}
                />
                <Stat
                  icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                  label="Completed"
                  value={completedTasks}
                />
                <Stat
                  icon={<Clock className="h-3.5 w-3.5 text-sky-600" />}
                  label="Hours Logged"
                  value={`${totalHours}h`}
                />
              </div>

              {/* RIGHT — empty (delete removed) */}
            </div>
          </header>

          {error && (
            <div className="shrink-0 px-4 sm:px-6 pt-3">
              <ErrorBanner title="Couldn't load firm" error={error} onRetry={() => refetch()} />
            </div>
          )}

          <div className="shrink-0 px-4 sm:px-6 pt-2">
            <FirmTabs firmId={firmId} />
          </div>

          <div className="flex-1 min-h-0 overflow-hidden px-4 sm:px-6 pt-2 pb-2">
            <Outlet />
          </div>
        </div>
      </AppShell>
    </AuthGuard>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
