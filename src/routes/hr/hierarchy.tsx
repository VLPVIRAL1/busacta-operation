import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Layers, List, Network, History, Download } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { OrgChartCanvas } from "@/components/hr/org-chart-canvas";
import { OrgChartListFallback } from "@/components/hr/org-chart-list-fallback";
import { HierarchyHistoryPanel } from "@/components/hr/hierarchy-history-panel";
import { getOrgTree, type OrgNode } from "@/lib/hr/hierarchy.functions";
import { buildOrgTreeCsv, todayStamp } from "@/lib/hr/hierarchy-csv";
import { downloadCSV } from "@/lib/format/csv";
import { useAuth } from "@/lib/auth/auth-context";

type View = "tree" | "list" | "history";

function HierarchyPage() {
  const { roles } = useAuth();
  const canEdit = roles?.some((r) => ["hr_manager", "super_admin", "admin"].includes(r)) ?? false;
  const getTreeFn = useServerFn(getOrgTree);
  const [view, setView] = useState<View>("tree");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["hr", "org-tree"],
    queryFn: async () => getTreeFn({}),
  });

  const nodes: OrgNode[] = q.data?.nodes ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return nodes;
    const needle = search.toLowerCase();
    const matchIds = new Set<string>();
    for (const n of nodes) {
      const haystack = [n.full_name, n.email, n.position_title, n.department]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (haystack.includes(needle)) {
        matchIds.add(n.id);
        // Include ancestors so the visible chain stays connected.
        for (const aid of n.path) matchIds.add(aid);
      }
    }
    return nodes.filter((n) => matchIds.has(n.id));
  }, [nodes, search]);

  return (
    <>
      <PageHeader
        title="Employee hierarchy"
        description="Interactive org chart driven by each employee's direct reporting line."
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const csv = buildOrgTreeCsv(nodes);
                downloadCSV(`org-tree-${todayStamp()}.csv`, csv);
              }}
              disabled={nodes.length === 0}
              title="Export org tree CSV"
              aria-label="Export org tree CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
            <div className="inline-flex rounded-md border bg-card">
              <Button
                size="sm"
                variant={view === "tree" ? "default" : "ghost"}
                className="rounded-r-none"
                onClick={() => setView("tree")}
                title="Tree view"
                aria-label="Tree view"
              >
                <Network className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={view === "list" ? "default" : "ghost"}
                className="rounded-none"
                onClick={() => setView("list")}
                title="List view"
                aria-label="List view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={view === "history" ? "default" : "ghost"}
                className="rounded-l-none"
                onClick={() => setView("history")}
                title="History"
                aria-label="History"
              >
                <History className="h-4 w-4" />
              </Button>
            </div>
          </div>
        }
      />

      {view !== "history" && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name, email, title…"
            className="h-8 max-w-xs text-sm"
          />
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {filtered.length}/{nodes.length} employees
          </span>
        </div>
      )}

      {view === "history" ? (
        <HierarchyHistoryPanel nodes={nodes} />
      ) : q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading hierarchy…
        </div>
      ) : nodes.length === 0 ? (
        <EmptyState
          title="No employees yet"
          description="Add employees from the directory to start building the org chart."
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search term." />
      ) : view === "tree" ? (
        <OrgChartCanvas nodes={filtered} canEdit={canEdit} />
      ) : (
        <OrgChartListFallback nodes={filtered} canEdit={canEdit} />
      )}
    </>
  );
}

export const Route = createFileRoute("/hr/hierarchy")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin", "hr_manager", "employee"]}>
      <AppShell
        crumbs={[{ label: "Human Resources", to: "/hr/employees" }, { label: "Hierarchy" }]}
      >
        <HierarchyPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});
