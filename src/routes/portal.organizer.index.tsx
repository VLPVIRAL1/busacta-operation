import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, ArrowRight } from "lucide-react";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { PortalNav } from "@/components/portal/portal-nav";
import { listMyPortalDeployments } from "@/lib/organizer/portal.functions";
import type { PortalDeploymentRow } from "@/lib/organizer/portal.server";

export const Route = createFileRoute("/portal/organizer/")({
  component: () => (
    <AppShell crumbs={[{ label: "Portal", to: "/portal" }, { label: "Organizers" }]}>
      <PortalNav />
      <PortalOrganizerInbox />
    </AppShell>
  ),
  errorComponent: RouteErrorComponent,
});

const ACTION_STATUSES = new Set(["not_started", "in_progress", "returned"]);
const SUBMITTED_STATUSES = new Set(["submitted", "under_review"]);

function PortalOrganizerInbox() {
  const list = useServerFn(listMyPortalDeployments);
  const { data, isLoading } = useQuery({
    queryKey: ["portal", "my-organizers"],
    queryFn: () => list(),
  });
  const rows = data?.deployments ?? [];

  const { action, submitted, completed } = useMemo(() => {
    const action: PortalDeploymentRow[] = [];
    const submitted: PortalDeploymentRow[] = [];
    const completed: PortalDeploymentRow[] = [];
    for (const r of rows) {
      if (ACTION_STATUSES.has(r.status)) action.push(r);
      else if (SUBMITTED_STATUSES.has(r.status)) submitted.push(r);
      else completed.push(r);
    }
    return { action, submitted, completed };
  }, [rows]);

  return (
    <>
      <PageHeader
        title="My Organizers"
        description="Forms and checklists sent to you by your accountant."
      />

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<ClipboardList className="h-10 w-10" />}
              title="Nothing assigned"
              description="When your accountant sends you a tax organizer or checklist it will appear here."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Section
            title="Action needed"
            empty="You're all caught up."
            rows={action}
            primaryLabel="Open"
          />
          <Section
            title="Submitted"
            empty="Nothing waiting on review."
            rows={submitted}
            primaryLabel="View"
          />
          <Section
            title="Completed"
            empty="No completed organizers yet."
            rows={completed}
            primaryLabel="View"
          />
        </div>
      )}
    </>
  );
}

function Section({
  title,
  rows,
  empty,
  primaryLabel,
}: {
  title: string;
  rows: PortalDeploymentRow[];
  empty: string;
  primaryLabel: string;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">{rows.length}</span>
      </div>
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>
          ) : (
            <ul className="divide-y">
              {rows.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium truncate">{d.template_name}</span>
                      <Badge variant="outline" className="text-xs capitalize">
                        {d.status.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">v{d.template_version}</span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {d.firm_name && <span>{d.firm_name}</span>}
                      {d.due_at && <span>Due {new Date(d.due_at).toLocaleDateString()}</span>}
                      <span>Last updated {new Date(d.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/portal/organizer/$deploymentId" params={{ deploymentId: d.id }}>
                      {primaryLabel}
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
