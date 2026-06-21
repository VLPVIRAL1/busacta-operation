import { createFileRoute, Link, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { directDetailDefaults, directDetailSearchSchema } from "./_search";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  User,
  Users,
  UsersRound,
  ClipboardList,
  FileText,
  DollarSign,
} from "lucide-react";
import { DirectClientsShell } from "@/components/direct-clients/direct-clients-shell";
import { PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StreamBadge } from "@/components/shared/stream-badge";
import { DirectClientCode } from "@/components/shared/entity-code";
import {
  SubtaskChecklistReadonly,
  useSubtaskProgress,
} from "@/components/shared/subtask-checklist-readonly";
import { ClientProfileTab } from "@/components/client-hub/client-profile-tab";
import { ClientContactsTab } from "@/components/client-hub/client-contacts-tab";
import { ClientTeamTab } from "@/components/client-hub/client-team-tab";
import { ClientDocumentsTab } from "@/components/client-hub/client-documents-tab";
import { ClientTaskCategoriesTab } from "@/components/client-hub/client-task-categories-tab";
import { useAuth } from "@/lib/auth/auth-context";
import { directAdapter } from "@/lib/client-hub/adapter";
import {
  directClientDetailQuery,
  directClientTasksQuery,
} from "@/lib/queries/direct-clients.queries";

export const Route = createFileRoute("/clients/direct/$clientId")({
  validateSearch: zodValidator(directDetailSearchSchema),
  search: {
    middlewares: [stripSearchParams({ tab: directDetailDefaults.tab })],
  },
  component: DirectClientDetailPage,
  errorComponent: RouteErrorComponent,
});

function DirectClientDetailPage() {
  const { clientId } = Route.useParams();
  const { tab } = Route.useSearch();
  const { roles } = useAuth();
  const isSuper = (roles ?? []).includes("super_admin");
  const navigate = useNavigate();
  const setTab = (t: typeof tab) =>
    navigate({
      to: "/clients/direct/$clientId",
      params: { clientId },
      search: (prev: Record<string, unknown>) => ({ ...prev, tab: t }),
      replace: true,
    });

  // Non-super users can't see the Pricing tab; bounce a hand-typed ?tab=pricing
  // back to Profile so they don't land on an empty panel.
  useEffect(() => {
    if (!isSuper && tab === "pricing") setTab("profile");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuper, tab]);

  const { data: client, isLoading } = useQuery(directClientDetailQuery(clientId));

  return (
    <DirectClientsShell
      crumbs={[{ label: "Clients", to: "/clients" }, { label: client?.display_name ?? "Client" }]}
    >
      <PageHeader
        title={client?.display_name ?? "Loading…"}
        description={
          <span className="flex items-center gap-2">
            {client && (
              <DirectClientCode
                code={(client as { client_code?: string | null }).client_code ?? null}
                name={client.display_name}
              />
            )}
            {(client?.legal_name || client?.email) && (
              <span className="text-xs text-muted-foreground">
                {client?.legal_name ?? client?.email}
              </span>
            )}
          </span>
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/clients">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Back
            </Link>
          </Button>
        }
      />

      {isLoading && <div className="text-sm text-muted-foreground p-4">Loading…</div>}
      {!isLoading && !client && (
        <div className="text-sm text-destructive p-4">Client not found.</div>
      )}
      {client && (
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-4">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="profile">
              <User className="h-3.5 w-3.5 mr-1.5" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="contacts">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Contacts
            </TabsTrigger>
            <TabsTrigger value="team">
              <UsersRound className="h-3.5 w-3.5 mr-1.5" />
              Team & Access
            </TabsTrigger>
            <TabsTrigger value="tasks">
              <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
              Tasks
            </TabsTrigger>
            {isSuper && (
              <TabsTrigger value="pricing">
                <DollarSign className="h-3.5 w-3.5 mr-1.5" />
                Pricing
              </TabsTrigger>
            )}
            <TabsTrigger value="documents">
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" hidden={tab !== "profile"}>
            {tab === "profile" && (
              <ClientProfileTab adapter={directAdapter} entity={client as any} />
            )}
          </TabsContent>
          <TabsContent value="contacts" hidden={tab !== "contacts"}>
            {tab === "contacts" && (
              <ClientContactsTab adapter={directAdapter} entityId={clientId} />
            )}
          </TabsContent>
          <TabsContent value="team" hidden={tab !== "team"}>
            {tab === "team" && <ClientTeamTab adapter={directAdapter} entityId={clientId} />}
          </TabsContent>
          <TabsContent value="tasks" hidden={tab !== "tasks"}>
            {tab === "tasks" && <DirectTasksTab clientId={clientId} />}
          </TabsContent>
          {isSuper && (
            <TabsContent value="pricing" hidden={tab !== "pricing"}>
              {tab === "pricing" && <ClientTaskCategoriesTab clientId={clientId} />}
            </TabsContent>
          )}
          <TabsContent value="documents" hidden={tab !== "documents"}>
            {tab === "documents" && (
              <ClientDocumentsTab adapter={directAdapter} entityId={clientId} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </DirectClientsShell>
  );
}

function DirectTasksTab({ clientId }: { clientId: string }) {
  const { data: tasks = [], isLoading } = useQuery(directClientTasksQuery(clientId));
  return (
    <Card>
      <CardContent className="p-0">
        {isLoading && <div className="p-5 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && tasks.length === 0 && (
          <div className="p-5 text-sm text-muted-foreground">No tasks yet.</div>
        )}
        {tasks.length > 0 && (
          <ul className="divide-y">
            {tasks.map((t) => (
              <DirectClientTaskRow key={(t as { id: string }).id} task={t as DirectTaskRow} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface DirectTaskRow {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  direct_client_task_types?: { label?: string | null } | null;
}

function DirectClientTaskRow({ task }: { task: DirectTaskRow }) {
  const [open, setOpen] = useState(false);
  const { data: progress } = useSubtaskProgress(task.id);
  const hasSubs = (progress?.total ?? 0) > 0;
  const tt = task.direct_client_task_types;
  return (
    <li className="p-3 text-sm">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </Button>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{task.title}</div>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <StreamBadge stream="direct" />
            {tt?.label && <span>{tt.label}</span>}
            {hasSubs && (
              <span>
                {progress!.done}/{progress!.total} sub-tasks
              </span>
            )}
            {task.due_date && <span>Due {new Date(task.due_date).toLocaleDateString()}</span>}
          </div>
        </div>
        <Badge variant="outline" className="capitalize">
          {task.status.replace(/_/g, " ")}
        </Badge>
      </div>
      {open && (
        <div className="mt-2 ml-8 border-l-2 border-primary/20 pl-3">
          <SubtaskChecklistReadonly taskId={task.id} />
        </div>
      )}
    </li>
  );
}
