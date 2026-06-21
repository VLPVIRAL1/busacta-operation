import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, FileText, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { useBranding } from "@/lib/shared/branding";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { ThreadChat } from "@/components/ops/communication/thread-chat";
import { PortalTaskFiles } from "@/components/portal/portal-task-files";
import { PortalAccessDenied } from "@/components/portal/portal-access-denied";
import { PortalBreadcrumb } from "@/components/portal/portal-breadcrumb";
import { FirmCode, ProjectCode } from "@/components/shared/entity-code";

export const Route = createFileRoute("/portal/tasks/$taskId")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "Portal", to: "/portal" }, { label: "Task" }]}>
        <PortalTaskPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

/**
 * CLIENT PORTAL — single task view.
 *
 * Security model:
 *   - Two tabs only: Communication + Files. NO Notes, Open Points,
 *     Sub-tasks, Time, Assignees, or Internal metadata.
 *   - `ThreadChat` is rendered with `lockClientVisible` so every outgoing
 *     message + attachment is forced `is_client_visible: true`. The
 *     Internal/Client toggle is hidden.
 *   - `PortalTaskFiles` queries `task_attachments` with a redundant
 *     `is_client_visible=true` predicate on top of RLS (defense in depth).
 *   - The route itself only proceeds after confirming the caller is a
 *     portal-enabled `firm_contact` AND that the requested task belongs
 *     to a project under that firm.
 */
function PortalTaskPage() {
  const { taskId } = Route.useParams();
  const { user, roles, loading } = useAuth();
  const router = useRouter();
  const branding = useBranding();
  const email = user?.email ?? null;

  // Internal users must NEVER reach a portal route — bounce to /dashboard.
  useEffect(() => {
    if (loading) return;
    const list = roles ?? [];
    const hasInternal = list.some((r) => r !== "client");
    if (hasInternal) {
      router.navigate({ to: "/global-dashboard" });
    }
  }, [loading, roles, router]);

  // 1. Resolve the portal contact for this email.
  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ["portal-contact", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firm_contacts")
        .select("id, firm_id, full_name, portal_enabled")
        .ilike("email", email!)
        .eq("portal_enabled", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const firmId = contact?.firm_id ?? null;

  // 2. Verify the task actually belongs to a project under this firm.
  // RLS would already drop the row for any other firm, but we cross-check
  // explicitly so we can render an "access denied" UI instead of a generic
  // empty state if a client guesses a URL.
  const { data: task, isLoading: taskLoading } = useQuery({
    queryKey: ["portal-task", taskId, firmId],
    enabled: !!taskId && !!firmId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, status, client_entities(name, projects(id, name, code, firm_id, firms(name, firm_identifier)))",
        )
        .eq("id", taskId)
        .maybeSingle();
      if (error) throw error;
      const projectFirmId = (data as any)?.client_entities?.projects?.firm_id ?? null;
      if (!data || projectFirmId !== firmId) return null;
      return data as {
        id: string;
        title: string;
        status: string | null;
        client_entities: {
          name: string | null;
          projects: {
            id: string;
            name: string | null;
            code: string | null;
            firm_id: string;
            firms: { name: string; firm_identifier: string | null } | null;
          } | null;
        } | null;
      };
    },
  });

  if (contactLoading || taskLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-[60vh]" />
      </div>
    );
  }

  if (!contact) {
    return <PortalAccessDenied variant="no-access" />;
  }

  if (!task) {
    return <PortalAccessDenied variant="foreign-task" />;
  }

  const project = task.client_entities?.projects ?? null;
  const projectName = project?.name ?? "Project";
  const projectCode = project?.code ?? null;
  const projectId = project?.id ?? "";
  const firmName = project?.firms?.name ?? "Firm";
  const firmCode = project?.firms?.firm_identifier ?? null;
  const entityName = task.client_entities?.name ?? "";

  return (
    <div className="space-y-5">
      <PortalBreadcrumb
        firmName={firmName}
        projectId={projectId}
        projectName={projectName}
        entityName={entityName || null}
        taskName={task.title}
      />
      {/* Header — minimal, client-friendly. NO assignees, NO time, NO budget. */}
      <div className="relative overflow-hidden rounded-2xl glass p-5 sm:p-6">
        <div className="absolute inset-0 -z-10 bg-mesh opacity-70" />
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-[var(--shadow-glass)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground flex flex-wrap items-center gap-1.5">
              <span>{branding.name} · Portal ·</span>
              <FirmCode code={firmCode} name={firmName} />
              <ProjectCode code={projectCode} name={projectName} />
              {entityName ? <span>· {entityName}</span> : null}
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-gradient sm:text-2xl">
              {task.title}
            </h1>
            <Link
              to="/portal"
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to portal
            </Link>
          </div>
        </div>
      </div>

      <Tabs defaultValue="messages" className="w-full">
        <TabsList>
          <TabsTrigger value="messages">
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" /> Messages
          </TabsTrigger>
          <TabsTrigger value="files">
            <FileText className="mr-1.5 h-3.5 w-3.5" /> Files
          </TabsTrigger>
        </TabsList>

        <TabsContent value="messages" className="mt-3">
          <Card className="border-border/60 overflow-hidden">
            <div className="flex h-[68vh] min-h-[480px] flex-col">
              {/* lockClientVisible forces every outgoing message + attachment
                  to is_client_visible: true. Internal toggle is hidden. */}
              <ThreadChat scope="task" id={taskId} hideHeader lockClientVisible />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="mt-3">
          <PortalTaskFiles taskId={taskId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
