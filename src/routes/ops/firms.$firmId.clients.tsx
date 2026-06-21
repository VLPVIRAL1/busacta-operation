import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Plus,
  FolderTree,
  ChevronRight,
  Trash2,
  Pencil,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/shared/utils";
import {
  firmClientsQuery,
  firmClientTasksQuery,
  firmGroupTasksQuery,
  createFirmClient,
  createFirmClientGroupReturningId,
  updateFirmClient,
  deleteFirmClient,
  reassignTaskClient,
  type FirmClientRow as ClientRow,
  type FirmClientTaskRow as TaskRow,
} from "@/lib/queries/ops.queries";

export const Route = createFileRoute("/ops/firms/$firmId/clients")({
  component: FirmClientsPage,
  errorComponent: RouteErrorComponent,
});

type ProjectStat = {
  projectId: string;
  projectName: string;
  running: number;
  completed: number;
};

function computeProjectStats(tasks: TaskRow[]): ProjectStat[] {
  const map = new Map<string, ProjectStat>();
  for (const t of tasks) {
    const proj = t.client_entities?.projects;
    if (!proj) continue;
    if (!map.has(proj.id)) {
      map.set(proj.id, { projectId: proj.id, projectName: proj.name, running: 0, completed: 0 });
    }
    const stat = map.get(proj.id)!;
    if (t.status === "complete") {
      stat.completed++;
    } else if (t.status !== "cancelled") {
      stat.running++;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
}

function FirmClientsPage() {
  const { firmId } = Route.useParams();
  const { role } = useAuth();
  const isInternal = role === "admin" || role === "employee";
  const qc = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"client" | "group">("client");
  const [newParentId, setNewParentId] = useState<string>("none");
  const [inlineGroupOpen, setInlineGroupOpen] = useState(false);
  const [inlineGroupName, setInlineGroupName] = useState("");

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editParentId, setEditParentId] = useState<string>("none");

  const [dragTaskId, setDragTaskId] = useState<string | null>(null);

  const { data: clients, isLoading } = useQuery(firmClientsQuery(firmId));

  const groups = useMemo(() => (clients ?? []).filter((c) => c.kind === "group"), [clients]);
  const ungrouped = useMemo(
    () => (clients ?? []).filter((c) => c.kind === "client" && !c.parent_id),
    [clients],
  );
  const selected = useMemo(
    () => (clients ?? []).find((c) => c.id === selectedId) ?? null,
    [clients, selectedId],
  );

  const groupChildIds = useMemo(
    () =>
      selected?.kind === "group"
        ? (clients ?? []).filter((c) => c.parent_id === selected.id).map((c) => c.id)
        : [],
    [clients, selected],
  );

  const { data: tasks } = useQuery(
    firmClientTasksQuery(firmId, selected?.kind === "client" ? selectedId : null),
  );
  const { data: groupTasks } = useQuery(
    firmGroupTasksQuery(selected?.kind === "group" ? selectedId : null, groupChildIds),
  );

  const projectStats = useMemo(
    () => computeProjectStats(selected?.kind === "client" ? (tasks ?? []) : (groupTasks ?? [])),
    [tasks, groupTasks, selected],
  );
  const totalRunning = useMemo(
    () => projectStats.reduce((s, p) => s + p.running, 0),
    [projectStats],
  );
  const totalCompleted = useMemo(
    () => projectStats.reduce((s, p) => s + p.completed, 0),
    [projectStats],
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newName.trim()) throw new Error("Name required");
      await createFirmClient({
        firmId,
        name: newName.trim(),
        kind: newKind,
        parentId: newKind === "client" && newParentId !== "none" ? newParentId : null,
      });
    },
    onSuccess: () => {
      toast.success("Created");
      setCreateOpen(false);
      setNewName("");
      setNewKind("client");
      setNewParentId("none");
      qc.invalidateQueries({ queryKey: ["firm-clients", firmId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !editName.trim()) throw new Error("Name required");
      await updateFirmClient({
        id: selected.id,
        name: editName.trim(),
        notes: editNotes.trim() || null,
        parentId: selected.kind === "client" && editParentId !== "none" ? editParentId : null,
      });
    },
    onSuccess: () => {
      toast.success("Saved");
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["firm-clients", firmId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFirmClient(id),
    onSuccess: () => {
      toast.success("Deleted");
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["firm-clients", firmId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reassignTask = useMutation({
    mutationFn: (v: { taskId: string; clientId: string | null }) => reassignTaskClient(v),
    onSuccess: () => {
      toast.success("Task moved");
      qc.invalidateQueries({ queryKey: ["firm-clients-tasks", firmId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit(c: ClientRow) {
    setEditName(c.name);
    setEditNotes(c.notes ?? "");
    setEditParentId(c.parent_id ?? "none");
    setEditOpen(true);
  }

  function ClientNode({ c }: { c: ClientRow }) {
    const childCount = (clients ?? []).filter((x) => x.parent_id === c.id).length;
    const isActive = selectedId === c.id;
    return (
      <button
        type="button"
        onClick={() => setSelectedId(c.id)}
        onDragOver={(e) => {
          if (isInternal && c.kind === "client") e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragTaskId && c.kind === "client") {
            reassignTask.mutate({ taskId: dragTaskId, clientId: c.id });
            setDragTaskId(null);
          }
        }}
        className={cn(
          "w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-colors",
          isActive ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50",
        )}
      >
        {c.kind === "group" ? (
          <FolderTree className="h-3.5 w-3.5 text-amber-600 shrink-0" />
        ) : (
          <Users className="h-3.5 w-3.5 text-primary shrink-0" />
        )}
        <span className="truncate flex-1">{c.name}</span>
        {c.kind === "group" && childCount > 0 && (
          <span className="text-[10px] text-muted-foreground">{childCount}</span>
        )}
      </button>
    );
  }

  const activeTasks = (tasks ?? []).filter((t) => t.status !== "complete");
  const completedTasks = (tasks ?? []).filter((t) => t.status === "complete");

  return (
    <div className="h-full min-h-0">
      <ResizableTwoPane
        storageKey="firm-clients"
        defaultLeft={35}
        minLeft={20}
        maxLeft={60}
        left={
          <Card className="glass border-border-subtle h-full min-h-0 flex flex-col">
            <CardContent className="p-4 flex flex-col h-full min-h-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Clients
                </h2>
                {isInternal && (
                  <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 px-2">
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>New client or group</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                        <div>
                          <Label>Type</Label>
                          <Select
                            value={newKind}
                            onValueChange={(v) => setNewKind(v as "client" | "group")}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="client">Client</SelectItem>
                              <SelectItem value="group">Client Group</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Name</Label>
                          <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Acme LLC"
                          />
                        </div>
                        {newKind === "client" && (
                          <div>
                            <div className="flex items-center justify-between">
                              <Label>Client Group</Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => setInlineGroupOpen((v) => !v)}
                              >
                                <Plus className="h-3 w-3 mr-0.5" /> New group
                              </Button>
                            </div>
                            <Select value={newParentId} onValueChange={setNewParentId}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">— No Client Group —</SelectItem>
                                {groups.map((g) => (
                                  <SelectItem key={g.id} value={g.id}>
                                    {g.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {inlineGroupOpen && (
                              <div className="mt-2 flex gap-2">
                                <Input
                                  value={inlineGroupName}
                                  onChange={(e) => setInlineGroupName(e.target.value)}
                                  placeholder="Group name"
                                  className="h-8"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  disabled={!inlineGroupName.trim()}
                                  onClick={async () => {
                                    try {
                                      const newId = await createFirmClientGroupReturningId({
                                        firmId,
                                        name: inlineGroupName.trim(),
                                      });
                                      toast.success("Group created");
                                      setInlineGroupName("");
                                      setInlineGroupOpen(false);
                                      await qc.invalidateQueries({
                                        queryKey: ["firm-clients", firmId],
                                      });
                                      if (newId) setNewParentId(newId);
                                    } catch (e) {
                                      toast.error((e as Error).message);
                                    }
                                  }}
                                >
                                  Add
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={() => createMutation.mutate()}
                          disabled={createMutation.isPending}
                        >
                          Create
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto scroll-modern -mx-1 px-1">
                {isLoading ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-8" />
                    ))}
                  </div>
                ) : (clients ?? []).length === 0 ? (
                  <EmptyState
                    icon={<Users className="h-8 w-8" />}
                    title="No clients yet"
                    description={
                      isInternal
                        ? "Add a client or group to start tagging tasks."
                        : "Your firm hasn't set up clients yet."
                    }
                  />
                ) : (
                  <ul className="space-y-1">
                    {groups.map((g) => (
                      <li key={g.id}>
                        <ClientNode c={g} />
                        <ul className="ml-5 mt-0.5 space-y-0.5">
                          {(clients ?? [])
                            .filter((c) => c.parent_id === g.id)
                            .map((c) => (
                              <li key={c.id}>
                                <ClientNode c={c} />
                              </li>
                            ))}
                        </ul>
                      </li>
                    ))}
                    {ungrouped.map((c) => (
                      <li key={c.id}>
                        <ClientNode c={c} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        }
        right={
          <Card className="glass border-border-subtle h-full min-h-0 flex flex-col">
            <CardContent className="p-5 flex flex-col h-full min-h-0">
              {!selected ? (
                <EmptyState
                  icon={<Users className="h-8 w-8" />}
                  title="Select a client"
                  description="Pick a client or group on the left to see its project stats and tasks. Drag tasks between clients to re-tag."
                />
              ) : (
                <>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold truncate">{selected.name}</h2>
                        <Badge variant="outline" className="text-[10px]">
                          {selected.kind === "group" ? "Group" : "Client"}
                        </Badge>
                        {selected.kind === "client" && selected.parent_id && (
                          <Badge variant="secondary" className="text-[10px]">
                            {groups.find((g) => g.id === selected.parent_id)?.name}
                          </Badge>
                        )}
                      </div>
                      {selected.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{selected.notes}</p>
                      )}
                    </div>
                    {isInternal && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(selected)}
                          className="h-7 w-7 p-0"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Delete "${selected.name}"? Tasks will be untagged.`))
                              deleteMutation.mutate(selected.id);
                          }}
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {selected.kind === "group" ? (
                    <GroupDetail
                      clients={clients ?? []}
                      groupId={selected.id}
                      groupTasks={groupTasks ?? []}
                      projectStats={projectStats}
                      totalRunning={totalRunning}
                      totalCompleted={totalCompleted}
                      onSelectClient={setSelectedId}
                      dragTaskId={dragTaskId}
                      setDragTaskId={setDragTaskId}
                      reassignTask={(taskId, clientId) =>
                        reassignTask.mutate({ taskId, clientId })
                      }
                      isInternal={isInternal}
                    />
                  ) : (
                    <ClientDetail
                      tasks={tasks ?? []}
                      activeTasks={activeTasks}
                      completedTasks={completedTasks}
                      projectStats={projectStats}
                      totalRunning={totalRunning}
                      totalCompleted={totalCompleted}
                      dragTaskId={dragTaskId}
                      setDragTaskId={setDragTaskId}
                      isInternal={isInternal}
                    />
                  )}
                </>
              )}
            </CardContent>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit {selected?.kind === "group" ? "group" : "client"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Name"
                    />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Optional notes"
                      rows={3}
                    />
                  </div>
                  {selected?.kind === "client" && (
                    <div>
                      <Label>Client Group</Label>
                      <Select value={editParentId} onValueChange={setEditParentId}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— No Client Group —</SelectItem>
                          {groups
                            .filter((g) => g.id !== selected?.id)
                            .map((g) => (
                              <SelectItem key={g.id} value={g.id}>
                                {g.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Card>
        }
      />
    </div>
  );
}

function StatBar({
  running,
  completed,
}: {
  running: number;
  completed: number;
}) {
  const total = running + completed;
  if (total === 0) return null;
  const pct = Math.round((completed / total) * 100);
  return (
    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
    </div>
  );
}

function ProjectStatsSection({
  projectStats,
  totalRunning,
  totalCompleted,
}: {
  projectStats: ProjectStat[];
  totalRunning: number;
  totalCompleted: number;
}) {
  if (projectStats.length === 0) return null;
  return (
    <div className="mb-4">
      {/* Summary counts */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg border bg-background/50 p-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-500 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Running</p>
            <p className="text-lg font-semibold leading-none">{totalRunning}</p>
          </div>
        </div>
        <div className="rounded-lg border bg-background/50 p-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-lg font-semibold leading-none">{totalCompleted}</p>
          </div>
        </div>
      </div>

      {/* Per-project breakdown */}
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
        By Project
      </p>
      <ul className="space-y-2">
        {projectStats.map((p) => (
          <li key={p.projectId} className="rounded-md border bg-background/30 px-3 py-2">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-medium truncate">{p.projectName}</span>
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                {p.running} running · {p.completed} done
              </span>
            </div>
            <StatBar running={p.running} completed={p.completed} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClientDetail({
  tasks,
  activeTasks,
  completedTasks,
  projectStats,
  totalRunning,
  totalCompleted,
  dragTaskId,
  setDragTaskId,
  isInternal,
}: {
  tasks: TaskRow[];
  activeTasks: TaskRow[];
  completedTasks: TaskRow[];
  projectStats: ProjectStat[];
  totalRunning: number;
  totalCompleted: number;
  dragTaskId: string | null;
  setDragTaskId: (id: string | null) => void;
  isInternal: boolean;
}) {
  const [showCompleted, setShowCompleted] = useState(false);

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="No tasks tagged yet"
        description="Tag a task to this client from the task drawer, or drag a task here from another client."
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scroll-modern pr-1 space-y-4">
      <ProjectStatsSection
        projectStats={projectStats}
        totalRunning={totalRunning}
        totalCompleted={totalCompleted}
      />

      {/* Active tasks */}
      {activeTasks.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
            Active tasks ({activeTasks.length})
          </p>
          <ul className="space-y-2">
            {activeTasks.map((t) => (
              <TaskCard
                key={t.id}
                t={t}
                draggable={isInternal}
                onDragStart={() => setDragTaskId(t.id)}
                onDragEnd={() => setDragTaskId(null)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Completed tasks (collapsible) */}
      {completedTasks.length > 0 && (
        <div>
          <button
            type="button"
            className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={() => setShowCompleted((v) => !v)}
          >
            <ChevronRight
              className={cn("h-3 w-3 transition-transform", showCompleted && "rotate-90")}
            />
            Completed ({completedTasks.length})
          </button>
          {showCompleted && (
            <ul className="space-y-2">
              {completedTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  t={t}
                  draggable={isInternal}
                  onDragStart={() => setDragTaskId(t.id)}
                  onDragEnd={() => setDragTaskId(null)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function GroupDetail({
  clients,
  groupId,
  groupTasks,
  projectStats,
  totalRunning,
  totalCompleted,
  onSelectClient,
  dragTaskId,
  setDragTaskId,
  reassignTask,
  isInternal,
}: {
  clients: ClientRow[];
  groupId: string;
  groupTasks: TaskRow[];
  projectStats: ProjectStat[];
  totalRunning: number;
  totalCompleted: number;
  onSelectClient: (id: string) => void;
  dragTaskId: string | null;
  setDragTaskId: (id: string | null) => void;
  reassignTask: (taskId: string, clientId: string) => void;
  isInternal: boolean;
}) {
  const children = clients.filter((c) => c.parent_id === groupId);

  const tasksByClient = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const t of groupTasks) {
      if (!t.client_id) continue;
      if (!map.has(t.client_id)) map.set(t.client_id, []);
      map.get(t.client_id)!.push(t);
    }
    return map;
  }, [groupTasks]);

  if (children.length === 0) {
    return (
      <EmptyState
        title="No clients in this group"
        description="Create a client and assign it to this group."
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto scroll-modern pr-1 space-y-4">
      <ProjectStatsSection
        projectStats={projectStats}
        totalRunning={totalRunning}
        totalCompleted={totalCompleted}
      />

      <div>
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
          Clients ({children.length})
        </p>
        <ul className="space-y-2">
          {children.map((c) => {
            const cTasks = tasksByClient.get(c.id) ?? [];
            const cRunning = cTasks.filter((t) => t.status !== "complete").length;
            const cDone = cTasks.filter((t) => t.status === "complete").length;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelectClient(c.id)}
                  onDragOver={(e) => {
                    if (isInternal) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragTaskId) {
                      reassignTask(dragTaskId, c.id);
                      setDragTaskId(null);
                    }
                  }}
                  className="w-full text-left rounded-md border bg-background/30 px-3 py-2 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Users className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-sm font-medium truncate">{c.name}</span>
                    </div>
                    {cTasks.length > 0 && (
                      <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                        {cRunning} running · {cDone} done
                      </span>
                    )}
                  </div>
                  {cTasks.length > 0 && <StatBar running={cRunning} completed={cDone} />}
                  {c.notes && (
                    <p className="text-[11px] text-muted-foreground mt-1 truncate">{c.notes}</p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function TaskCard({
  t,
  draggable,
  onDragStart,
  onDragEnd,
}: {
  t: TaskRow;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const projectName = t.client_entities?.projects?.name;
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="rounded-md border p-3 bg-background/50 hover:bg-muted/30 transition-colors cursor-move"
    >
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/ops/tasks/$taskId"
          params={{ taskId: t.id }}
          className="font-medium text-sm hover:underline truncate flex-1"
        >
          {t.title}
        </Link>
        <div className="flex items-center gap-1.5 shrink-0">
          {t.status === "complete" && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          )}
          <Badge variant="outline" className="text-[10px]">
            {t.pipeline_stage.replace(/_/g, " ")}
          </Badge>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
      {projectName && (
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{projectName}</p>
      )}
    </div>
  );
}
