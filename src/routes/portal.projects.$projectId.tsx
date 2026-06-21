import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, MessageSquare, Sparkles, ArrowLeft } from "lucide-react";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { useBranding } from "@/lib/shared/branding";
import { PortalNav } from "@/components/portal/portal-nav";
import { PortalAccessDenied } from "@/components/portal/portal-access-denied";
import { PortalBreadcrumb } from "@/components/portal/portal-breadcrumb";

export const Route = createFileRoute("/portal/projects/$projectId")({
  component: PortalProjectDetailRoute,
  errorComponent: RouteErrorComponent,
});

function PortalProjectDetailRoute() {
  const { projectId } = Route.useParams();
  const { data: project } = usePortalProject(projectId);
  const firmName = project?.firms?.name ?? "Firm";
  const projectName = project?.name ?? "Project";
  return (
    <AppShell
      crumbs={[
        { label: "Portal", to: "/portal" },
        { label: "Projects", to: "/portal/projects" },
        { label: firmName },
        { label: projectName },
      ]}
    >
      <PortalNav />
      <PortalProjectDetailPage projectId={projectId} />
    </AppShell>
  );
}

function usePortalProject(projectId: string) {
  return useQuery({
    queryKey: ["portal-project", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, project_type, status, firm_id, firms(name)")
        .eq("id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        name: string;
        project_type: string | null;
        status: string | null;
        firm_id: string;
        firms: { name: string } | null;
      } | null;
    },
  });
}

/**
 * CLIENT PORTAL — Project detail with grouped task list.
 *
 * Drill-down: B2B Firm → Project → Client Entity → Task.
 * Each task shows the count of `is_client_visible=true` messages and the
 * latest shared-message timestamp. Clicking a task navigates to the Phase 2
 * /portal/tasks/$taskId view.
 *
 * Security:
 *   - Verify the project's firm_id matches the caller's portal contact firm.
 *   - RLS additionally filters tasks/messages.
 *   - All message counts are filtered by is_client_visible=true (no internal
 *     content leaks via aggregate metadata).
 */
function PortalProjectDetailPage({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const branding = useBranding();
  const email = user?.email ?? null;

  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ["portal-contact", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firm_contacts")
        .select("id, firm_id, portal_enabled")
        .ilike("email", email!)
        .eq("portal_enabled", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const firmId = contact?.firm_id ?? null;

  const { data: project, isLoading: projectLoading } = usePortalProject(projectId);
  const projectFirmMatches = !!project && project.firm_id === firmId;

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["portal-project-tasks", projectId, firmId],
    enabled: !!projectId && projectFirmMatches,
    queryFn: async () => {
      // Pull tasks for this project + their shared-message metadata.
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, entity_id, client_entities(id, name)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const taskIds = (data ?? []).map((t) => t.id);
      if (taskIds.length === 0)
        return {
          tasks: data ?? [],
          messageMeta: new Map<string, { count: number; lastAt: string | null }>(),
        };

      // Per-task shared message count + latest timestamp.
      const { data: msgs, error: msgErr } = await supabase
        .from("task_messages")
        .select("task_id, created_at")
        .in("task_id", taskIds)
        .eq("is_client_visible", true)
        .is("deleted_at", null);
      if (msgErr) throw msgErr;
      const meta = new Map<string, { count: number; lastAt: string | null }>();
      for (const m of msgs ?? []) {
        const cur = meta.get(m.task_id) ?? { count: 0, lastAt: null };
        cur.count += 1;
        if (!cur.lastAt || (m.created_at && m.created_at > cur.lastAt)) cur.lastAt = m.created_at;
        meta.set(m.task_id, cur);
      }
      return { tasks: data ?? [], messageMeta: meta };
    },
  });

  if (contactLoading || projectLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!contact) {
    return <PortalAccessDenied variant="no-access" />;
  }

  if (!project || !projectFirmMatches) {
    return <PortalAccessDenied variant="foreign-project" />;
  }

  // Group tasks by client entity for the drill-down view.
  const groups = new Map<
    string,
    {
      entityId: string | null;
      entityName: string;
      rows: Array<{
        id: string;
        title: string;
        status: string | null;
        count: number;
        lastAt: string | null;
      }>;
    }
  >();
  for (const t of tasks?.tasks ?? []) {
    const entityId = (t as { entity_id?: string | null }).entity_id ?? null;
    const entityName =
      (t as { client_entities?: { name?: string } | null }).client_entities?.name ?? "Unassigned";
    const key = entityId ?? "__none__";
    const bucket = groups.get(key) ?? { entityId, entityName, rows: [] };
    const meta = tasks?.messageMeta.get(t.id) ?? { count: 0, lastAt: null };
    bucket.rows.push({
      id: t.id,
      title: t.title,
      status: t.status,
      count: meta.count,
      lastAt: meta.lastAt,
    });
    groups.set(key, bucket);
  }

  return (
    <div className="space-y-5">
      <PortalBreadcrumb
        firmName={project.firms?.name ?? "Firm"}
        projectId={project.id}
        projectName={project.name}
      />
      <div className="relative overflow-hidden rounded-2xl glass p-5 sm:p-6">
        <div className="absolute inset-0 -z-10 bg-mesh opacity-70" />
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-[var(--shadow-glass)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {branding.name} · Portal · {project.firms?.name ?? "Firm"}
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-gradient sm:text-2xl">
              {project.name}
            </h1>
            <Link
              to="/portal/projects"
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> All projects
            </Link>
          </div>
        </div>
      </div>

      <PageHeader title="Tasks" description="Click a task to open its shared messages and files." />

      {tasksLoading ? (
        <Skeleton className="h-40" />
      ) : groups.size === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-10 w-10" />}
          title="No tasks yet"
          description="Your accountant has not added any work items to this engagement."
        />
      ) : (
        <div className="space-y-5">
          {Array.from(groups.values()).map((grp) => (
            <div key={grp.entityId ?? "__none__"} className="space-y-2">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {grp.entityName}
              </div>
              <div className="space-y-2">
                {grp.rows.map((row) => (
                  <Link
                    key={row.id}
                    to="/portal/tasks/$taskId"
                    params={{ taskId: row.id }}
                    className="block"
                  >
                    <Card className="glass border-border-subtle transition-shadow hover:shadow-md">
                      <CardContent className="flex items-center gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{row.title}</div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            {row.status && (
                              <Badge variant="secondary" className="capitalize">
                                {row.status}
                              </Badge>
                            )}
                            {row.lastAt && (
                              <span>Last update {new Date(row.lastAt).toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                        {row.count > 0 && (
                          <Badge className="shrink-0 gap-1">
                            <MessageSquare className="h-3 w-3" />
                            {row.count}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
