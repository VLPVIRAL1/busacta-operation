import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Trash2, RefreshCw } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { clientErrorsQuery, type ClientErrorRow } from "@/lib/queries/admin.queries";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/client-errors")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/activity-audit", search: { tab: "errors" } });
  },
});

type Row = ClientErrorRow;

export function ClientErrorsPage({ embedded = false }: { embedded?: boolean } = {}) {
  if (embedded) return <ClientErrorsBody />;
  return (
    <AuthGuard allow={["admin", "super_admin"]}>
      <AppShell>
        <PageHeader
          title="Client errors"
          description="JavaScript exceptions captured from browsers."
        />
        <ClientErrorsBody />
      </AppShell>
    </AuthGuard>
  );
}

function ClientErrorsBody() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading, refetch, isFetching } = useQuery(clientErrorsQuery());

  const clearMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("client_error_log" as never)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Error log cleared");
      qc.invalidateQueries({ queryKey: ["admin", "client-errors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Group by name+message
  const grouped = (() => {
    const m = new Map<
      string,
      { sample: Row; count: number; lastAt: string; routes: Set<string> }
    >();
    for (const r of data ?? []) {
      const k = `${r.name ?? ""}|${r.message ?? ""}`;
      const e = m.get(k);
      if (!e)
        m.set(k, { sample: r, count: 1, lastAt: r.created_at, routes: new Set([r.route ?? ""]) });
      else {
        e.count++;
        if (r.created_at > e.lastAt) e.lastAt = r.created_at;
        e.routes.add(r.route ?? "");
      }
    }
    return Array.from(m.entries()).sort((a, b) => (a[1].lastAt < b[1].lastAt ? 1 : -1));
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (confirm("Delete all client error rows?")) clearMut.mutate();
          }}
          disabled={clearMut.isPending || !data?.length}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Clear all
        </Button>
        <div className="ml-auto text-sm text-muted-foreground">
          {data?.length ?? 0} events · {grouped.length} unique
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title="No client errors"
          description="Browser exceptions captured here."
        />
      ) : (
        <div className="space-y-2">
          {grouped.map(([key, g]) => {
            const isOpen = open === key;
            return (
              <Card key={key} className="overflow-hidden">
                <CardContent className="p-0">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : key)}
                    className="w-full text-left p-4 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-sm truncate">
                          <span className="font-semibold">{g.sample.name ?? "Error"}</span>
                          {": "}
                          {g.sample.message}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary">{g.count}×</Badge>
                          {g.sample.role && <Badge variant="outline">{g.sample.role}</Badge>}
                          {Array.from(g.routes)
                            .filter(Boolean)
                            .slice(0, 3)
                            .map((r) => (
                              <span key={r} className="font-mono">
                                {r}
                              </span>
                            ))}
                          <span className="ml-auto">{new Date(g.lastAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t bg-muted/20 p-4 space-y-2 text-xs">
                      {g.sample.stack && (
                        <div>
                          <div className="font-semibold mb-1">Stack</div>
                          <pre className="whitespace-pre-wrap font-mono bg-background border rounded p-2 max-h-64 overflow-auto">
                            {g.sample.stack}
                          </pre>
                        </div>
                      )}
                      {g.sample.component_stack && (
                        <div>
                          <div className="font-semibold mb-1">Component stack</div>
                          <pre className="whitespace-pre-wrap font-mono bg-background border rounded p-2 max-h-48 overflow-auto">
                            {g.sample.component_stack}
                          </pre>
                        </div>
                      )}
                      {g.sample.ua && (
                        <div className="text-muted-foreground">
                          <span className="font-semibold">UA:</span> {g.sample.ua}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
