import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Workflow } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { OPS_COLUMNS } from "@/lib/ops/operating-cycle-nodes";

export const Route = createFileRoute("/guide/workflows")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "Guide", to: "/guide" }, { label: "Standard Workflows" }]}>
        <WorkflowsPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function WorkflowsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Standard Workflows"
        description="The BusAcTa Operations operating cycle — five tiers. Follow them left-to-right every working day."
      />

      <div className="space-y-4">
        {OPS_COLUMNS.map((col) => (
          <Card key={col.idx} className="overflow-hidden">
            <CardContent className="p-0">
              <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {col.idx}
                </span>
                <div className="font-semibold">{col.label.replace(/^\d+\.\s*/, "")}</div>
              </div>
              <div className="grid grid-cols-1 divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
                {[col.primary, ...(col.secondary ? [col.secondary] : [])].map((n) => {
                  const Icon = n.Icon;
                  return (
                    <Link
                      key={n.to}
                      to={n.to as never}
                      className="group flex items-start gap-3 p-4 hover:bg-accent/40"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{n.title}</span>
                          <kbd className="rounded border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                            g {n.shortcut}
                          </kbd>
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">{n.desc}</p>
                      </div>
                      <ArrowRight className="mt-2 h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                    </Link>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
          <Workflow className="mt-0.5 h-4 w-4" />
          <div>
            Communication lives in its own hub (
            <Link
              to="/ops/communication"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              /ops/communication
            </Link>
            ) and is intentionally not part of the daily operating cycle.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
