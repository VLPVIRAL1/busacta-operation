import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { User, Users, UsersRound, ClipboardList, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { EmptyState } from "@/components/shared/empty-state";
import { StreamBadge } from "@/components/shared/stream-badge";
import { TodosDetailPane } from "@/components/ops/todos/todos-detail-pane";
import {
  directClientDetailQuery,
  directClientTasksQuery,
  directClientOrganizersQuery,
} from "@/lib/queries/direct-clients.queries";
import { ClientProfileTab } from "@/components/client-hub/client-profile-tab";
import { ClientDocumentsTab } from "@/components/client-hub/client-documents-tab";
import { ClientContactsTab } from "@/components/client-hub/client-contacts-tab";
import { ClientTeamTab } from "@/components/client-hub/client-team-tab";
import { directAdapter } from "@/lib/client-hub/adapter";
import { coloredTabsListClass, coloredTabTrigger } from "@/lib/ui/colored-tabs";

/**
 * B2C Client detail tabs used by the unified `/clients` split-view
 * right pane. Mirrors the standalone /clients/direct/$clientId route's
 * tab layout: Profile · Contacts · Team & Access · Tasks · Pricing · Documents.
 */
type DirectTab = "profile" | "contacts" | "team" | "tasks" | "documents";

export function DirectClientTabsLazy({
  clientId,
  tab: controlledTab,
  onTabChange,
}: {
  clientId: string;
  tab?: DirectTab;
  onTabChange?: (t: DirectTab) => void;
}) {
  const { data: client, isLoading } = useQuery(directClientDetailQuery(clientId));
  const [localTab, setLocalTab] = useState<DirectTab>("profile");
  const tab = controlledTab ?? localTab;
  const setTab = (t: DirectTab) => {
    if (onTabChange) onTabChange(t);
    else setLocalTab(t);
  };

  if (isLoading) return <div className="p-5 text-sm text-muted-foreground">Loading client…</div>;
  if (!client) return <div className="p-5 text-sm text-destructive">Client not found.</div>;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as DirectTab)} className="space-y-4">
      <div className="border-b">
        <TabsList className={coloredTabsListClass}>
          <TabsTrigger value="profile" className={coloredTabTrigger(0)}>
            <User className="h-3.5 w-3.5 mr-1.5" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="contacts" className={coloredTabTrigger(1)}>
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Contacts
          </TabsTrigger>
          <TabsTrigger value="team" className={coloredTabTrigger(2)}>
            <UsersRound className="h-3.5 w-3.5 mr-1.5" />
            Team & Access
          </TabsTrigger>
          <TabsTrigger value="tasks" className={coloredTabTrigger(3)}>
            <ClipboardList className="h-3.5 w-3.5 mr-1.5" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="documents" className={coloredTabTrigger(4)}>
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Documents
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="profile" hidden={tab !== "profile"}>
        {tab === "profile" && <ClientProfileTab adapter={directAdapter} entity={client as any} />}
      </TabsContent>
      <TabsContent value="contacts" hidden={tab !== "contacts"}>
        {tab === "contacts" && <ClientContactsTab adapter={directAdapter} entityId={clientId} />}
      </TabsContent>
      <TabsContent value="team" hidden={tab !== "team"}>
        {tab === "team" && <ClientTeamTab adapter={directAdapter} entityId={clientId} />}
      </TabsContent>
      <TabsContent value="tasks" hidden={tab !== "tasks"}>
        {tab === "tasks" && (
          <div className="space-y-4">
            <DirectClientTasksSplit clientId={clientId} />
            <OrganizersTab clientId={clientId} />
          </div>
        )}
      </TabsContent>
      <TabsContent value="documents" hidden={tab !== "documents"}>
        {tab === "documents" && <ClientDocumentsTab adapter={directAdapter} entityId={clientId} />}
      </TabsContent>
    </Tabs>
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

function DirectClientTasksSplit({ clientId }: { clientId: string }) {
  const { data: tasks = [], isLoading } = useQuery(directClientTasksQuery(clientId));
  const rows = tasks as DirectTaskRow[];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!selectedId && rows.length > 0) {
    queueMicrotask(() => setSelectedId(rows[0].id));
  }
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="h-[600px]">
          <ResizableTwoPane
            storageKey={`direct-client-tasks-${clientId}`}
            defaultLeft={35}
            minLeft={25}
            maxLeft={55}
            left={
              <div className="h-full min-h-0 overflow-y-auto">
                {isLoading && <div className="p-5 text-sm text-muted-foreground">Loading…</div>}
                {!isLoading && rows.length === 0 && (
                  <EmptyState
                    icon={<ClipboardList className="h-8 w-8" />}
                    title="No tasks yet"
                    description="Tasks for this client will appear here."
                  />
                )}
                {rows.length > 0 && (
                  <ul className="divide-y">
                    {rows.map((t) => {
                      const tt = t.direct_client_task_types;
                      const active = selectedId === t.id;
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(t.id)}
                            className={`w-full text-left p-3 transition-colors ${active ? "bg-primary/10" : "hover:bg-muted/50"}`}
                          >
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{t.title}</div>
                                <div className="mt-0.5 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                                  <StreamBadge stream="direct" />
                                  {tt?.label && <span>{tt.label}</span>}
                                  {t.due_date && (
                                    <span>Due {new Date(t.due_date).toLocaleDateString()}</span>
                                  )}
                                </div>
                              </div>
                              <Badge variant="outline" className="capitalize text-[10px] shrink-0">
                                {t.status.replace(/_/g, " ")}
                              </Badge>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            }
            right={<TodosDetailPane taskId={selectedId} />}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function OrganizersTab({ clientId }: { clientId: string }) {
  const { data: deps = [], isLoading } = useQuery(directClientOrganizersQuery(clientId));
  return (
    <Card>
      <CardContent className="p-0">
        {isLoading && <div className="p-5 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && deps.length === 0 && (
          <div className="p-5 text-sm text-muted-foreground">No organizers dispatched.</div>
        )}
        {deps.length > 0 && (
          <div className="divide-y">
            {deps.map((d) => {
              const tpl = (d as { organizer_templates?: { name?: string } | null })
                .organizer_templates;
              return (
                <div key={(d as { id: string }).id} className="p-3 flex items-center gap-3 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">{tpl?.name ?? "Organizer"}</div>
                    {(d as { due_at?: string | null }).due_at && (
                      <div className="text-xs text-muted-foreground">
                        Due {new Date((d as { due_at: string }).due_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {(d as { status: string }).status.replace(/_/g, " ")}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
