import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Building2, ChevronRight } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { firmHubProjectsGroupedQuery, type ProjectGroupRow } from "@/lib/queries/firm-hub.queries";

export const Route = createFileRoute("/clients/firm/projects")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin"]}>
      <AppShell
        crumbs={[
          { label: "Admin" },
          { label: "B2B Firm Hub", to: "/clients" },
          { label: "Projects by Firm" },
        ]}
      >
        <PageHeader
          title="Projects by Firm"
          description="Browse every engagement grouped by its firm."
        />
        <ProjectsByFirm />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function ProjectsByFirm() {
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery(firmHubProjectsGroupedQuery());

  const groups = useMemo(() => {
    type FirmInfo = NonNullable<ProjectGroupRow["firms"]>;
    const m = new Map<string, { firm: FirmInfo; projects: ProjectGroupRow[] }>();
    rows.forEach((p) => {
      const f = p.firms;
      if (!f) return;
      if (!m.has(f.id)) m.set(f.id, { firm: f, projects: [] });
      m.get(f.id)!.projects.push(p);
    });
    return Array.from(m.values())
      .filter(
        (g) =>
          search === "" ||
          g.firm.name.toLowerCase().includes(search.toLowerCase()) ||
          g.projects.some((p) => p.name.toLowerCase().includes(search.toLowerCase())),
      )
      .sort((a, b) => a.firm.name.localeCompare(b.firm.name));
  }, [rows, search]);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search firms or projects…"
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : groups.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No projects yet.</div>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <Collapsible key={g.firm.id} defaultOpen>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-2.5 hover:bg-muted">
                    <div className="flex items-center gap-2">
                      <ChevronRight className="h-4 w-4 transition-transform data-[state=open]:rotate-90" />
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{g.firm.name}</span>
                      <Badge variant="outline">{g.projects.length}</Badge>
                    </div>
                    <Link
                      to="/clients/firm/$firmId"
                      params={{ firmId: g.firm.id }}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-primary hover:underline"
                    >
                      Open firm →
                    </Link>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 pl-6 pb-3">
                  <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                    {g.projects.map((p: any) => (
                      <Link
                        key={p.id}
                        to="/clients/firm/$firmId/projects/$projectId"
                        params={{ firmId: g.firm.id, projectId: p.id }}
                      >
                        <Card className="hover:border-primary cursor-pointer">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="font-medium truncate">{p.name}</div>
                                <div className="text-xs text-muted-foreground capitalize mt-0.5">
                                  {String(p.project_type).replace(/_/g, " ")}
                                </div>
                              </div>
                              <Badge variant="outline">{p.status}</Badge>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
