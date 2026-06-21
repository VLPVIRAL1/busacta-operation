import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ClipboardList, FileText, ListChecks } from "lucide-react";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { PortalNav } from "@/components/portal/portal-nav";
import { PortalAccessDenied } from "@/components/portal/portal-access-denied";
import { StreamBadge } from "@/components/shared/stream-badge";
import {
  SubtaskChecklistReadonly,
  useSubtaskProgress,
} from "@/components/shared/subtask-checklist-readonly";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export const Route = createFileRoute("/portal/my-tasks")({
  component: () => (
    <AppShell crumbs={[{ label: "Portal", to: "/portal" }, { label: "My Tasks" }]}>
      <PortalNav />
      <DirectClientPortalPage />
    </AppShell>
  ),
  errorComponent: RouteErrorComponent,
});

function DirectClientPortalPage() {
  const { user } = useAuth();

  const { data: directClient, isLoading } = useQuery({
    queryKey: ["portal-direct-client", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_clients")
        .select("id, display_name, status")
        .eq("portal_user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const clientId = directClient?.id ?? null;

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ["portal-direct-tasks", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,status,priority,due_date,stream,direct_client_task_types(label)")
        .eq("direct_client_id", clientId!)
        .eq("stream", "direct")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: organizers, isLoading: orgsLoading } = useQuery({
    queryKey: ["portal-direct-organizers", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizer_deployments")
        .select("id,status,due_at,submitted_at,organizer_templates(name)")
        .eq("target_type", "direct_client")
        .eq("target_id", clientId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <Skeleton className="h-40" />;
  if (!directClient) return <PortalAccessDenied variant="no-access" />;

  return (
    <>
      <PageHeader
        title={`Welcome, ${directClient.display_name}`}
        description="Your tasks and pending organizers."
      />

      <PageHeader title="My Tasks" description="Items your accountant is working on for you." />
      {tasksLoading ? (
        <Skeleton className="h-32" />
      ) : (tasks ?? []).length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-10 w-10" />}
          title="No tasks yet"
          description="Your accountant will create tasks here as your engagements progress."
        />
      ) : (
        <div className="space-y-2">
          {tasks!.map((t) => (
            <DirectTaskCard key={t.id} task={t} />
          ))}
        </div>
      )}

      <PageHeader title="My Organizers" description="Forms requested by your accountant." />
      {orgsLoading ? (
        <Skeleton className="h-32" />
      ) : (organizers ?? []).length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-10 w-10" />}
          title="No organizers pending"
          description="When you receive a tax organizer or intake form, it will appear here."
        />
      ) : (
        <div className="space-y-2">
          {organizers!.map(
            (o: {
              id: string;
              status: string;
              due_at: string | null;
              submitted_at: string | null;
              organizer_templates?: { name?: string } | null;
            }) => (
              <Link
                key={o.id}
                to="/portal/organizer/$deploymentId"
                params={{ deploymentId: o.id }}
                className="block"
              >
                <Card className="glass border-border-subtle transition-shadow hover:shadow-md">
                  <CardContent className="p-4 flex items-center gap-3">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {o.organizer_templates?.name ?? "Organizer"}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <Badge
                          variant={o.submitted_at ? "default" : "secondary"}
                          className="capitalize"
                        >
                          {o.submitted_at ? "Submitted" : o.status}
                        </Badge>
                        {o.due_at && !o.submitted_at && (
                          <span>Due {new Date(o.due_at).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ),
          )}
        </div>
      )}
    </>
  );
}

interface DirectTaskRow {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  stream: string;
  direct_client_task_types?: { label?: string } | null;
}

function DirectTaskCard({ task }: { task: DirectTaskRow }) {
  const [open, setOpen] = useState(false);
  const { data: progress } = useSubtaskProgress(task.id);
  const hasSubs = (progress?.total ?? 0) > 0;

  return (
    <Card className="glass border-border-subtle transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse sub-tasks" : "Expand sub-tasks"}
            title={hasSubs ? `${progress!.done}/${progress!.total} sub-tasks done` : "No sub-tasks"}
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
          <ClipboardList className="h-4 w-4 text-primary shrink-0" />
          <Link
            to="/portal/tasks/$taskId"
            params={{ taskId: task.id }}
            className="min-w-0 flex-1 hover:underline"
          >
            <div className="font-medium truncate">{task.title}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <StreamBadge stream={task.stream as "cpa" | "direct"} />
              {task.direct_client_task_types?.label && (
                <Badge variant="outline">{task.direct_client_task_types.label}</Badge>
              )}
              <Badge variant="secondary" className="capitalize">
                {task.status}
              </Badge>
              {hasSubs && (
                <span>
                  {progress!.done}/{progress!.total} sub-tasks
                </span>
              )}
              {task.due_date && <span>Due {new Date(task.due_date).toLocaleDateString()}</span>}
            </div>
          </Link>
        </div>
        {open && (
          <div className="mt-3 pl-11 border-l-2 border-primary/20 ml-3">
            <SubtaskChecklistReadonly taskId={task.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
