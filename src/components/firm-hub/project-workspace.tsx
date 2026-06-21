import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { safeHref } from "@/lib/routing/safe-href";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { formatEntityDisplayName } from "@/lib/shared/domain";
import { PriorityBadge } from "@/lib/ui/task-option-icons";

/**
 * Project-level Workspace.
 * Shows Tasks / Discussion / Notes / Links / Open Points / Time Logs scoped
 * to this project. Each tab is role-aware: tabs not in `visibleTabs` are hidden.
 */
export function ProjectWorkspace({
  firmId,
  projectId,
  skipEntityHierarchy,
  visibleTabs,
}: {
  firmId: string;
  projectId: string;
  skipEntityHierarchy: boolean;
  visibleTabs: ReadonlyArray<WorkspaceTab>;
}) {
  const tabs = WORKSPACE_TABS.filter((t) => visibleTabs.includes(t.value));
  const first = tabs[0]?.value ?? "tasks";

  return (
    <Tabs defaultValue={first} className="space-y-4">
      <TabsList className="flex-wrap h-auto">
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {tabs.some((t) => t.value === "tasks") && (
        <TabsContent value="tasks">
          <TasksPanel
            firmId={firmId}
            projectId={projectId}
            skipEntityHierarchy={skipEntityHierarchy}
          />
        </TabsContent>
      )}
      {tabs.some((t) => t.value === "discussion") && (
        <TabsContent value="discussion">
          <DiscussionPanel firmId={firmId} projectId={projectId} />
        </TabsContent>
      )}
      {tabs.some((t) => t.value === "notes") && (
        <TabsContent value="notes">
          <NotesPanel projectId={projectId} />
        </TabsContent>
      )}
      {tabs.some((t) => t.value === "links") && (
        <TabsContent value="links">
          <LinksPanel projectId={projectId} />
        </TabsContent>
      )}
      {tabs.some((t) => t.value === "open-points") && (
        <TabsContent value="open-points">
          <OpenPointsPanel projectId={projectId} />
        </TabsContent>
      )}
      {tabs.some((t) => t.value === "time-logs") && (
        <TabsContent value="time-logs">
          <TimeLogsPanel projectId={projectId} />
        </TabsContent>
      )}
    </Tabs>
  );
}

export type WorkspaceTab = "tasks" | "discussion" | "notes" | "links" | "open-points" | "time-logs";

const WORKSPACE_TABS: ReadonlyArray<{ value: WorkspaceTab; label: string }> = [
  { value: "tasks", label: "Tasks" },
  { value: "discussion", label: "Discussion" },
  { value: "notes", label: "Notes" },
  { value: "links", label: "Links" },
  { value: "open-points", label: "Open Points" },
  { value: "time-logs", label: "Time Logs" },
];

/* ---------------- Tasks ---------------- */

function TasksPanel({
  firmId,
  projectId,
  skipEntityHierarchy,
}: {
  firmId: string;
  projectId: string;
  skipEntityHierarchy: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["fh-ws-tasks", projectId],
    queryFn: async () => {
      const { data: entities, error: eErr } = await supabase
        .from("client_entities")
        .select("id, name")
        .eq("project_id", projectId);
      if (eErr) throw eErr;
      const entityIds = (entities ?? []).map((e: any) => e.id);
      if (entityIds.length === 0) return { entities: [], tasks: [] };
      const { data: tasks, error: tErr } = await supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, entity_id, assignee_id")
        .in("entity_id", entityIds)
        .order("created_at", { ascending: false });
      if (tErr) throw tErr;
      return { entities: entities ?? [], tasks: tasks ?? [] };
    },
  });

  if (isLoading)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading tasks…</CardContent>
      </Card>
    );
  const tasks = data?.tasks ?? [];
  const entityName = new Map((data?.entities ?? []).map((e: any) => [e.id, e.name]));
  if (tasks.length === 0) {
    return (
      <EmptyState
        title="No tasks yet"
        description="Tasks created on this project will appear here."
      />
    );
  }

  if (skipEntityHierarchy) {
    return (
      <TaskTable
        tasks={tasks}
        firmId={firmId}
        projectId={projectId}
        showEntity={false}
        entityName={entityName}
      />
    );
  }

  // Group by entity
  const groups = new Map<string, any[]>();
  tasks.forEach((t: any) => {
    const key = t.entity_id ?? "_none";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  });

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([eid, ts]) => (
        <Card key={eid}>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">
              {formatEntityDisplayName(entityName.get(eid) ?? "Unassigned")}
              <Badge variant="outline" className="ml-2">
                {ts.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <TaskTable
              tasks={ts}
              firmId={firmId}
              projectId={projectId}
              showEntity={false}
              entityName={entityName}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TaskTable({ tasks, firmId, projectId, showEntity, entityName }: any) {
  return (
    <div className="divide-y rounded-md border">
      {tasks.map((t: any) => (
        <div key={t.id} className="flex items-center justify-between gap-3 p-3 text-sm">
          <div className="min-w-0 flex-1">
            <Link
              to="/ops/tasks/$taskId"
              params={{ taskId: t.id }}
              className="font-medium hover:underline truncate block"
            >
              {t.title}
            </Link>
            <div className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
              {showEntity && entityName.get(t.entity_id) ? (
                <span>{entityName.get(t.entity_id)} · </span>
              ) : null}
              {t.due_date ? <span>Due {new Date(t.due_date).toLocaleDateString()} · </span> : null}
              <PriorityBadge value={t.priority} />
            </div>
          </div>
          <Badge variant="outline" className="capitalize">
            {String(t.status).replace("_", " ")}
          </Badge>
        </div>
      ))}
      {/* Hidden firmId/projectId references for future deep links */}
      <span className="hidden">
        {firmId}/{projectId}
      </span>
    </div>
  );
}

/* ---------------- Discussion ---------------- */

function DiscussionPanel({ firmId, projectId }: { firmId: string; projectId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [body, setBody] = useState("");

  const { data: messages = [] } = useQuery({
    queryKey: ["fh-ws-discussion", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firm_messages")
        .select("id, body, created_at, author_id, is_client_visible")
        .eq("project_id", projectId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const post = useMutation({
    mutationFn: async () => {
      if (!body.trim() || !user) return;
      const { error } = await supabase.from("firm_messages").insert({
        firm_id: firmId,
        project_id: projectId,
        author_id: user.id,
        body: body.trim(),
        is_client_visible: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["fh-ws-discussion", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Project discussion</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 max-h-[420px] overflow-y-auto">
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">No messages yet.</div>
          ) : (
            messages.map((m: any) => (
              <div key={m.id} className="rounded-md border p-2 text-sm">
                <div className="text-xs text-muted-foreground mb-1">
                  {new Date(m.created_at).toLocaleString()}
                </div>
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a message…"
            rows={2}
          />
          <Button onClick={() => post.mutate()} disabled={!body.trim() || post.isPending}>
            Send
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Notes ---------------- */

function NotesPanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const isClient = role === "client";
  const [body, setBody] = useState("");

  const { data: notes = [] } = useQuery({
    queryKey: ["fh-ws-notes", projectId, isClient],
    queryFn: async () => {
      let q = supabase
        .from("entity_notes")
        .select("id, body, title, created_at, is_internal")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (isClient) q = q.eq("is_internal", false);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!body.trim() || !user) return;
      const { error } = await supabase
        .from("entity_notes")
        .insert({
          project_id: projectId,
          body: body.trim(),
          is_internal: !isClient,
          created_by: user.id,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["fh-ws-notes", projectId, isClient] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {!isClient && (
          <div className="flex gap-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a note…"
              rows={2}
            />
            <Button onClick={() => add.mutate()} disabled={!body.trim() || add.isPending}>
              Add
            </Button>
          </div>
        )}
        {notes.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">No notes yet.</div>
        ) : (
          <div className="space-y-2">
            {notes.map((n: any) => (
              <div key={n.id} className="rounded-md border p-3 text-sm">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-2">
                  {new Date(n.created_at).toLocaleString()}
                  {n.is_internal && <Badge variant="outline">Internal</Badge>}
                </div>
                {n.title && <div className="font-medium">{n.title}</div>}
                <div className="whitespace-pre-wrap">{n.body}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Links (aggregated from project's tasks) ---------------- */

function LinksPanel({ projectId }: { projectId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["fh-ws-links", projectId],
    queryFn: async () => {
      const { data: entities } = await supabase
        .from("client_entities")
        .select("id")
        .eq("project_id", projectId);
      const entityIds = (entities ?? []).map((e: any) => e.id);
      if (entityIds.length === 0) return [];
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title")
        .in("entity_id", entityIds);
      const taskIds = (tasks ?? []).map((t: any) => t.id);
      if (taskIds.length === 0) return [];
      const titles = new Map((tasks ?? []).map((t: any) => [t.id, t.title]));
      const { data: links, error } = await supabase
        .from("task_links")
        .select("id, task_id, description, url, created_at")
        .in("task_id", taskIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (links ?? []).map((l: any) => ({ ...l, taskTitle: titles.get(l.task_id) }));
    },
  });

  if (isLoading)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  if (data.length === 0)
    return (
      <EmptyState
        title="No links yet"
        description="External links added to project tasks will appear here."
      />
    );
  return (
    <Card>
      <CardContent className="p-4">
        <div className="divide-y">
          {data.map((l: any) => {
            const href = safeHref(l.url);
            return (
              <div key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline truncate"
                  >
                    {l.description || l.url}
                  </a>
                ) : (
                  <span className="truncate text-muted-foreground">{l.description || l.url}</span>
                )}
                <span className="text-xs text-muted-foreground truncate">{l.taskTitle}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Open Points (sourced from task_action_items) ---------------- */

function OpenPointsPanel({ projectId }: { projectId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["fh-ws-open-points", projectId],
    queryFn: async () => {
      const { data: entities } = await supabase
        .from("client_entities")
        .select("id")
        .eq("project_id", projectId);
      const entityIds = (entities ?? []).map((e: any) => e.id);
      if (entityIds.length === 0) return [];
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title")
        .in("entity_id", entityIds);
      const taskIds = (tasks ?? []).map((t: any) => t.id);
      if (taskIds.length === 0) return [];
      const titles = new Map((tasks ?? []).map((t: any) => [t.id, t.title]));
      const { data: items, error } = await supabase
        .from("task_action_items")
        .select("id, task_id, title, created_at, end_at, status, is_client_visible")
        .in("task_id", taskIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (items ?? []).map((m: any) => ({
        ...m,
        body: m.title,
        resolved_at: m.end_at,
        taskTitle: titles.get(m.task_id),
      }));
    },
  });

  if (isLoading)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  const open = data.filter((m: any) => !m.resolved_at);
  const resolved = data.filter((m: any) => m.resolved_at);
  if (data.length === 0)
    return (
      <EmptyState
        title="No open points"
        description="Open points raised on project tasks will appear here."
      />
    );
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <Section title={`Open (${open.length})`} items={open} />
        {resolved.length > 0 && (
          <Section title={`Resolved (${resolved.length})`} items={resolved} muted />
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, items, muted }: { title: string; items: any[]; muted?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-medium uppercase text-muted-foreground mb-2">{title}</div>
      <div className="divide-y rounded-md border">
        {items.map((m: any) => (
          <div key={m.id} className={"p-3 text-sm " + (muted ? "opacity-60" : "")}>
            <div className="text-xs text-muted-foreground mb-1">
              {new Date(m.created_at).toLocaleString()} · {m.taskTitle}
            </div>
            <div className="whitespace-pre-wrap">{m.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Time Logs ---------------- */

function TimeLogsPanel({ projectId }: { projectId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["fh-ws-time-logs", projectId],
    queryFn: async () => {
      const { data: entities } = await supabase
        .from("client_entities")
        .select("id")
        .eq("project_id", projectId);
      const entityIds = (entities ?? []).map((e: any) => e.id);
      if (entityIds.length === 0) return [];
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, title")
        .in("entity_id", entityIds);
      const taskIds = (tasks ?? []).map((t: any) => t.id);
      if (taskIds.length === 0) return [];
      const titles = new Map((tasks ?? []).map((t: any) => [t.id, t.title]));
      const { data: logs, error } = await supabase
        .from("time_logs")
        .select("id, task_id, started_at, ended_at, duration_minutes, note, user_id, billable")
        .in("task_id", taskIds)
        .order("started_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (logs ?? []).map((l: any) => ({ ...l, taskTitle: titles.get(l.task_id) }));
    },
  });

  const total = useMemo(
    () => data.reduce((acc: number, l: any) => acc + (l.duration_minutes ?? 0), 0),
    [data],
  );

  if (isLoading)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  if (data.length === 0)
    return (
      <EmptyState
        title="No time logged"
        description="Time logged on project tasks will appear here."
      />
    );
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">
          Total: {(total / 60).toFixed(1)}h across {data.length} entries
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y rounded-md border">
          {data.map((l: any) => (
            <div key={l.id} className="flex items-center justify-between gap-3 p-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{l.taskTitle}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(l.started_at).toLocaleString()}
                  {l.note ? ` · ${l.note}` : ""}
                </div>
              </div>
              <Badge variant="outline">{((l.duration_minutes ?? 0) / 60).toFixed(2)}h</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Capabilities ---------------- */

export function workspaceTabsForRole(role: string | null | undefined): WorkspaceTab[] {
  switch (role) {
    case "super_admin":
    case "admin":
      return ["tasks", "discussion", "notes", "links", "open-points", "time-logs"];
    case "employee":
      return ["tasks", "discussion", "notes", "links", "open-points", "time-logs"];
    case "client":
      return ["tasks", "discussion", "notes", "links", "open-points"];
    default:
      return ["tasks"];
  }
}

export function showSetupForRole(
  role: string | null | undefined,
  roles?: ReadonlyArray<string | null | undefined>,
): boolean {
  if (role === "super_admin" || role === "admin") return true;
  return !!roles?.some((r) => r === "super_admin" || r === "admin");
}
