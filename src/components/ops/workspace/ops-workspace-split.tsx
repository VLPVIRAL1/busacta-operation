import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  FolderKanban,
  FolderTree,
  Info,
  ListTodo,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Timer,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { coloredTabTrigger } from "@/lib/ui/colored-tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { SopsAndNotesCombinedPanel } from "@/components/ops/sops-and-notes";
import { FirmTimesheetPanel } from "@/components/ops/firm-timesheet-panel";
import { cn } from "@/lib/shared/utils";
import {
  unifiedClientsListQuery,
  type UnifiedClient,
  type UnifiedStream,
} from "@/lib/queries/unified-clients.queries";
import {
  firmProjectsQuery,
  projectWorkspaceTasksQuery,
  opsFirmsListQuery,
  opsFirmHeaderQuery,
  firmClientsQuery,
  firmClientTasksQuery,
  firmsTeamRowsQuery,
  firmsEmployeeOptionsQuery,
  createFirmClient,
  updateFirmClient,
  deleteFirmClient,
  archiveFirmClient,
  updateTaskField,
  type FirmClientRow,
  type FirmClientTaskRow,
  type FirmsEmployeeOption,
} from "@/lib/queries/ops.queries";
import {
  directClientDetailQuery,
  directClientTasksQuery,
} from "@/lib/queries/direct-clients.queries";
import { PROJECT_TYPE_OPTIONS, TASK_STATUS_OPTIONS } from "@/lib/shared/domain";
import { useDebouncedSearch } from "@/lib/url-state/use-debounced-search";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type StreamFilter = "all" | "cpa" | "direct";
type WorkspaceTab = "info" | "projects" | "clients" | "logs" | "sops";

const SELECTED_LS_KEY = "opsWorkspace.split.selected";

function parseSelection(
  value: string | null | undefined,
): { stream: UnifiedStream; id: string } | null {
  if (!value) return null;
  const [stream, id] = value.split(":");
  if ((stream === "cpa" || stream === "direct") && id) return { stream, id };
  return null;
}

// ─────────────────────────────────────────────────────────────
// Left pane
// ─────────────────────────────────────────────────────────────

function WorkspaceLeftPane({
  clients,
  isLoading,
  streamFilter,
  onStreamChange,
  localSearch,
  onSearchChange,
  selectedKey,
  onSelect,
}: {
  clients: UnifiedClient[];
  isLoading: boolean;
  streamFilter: StreamFilter;
  onStreamChange: (s: StreamFilter) => void;
  localSearch: string;
  onSearchChange: (s: string) => void;
  selectedKey: string | null;
  onSelect: (c: UnifiedClient) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(Boolean(localSearch));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  const counts = useMemo(() => {
    const cpa = clients.filter((c) => c.stream === "cpa").length;
    const direct = clients.filter((c) => c.stream === "direct").length;
    return { cpa, direct, all: cpa + direct };
  }, [clients]);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (streamFilter !== "all" && c.stream !== streamFilter) return false;
      if (localSearch) {
        const q = localSearch.toLowerCase();
        if (!`${c.name} ${c.code ?? ""}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [clients, streamFilter, localSearch]);

  return (
    <div className="h-full min-h-0 flex flex-col border rounded-lg overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="border-b bg-background/95 backdrop-blur px-3 py-2 space-y-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <Tabs
            value={streamFilter}
            onValueChange={(v) => onStreamChange(v as StreamFilter)}
            className="flex-1 min-w-0"
          >
            <TabsList className="h-8 w-full grid grid-cols-3">
              <TabsTrigger value="all" className="text-xs h-6 gap-1">
                <Users className="h-3 w-3" />
                All
                <span className="text-muted-foreground">({counts.all})</span>
              </TabsTrigger>
              <TabsTrigger value="cpa" className="text-xs h-6 gap-1">
                <Building2 className="h-3 w-3" />
                Firms
                <span className="text-muted-foreground">({counts.cpa})</span>
              </TabsTrigger>
              <TabsTrigger value="direct" className="text-xs h-6 gap-1">
                <User className="h-3 w-3" />
                Direct
                <span className="text-muted-foreground">({counts.direct})</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {searchOpen ? (
            <div className="relative w-32 shrink-0">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={localSearch}
                onChange={(e) => onSearchChange(e.target.value)}
                onBlur={() => {
                  if (!localSearch) setSearchOpen(false);
                }}
                placeholder="Search…"
                className="h-8 pl-7 pr-6 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  onSearchChange("");
                  setSearchOpen(false);
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              title="Search"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="text-[10px] text-muted-foreground tabular-nums text-right">
          {filtered.length} of {counts.all}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-0.5">
        {isLoading ? (
          <div className="p-6 text-xs text-muted-foreground text-center">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No clients"
              description="Adjust the filter or search term."
            />
          </div>
        ) : (
          filtered.map((c) => {
            const key = `${c.stream}:${c.id}`;
            const active = selectedKey === key;
            const isFirm = c.stream === "cpa";
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect(c)}
                className={cn(
                  "w-full text-left rounded-md px-2.5 py-2 transition-colors border",
                  "hover:bg-violet-500/5 hover:border-violet-500/20",
                  active ? "bg-violet-500/10 border-violet-500/30" : "border-transparent",
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {isFirm ? (
                    <Building2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                  ) : (
                    <User className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                  )}
                  {c.code && (
                    <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1 rounded shrink-0">
                      {c.code}
                    </span>
                  )}
                  <span className="text-xs font-medium truncate flex-1">{c.name}</span>
                  {c.status !== "active" && (
                    <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">
                      {c.status}
                    </Badge>
                  )}
                </div>
                {c.contact && (
                  <div className="mt-0.5 ml-5 text-[10px] text-muted-foreground truncate">
                    {c.contact}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Projects (B2B firm) / Tasks (B2C client)
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Project tasks list — renders tasks for one selected project
// ─────────────────────────────────────────────────────────────

const COL_KEYS = ["id", "title", "entity", "status", "due"] as const;
type ColKey = (typeof COL_KEYS)[number];
const COL_LABELS: Record<ColKey, string> = {
  id: "Task ID",
  title: "Title",
  entity: "Entity",
  status: "Status",
  due: "Due",
};
const DEFAULT_COL_WIDTHS: Record<ColKey, number> = {
  id: 80,
  title: 210,
  entity: 100,
  status: 135,
  due: 82,
};

function ProjectTasksTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery(projectWorkspaceTasksQuery(projectId));

  // Inline-edit state
  const [editCell, setEditCell] = useState<{
    id: string;
    field: "title" | "status" | "due";
  } | null>(null);
  const [draft, setDraft] = useState("");

  // Resizable column widths
  const [colW, setColW] = useState<Record<ColKey, number>>({ ...DEFAULT_COL_WIDTHS });
  const resizeRef = useRef<{ col: ColKey; startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const diff = e.clientX - resizeRef.current.startX;
      setColW((prev) => ({
        ...prev,
        [resizeRef.current!.col]: Math.max(48, resizeRef.current!.startW + diff),
      }));
    };
    const onUp = () => {
      resizeRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = (col: ColKey, e: React.MouseEvent) => {
    e.preventDefault();
    resizeRef.current = { col, startX: e.clientX, startW: colW[col] };
  };

  const openEdit = (id: string, field: "title" | "status" | "due", value: string) => {
    setEditCell({ id, field });
    setDraft(value);
  };

  const commitEdit = async (taskId: string, field: "title" | "status" | "due", value: string) => {
    setEditCell(null);
    const patch: Record<string, unknown> = {};
    if (field === "title") {
      if (!value.trim()) return;
      patch.title = value.trim();
    } else if (field === "status") {
      patch.status = value;
    } else if (field === "due") {
      patch.due_date = value || null;
    }
    try {
      await updateTaskField(taskId, patch);
      qc.invalidateQueries({ queryKey: ["project-workspace-tasks", projectId] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<ListTodo className="h-8 w-8" />}
          title="No tasks yet"
          description="No tasks in this project yet."
        />
      </div>
    );
  }

  const tableW = COL_KEYS.reduce((sum, k) => sum + colW[k], 40);

  return (
    <div className="overflow-x-auto">
      <table className="text-sm border-collapse" style={{ tableLayout: "fixed", width: tableW }}>
        <colgroup>
          {COL_KEYS.map((k) => (
            <col key={k} style={{ width: colW[k] }} />
          ))}
          <col style={{ width: 40 }} />
        </colgroup>
        <thead className="bg-muted/40 border-b sticky top-0 z-10">
          <tr>
            {COL_KEYS.map((col) => (
              <th
                key={col}
                className="h-8 px-2 text-left text-[11px] uppercase tracking-wide font-medium text-muted-foreground relative select-none overflow-hidden"
              >
                <span className="truncate block pr-3">{COL_LABELS[col]}</span>
                {/* Drag handle */}
                <div
                  className="absolute right-0 top-0 h-full w-3 cursor-col-resize group/handle flex items-center justify-center"
                  onMouseDown={(e) => startResize(col, e)}
                >
                  <div className="h-4 w-px bg-border group-hover/handle:bg-primary transition-colors" />
                </div>
              </th>
            ))}
            <th className="h-8 w-[40px]" />
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const statusMeta =
              TASK_STATUS_OPTIONS.find((o) => o.value === t.status) ?? TASK_STATUS_OPTIONS[0];
            const due = t.due_date ? new Date(t.due_date + "T00:00:00") : null;
            const overdue = !!due && due < new Date() && t.status !== "complete";
            const isEditTitle = editCell?.id === t.id && editCell.field === "title";
            const isEditStatus = editCell?.id === t.id && editCell.field === "status";
            const isEditDue = editCell?.id === t.id && editCell.field === "due";

            return (
              <tr key={t.id} className="h-10 border-b last:border-0 hover:bg-muted/40 group/row">
                {/* Task ID */}
                <td className="px-2 py-1.5 overflow-hidden">
                  <span
                    className="text-[10px] font-mono text-muted-foreground truncate block"
                    title={t.slug ?? t.id}
                  >
                    {t.slug ?? t.id.slice(0, 8)}
                  </span>
                </td>

                {/* Title — click to edit */}
                <td
                  className="px-2 py-1.5 font-medium overflow-hidden cursor-text"
                  onClick={() => !isEditTitle && openEdit(t.id, "title", t.title)}
                >
                  {isEditTitle ? (
                    <input
                      autoFocus
                      className="w-full bg-background border border-primary rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commitEdit(t.id, "title", draft)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(t.id, "title", draft);
                        if (e.key === "Escape") setEditCell(null);
                      }}
                    />
                  ) : (
                    <span className="truncate block">{t.title}</span>
                  )}
                </td>

                {/* Entity */}
                <td className="px-2 py-1.5 text-xs text-muted-foreground overflow-hidden">
                  <span className="truncate block">{t.entity_name || "—"}</span>
                </td>

                {/* Status — click to open Select */}
                <td
                  className="px-2 py-1.5 overflow-hidden cursor-pointer"
                  onClick={() => !isEditStatus && openEdit(t.id, "status", t.status)}
                >
                  {isEditStatus ? (
                    <Select
                      defaultOpen
                      value={draft}
                      onValueChange={(v) => commitEdit(t.id, "status", v)}
                      onOpenChange={(open) => !open && setEditCell(null)}
                    >
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value} className="text-xs">
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge className={cn(statusMeta.tone, "border-0 text-[10px]")}>
                      {statusMeta.label}
                    </Badge>
                  )}
                </td>

                {/* Due date — click to edit */}
                <td
                  className={cn(
                    "px-2 py-1.5 text-[11px] tabular-nums overflow-hidden cursor-pointer",
                    overdue ? "text-destructive" : "text-muted-foreground",
                  )}
                  onClick={() =>
                    !isEditDue && openEdit(t.id, "due", t.due_date ? t.due_date.slice(0, 10) : "")
                  }
                >
                  {isEditDue ? (
                    <input
                      type="date"
                      autoFocus
                      className="w-full bg-background border border-primary rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commitEdit(t.id, "due", draft)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit(t.id, "due", draft);
                        if (e.key === "Escape") setEditCell(null);
                      }}
                    />
                  ) : due ? (
                    due.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                  ) : (
                    <span className="opacity-0 group-hover/row:opacity-60 text-[10px] transition-opacity">
                      + date
                    </span>
                  )}
                </td>

                {/* Open in full page */}
                <td className="px-1 py-1.5">
                  <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                    <Link to="/ops/tasks/$taskId" params={{ taskId: t.id }}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Projects (CPA only) — inner project tabs with tasks
// ─────────────────────────────────────────────────────────────

function FirmProjectsPanel({ firmId }: { firmId: string }) {
  const { data: projects = [], isLoading } = useQuery(firmProjectsQuery(firmId));
  const [activeProjectId, setActiveProjectId] = useState<string>("");

  // Derive the active project — default to first after load
  const resolvedActive = activeProjectId || (projects[0]?.id ?? "");

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<FolderKanban className="h-8 w-8" />}
          title="No projects yet"
          description="Projects appear here once created in the Firm Hub."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/ops/firms/$firmId" params={{ firmId }}>
                Open Firm Hub
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Horizontally scrollable project name pill tabs */}
      <div className="shrink-0 border-b overflow-x-auto">
        <div className="flex gap-1 px-2 py-1.5 min-w-max">
          {projects.map((p) => {
            const isActive = p.id === resolvedActive;
            const ptMeta =
              PROJECT_TYPE_OPTIONS.find((o) => o.value === p.project_type) ??
              PROJECT_TYPE_OPTIONS[PROJECT_TYPE_OPTIONS.length - 1];
            return (
              <button
                key={p.id}
                onClick={() => setActiveProjectId(p.id)}
                className={cn(
                  "group relative flex flex-col items-start shrink-0 rounded-md px-3 py-1.5 text-left transition-colors",
                  isActive
                    ? "bg-background border shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <FolderKanban
                    className={cn(
                      "h-3 w-3 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium truncate max-w-[110px]",
                      isActive ? "text-foreground" : "",
                    )}
                  >
                    {p.name}
                  </span>
                  <Badge className={cn(ptMeta.tone, "border-0 text-[9px] px-1 py-0")}>
                    {ptMeta.label}
                  </Badge>
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums mt-0.5 ml-4">
                  {p.tasks_completed}/{p.tasks_total} done
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {/* Task list for the selected project */}
      <div className="flex-1 overflow-y-auto">
        {resolvedActive && <ProjectTasksTab projectId={resolvedActive} />}
      </div>
    </div>
  );
}

function DirectTasksPanel({ clientId }: { clientId: string }) {
  const { data: tasks = [], isLoading } = useQuery(directClientTasksQuery(clientId));

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<ListTodo className="h-8 w-8" />}
          title="No tasks yet"
          description="Tasks for this client will appear here."
        />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 border-b">
          <tr>
            <th className="h-8 px-3 text-left text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
              Title
            </th>
            <th className="h-8 px-3 text-left text-[11px] uppercase tracking-wide font-medium text-muted-foreground w-[110px]">
              Type
            </th>
            <th className="h-8 px-3 text-left text-[11px] uppercase tracking-wide font-medium text-muted-foreground w-[100px]">
              Status
            </th>
            <th className="h-8 px-3 text-left text-[11px] uppercase tracking-wide font-medium text-muted-foreground w-[80px]">
              Due
            </th>
            <th className="h-8 w-[40px]" />
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => {
            const typeLabel =
              (t.direct_client_task_types as { label?: string } | null)?.label ?? "—";
            const due = t.due_date ? new Date(t.due_date) : null;
            const overdue = !!due && due.getTime() < Date.now() && t.status !== "complete";
            return (
              <tr key={t.id} className="h-10 border-b last:border-0 hover:bg-muted/40">
                <td className="px-3 py-1.5 font-medium">
                  <span className="truncate block max-w-[240px]">{t.title}</span>
                </td>
                <td className="px-3 py-1.5 text-xs text-muted-foreground">{typeLabel}</td>
                <td className="px-3 py-1.5">
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {t.status?.replace(/_/g, " ") ?? "—"}
                  </Badge>
                </td>
                <td
                  className={cn(
                    "px-3 py-1.5 text-xs tabular-nums",
                    overdue ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {due
                    ? due.toLocaleDateString(undefined, { month: "short", day: "numeric" })
                    : "—"}
                </td>
                <td className="px-3 py-1.5">
                  <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                    <Link to="/ops/tasks/$taskId" params={{ taskId: t.id }}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Clients (CPA only) — inline client tree with task stats
// ─────────────────────────────────────────────────────────────

function ClientsPanel({ firmId }: { firmId: string }) {
  const qc = useQueryClient();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const { data: clients = [], isLoading } = useQuery(firmClientsQuery(firmId));

  // ── dialog state ──────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTarget, setDialogTarget] = useState<FirmClientRow | null>(null); // null = add mode
  const [draftName, setDraftName] = useState("");
  const [draftKind, setDraftKind] = useState<"client" | "group">("client");
  const [draftParentId, setDraftParentId] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);

  const qKey = ["firm-clients", firmId];

  const openAdd = () => {
    setDialogTarget(null);
    setDraftName("");
    setDraftKind("client");
    setDraftParentId(null);
    setNameTouched(false);
    setDialogOpen(true);
  };

  const openEdit = (c: FirmClientRow) => {
    setDialogTarget(c);
    setDraftName(c.name);
    setDraftKind(c.kind);
    setDraftParentId(c.parent_id);
    setNameTouched(false);
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = draftName.trim();
      if (!name) throw new Error("Name is required");
      if (dialogTarget) {
        await updateFirmClient({
          id: dialogTarget.id,
          name,
          notes: dialogTarget.notes,
          parentId: draftKind === "client" ? draftParentId : null,
        });
      } else {
        await createFirmClient({ firmId, name, kind: draftKind, parentId: draftParentId });
      }
    },
    onSuccess: () => {
      toast.success(dialogTarget ? "Client updated" : "Client added");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: qKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFirmClient(id),
    onSuccess: () => {
      toast.success("Client removed");
      if (selectedClientId === deleteMutation.variables) setSelectedClientId(null);
      qc.invalidateQueries({ queryKey: qKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveFirmClient(id),
    onSuccess: (_, id) => {
      toast.success("Client archived");
      setDialogOpen(false);
      if (selectedClientId === id) setSelectedClientId(null);
      qc.invalidateQueries({ queryKey: qKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleDelete = (c: FirmClientRow) => {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(c.id);
  };

  const groups = useMemo(() => clients.filter((c) => c.kind === "group"), [clients]);
  const ungrouped = useMemo(
    () => clients.filter((c) => c.kind === "client" && !c.parent_id),
    [clients],
  );
  const selected = useMemo(
    () => clients.find((c) => c.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );
  const groupChildIds = useMemo(
    () =>
      selected?.kind === "group"
        ? clients.filter((c) => c.parent_id === selected.id).map((c) => c.id)
        : [],
    [clients, selected],
  );

  const { data: clientTasks = [] } = useQuery(
    firmClientTasksQuery(firmId, selected?.kind === "client" ? selectedClientId : null),
  );

  if (isLoading) {
    return (
      <div className="p-3 space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  const clientTree = (
    <div className="h-full overflow-y-auto px-2 py-2 space-y-0.5">
      {clients.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-6 italic">
          No clients yet. Use "+ Add" to create one.
        </p>
      )}

      {/* Groups with their children */}
      {groups.map((g) => {
        const children = clients.filter((c) => c.parent_id === g.id);
        const isGroupSelected = selectedClientId === g.id;
        return (
          <div key={g.id}>
            <div
              className={cn(
                "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                isGroupSelected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50",
              )}
            >
              <button
                type="button"
                className="flex flex-1 items-center gap-2 min-w-0 text-left"
                onClick={() => setSelectedClientId(isGroupSelected ? null : g.id)}
              >
                <FolderTree className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span className="truncate flex-1 font-medium">{g.name}</span>
                <Badge variant="secondary" className="text-[9px] h-4 px-1 shrink-0">
                  group
                </Badge>
                {children.length > 0 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                    {children.length}
                  </span>
                )}
              </button>
              {/* Row actions */}
              <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(g)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(g)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {children.length > 0 && (
              <ul className="ml-5 mt-0.5 space-y-0.5">
                {children.map((c) => (
                  <li key={c.id}>
                    <ClientRow
                      client={c}
                      selected={selectedClientId === c.id}
                      onSelect={() => setSelectedClientId(selectedClientId === c.id ? null : c.id)}
                      onEdit={() => openEdit(c)}
                      onDelete={() => handleDelete(c)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {/* Ungrouped clients */}
      {ungrouped.map((c) => (
        <ClientRow
          key={c.id}
          client={c}
          selected={selectedClientId === c.id}
          onSelect={() => setSelectedClientId(selectedClientId === c.id ? null : c.id)}
          onEdit={() => openEdit(c)}
          onDelete={() => handleDelete(c)}
        />
      ))}
    </div>
  );

  const taskPanel =
    selected?.kind === "client" ? (
      <ClientTaskDetail firmId={firmId} client={selected} tasks={clientTasks} fullPanel />
    ) : (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="Select a client"
          description="Click any client on the left to view their tasks."
        />
      </div>
    );

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        {/* Header: count + Add button */}
        <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            {clients.filter((c) => c.kind === "client").length} clients · {groups.length} groups
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        {/* Two-panel split: client tree | task detail */}
        <div className="flex-1 min-h-0">
          <ResizableTwoPane
            storageKey={`workspace-clients-${firmId}`}
            defaultLeft={42}
            minLeft={28}
            maxLeft={60}
            left={clientTree}
            right={taskPanel}
          />
        </div>
      </div>

      {/* ── Add / Edit dialog ─────────────────────────────────── */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setNameTouched(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialogTarget ? "Edit client" : "Add client"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => setNameTouched(true)}
                placeholder="e.g. Alpha Roofing LLC"
                className={nameTouched && !draftName.trim() ? "border-destructive" : ""}
              />
              {nameTouched && !draftName.trim() && (
                <p className="text-xs text-destructive">Name is required</p>
              )}
            </div>

            {/* Kind — only for new entries */}
            {!dialogTarget && (
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={draftKind}
                  onValueChange={(v) => {
                    setDraftKind(v as "client" | "group");
                    if (v === "group") setDraftParentId(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Client</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Parent group — for client kind, both add and edit modes */}
            {draftKind === "client" && groups.length > 0 && (
              <div className="space-y-1.5">
                <Label>Group (optional)</Label>
                <Select
                  value={draftParentId ?? "none"}
                  onValueChange={(v) => setDraftParentId(v === "none" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No group</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Archive — only in edit mode */}
            {dialogTarget && (
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground mb-2">Danger zone</p>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  disabled={archiveMutation.isPending}
                  onClick={() => {
                    if (!dialogTarget) return;
                    if (confirm(`Archive "${draftName}"? They'll be hidden but not deleted.`)) {
                      archiveMutation.mutate(dialogTarget.id);
                    }
                  }}
                >
                  {archiveMutation.isPending ? "Archiving…" : "Archive this client"}
                </Button>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Archived clients are hidden from the list. Contact support to restore.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!draftName.trim() || saveMutation.isPending}
              onClick={() => {
                setNameTouched(true);
                if (draftName.trim()) saveMutation.mutate();
              }}
            >
              {saveMutation.isPending ? "Saving…" : dialogTarget ? "Save changes" : "Add client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ClientRow({
  client,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: {
  client: FirmClientRow;
  selected: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        selected ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted/50",
      )}
    >
      {/* Selectable area */}
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 items-center gap-2 min-w-0 text-left"
      >
        <Users className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="truncate flex-1">{client.name}</span>
        {client.notes && (
          <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
            {client.notes}
          </span>
        )}
        <ChevronRight
          className={cn(
            "h-3 w-3 text-muted-foreground shrink-0 transition-transform",
            selected && "rotate-90",
          )}
        />
      </button>
      {/* Row actions — visible on hover */}
      {(onEdit || onDelete) && (
        <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ClientTaskDetail({
  firmId,
  client,
  tasks,
  fullPanel = false,
}: {
  firmId: string;
  client: FirmClientRow;
  tasks: FirmClientTaskRow[];
  fullPanel?: boolean;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const active = tasks.filter((t) => t.status !== "complete" && t.status !== "cancelled");
  const completed = tasks.filter((t) => t.status === "complete");
  const total = active.length + completed.length;
  const pct = total === 0 ? 0 : Math.round((completed.length / total) * 100);

  return (
    <div
      className={cn(
        "overflow-y-auto",
        fullPanel ? "h-full" : "border-t bg-muted/20 shrink-0 max-h-64",
      )}
    >
      {/* Mini header */}
      <div className="px-3 py-2 flex items-center justify-between gap-2 sticky top-0 bg-muted/20 backdrop-blur border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">{client.name}</span>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {completed.length}/{total}
            </span>
            <Progress value={pct} className="h-1.5 w-16" />
          </div>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="px-3 py-3 text-xs text-muted-foreground italic">No tasks tagged.</div>
      ) : (
        <div className="px-3 py-2 space-y-3">
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border bg-background p-2 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <div>
                <div className="text-[10px] text-muted-foreground">Running</div>
                <div className="text-sm font-semibold leading-none">{active.length}</div>
              </div>
            </div>
            <div className="rounded-md border bg-background p-2 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <div>
                <div className="text-[10px] text-muted-foreground">Completed</div>
                <div className="text-sm font-semibold leading-none">{completed.length}</div>
              </div>
            </div>
          </div>

          {/* Active tasks */}
          {active.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                Active tasks
              </div>
              {active.map((t) => (
                <ClientTaskRow key={t.id} task={t} firmId={firmId} />
              ))}
            </div>
          )}

          {/* Completed (collapsible) */}
          {completed.length > 0 && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setShowCompleted((v) => !v)}
                className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground font-medium hover:text-foreground transition-colors"
              >
                <ChevronRight
                  className={cn("h-3 w-3 transition-transform", showCompleted && "rotate-90")}
                />
                Completed ({completed.length})
              </button>
              {showCompleted &&
                completed.map((t) => <ClientTaskRow key={t.id} task={t} firmId={firmId} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClientTaskRow({ task, firmId: _firmId }: { task: FirmClientTaskRow; firmId: string }) {
  const projectName = task.client_entities?.projects?.name;
  return (
    <Link
      to="/ops/tasks/$taskId"
      params={{ taskId: task.id }}
      className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 hover:bg-muted/40 transition-colors group"
    >
      {task.status === "complete" ? (
        <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
      ) : (
        <div className="h-3 w-3 rounded-full border border-muted-foreground/40 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium truncate group-hover:text-primary">{task.title}</div>
        {projectName && (
          <div className="text-[10px] text-muted-foreground truncate">{projectName}</div>
        )}
      </div>
      <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0">
        {task.pipeline_stage.replace(/_/g, " ")}
      </Badge>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: Working Logs
// ─────────────────────────────────────────────────────────────

function LogsPanel({ stream, id }: { stream: UnifiedStream; id: string }) {
  return (
    <div className="h-full p-3">
      {stream === "cpa" ? (
        <FirmTimesheetPanel firmId={id} />
      ) : (
        <FirmTimesheetPanel directClientId={id} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tab: SOP & Notes
// ─────────────────────────────────────────────────────────────

function SopsTab({ stream, id }: { stream: UnifiedStream; id: string }) {
  return (
    <div className="h-full">
      {stream === "cpa" ? (
        <SopsAndNotesCombinedPanel firm_id={id} />
      ) : (
        <SopsAndNotesCombinedPanel direct_client_id={id} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Live clock widget
// ─────────────────────────────────────────────────────────────

function LiveClock({ timezone }: { timezone: string | null }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!timezone) return null;

  const timeStr = now.toLocaleTimeString("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const dateStr = now.toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const tzAbbr =
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? timezone;

  return (
    <section className="rounded-lg border p-3 space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1.5">
        <Clock className="h-3 w-3" />
        Live US Time
      </div>
      <div className="text-2xl font-semibold tabular-nums leading-tight">{timeStr}</div>
      <div className="text-xs text-muted-foreground">
        {dateStr} • {tzAbbr}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Assigned offshore team avatars (B2B firms only)
// ─────────────────────────────────────────────────────────────

function TeamAvatars({ firmId }: { firmId: string }) {
  const { data: teamRows = [] } = useQuery(firmsTeamRowsQuery());
  const { data: employees = [] } = useQuery(firmsEmployeeOptionsQuery());

  const memberIds = teamRows.filter((r) => r.firm_id === firmId).map((r) => r.user_id);
  const members = employees.filter((e) => memberIds.includes(e.id));

  if (members.length === 0) return null;

  function initials(emp: FirmsEmployeeOption) {
    return (emp.full_name ?? emp.email ?? "?")
      .split(" ")
      .map((n) => n[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    <section className="rounded-lg border p-3 space-y-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1.5">
        <Users className="h-3 w-3" />
        Assigned Offshore Team
      </div>
      <div className="flex flex-wrap gap-1.5">
        {members.map((m) => (
          <div
            key={m.id}
            title={m.full_name ?? m.email ?? ""}
            className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-semibold overflow-hidden ring-1 ring-border shrink-0"
          >
            {m.avatar_url ? (
              <img src={m.avatar_url} alt={initials(m)} className="h-full w-full object-cover" />
            ) : (
              initials(m)
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Info panels (right pane: "Client Info" tab content)
// ─────────────────────────────────────────────────────────────

function FirmInfoPanel({ firmId }: { firmId: string }) {
  const { data: firms = [] } = useQuery(opsFirmsListQuery());
  const firm = firms.find((f) => f.id === firmId) ?? null;

  if (!firm) {
    return (
      <div className="p-4 space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <LiveClock timezone={firm.us_timezone} />

      <section className="rounded-lg border p-3 space-y-2.5 text-sm">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          Contact
        </div>
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{firm.contact_email || "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{firm.contact_phone || "—"}</span>
        </div>
      </section>

      <TeamAvatars firmId={firmId} />

      {firm.notes && (
        <section className="rounded-lg border p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            Notes
          </div>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{firm.notes}</p>
        </section>
      )}
    </div>
  );
}

function DirectClientInfoPanel({ clientId }: { clientId: string }) {
  const { data: client } = useQuery(directClientDetailQuery(clientId));

  if (!client) {
    return (
      <div className="p-4 space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  const address = [
    client.address_line1,
    client.address_line2,
    client.city,
    client.state,
    client.postal_code,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="p-4 space-y-4">
      <LiveClock timezone={client.us_timezone} />

      <section className="rounded-lg border p-3 space-y-2.5 text-sm">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          Contact
        </div>
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{client.email || "—"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{client.phone || "—"}</span>
        </div>
        <InfoRow label="Type" value={client.client_type} capitalize />
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs w-20 shrink-0">Status</span>
          <Badge
            variant={client.status === "active" ? "default" : "secondary"}
            className="text-[10px] capitalize"
          >
            {client.status}
          </Badge>
        </div>
      </section>

      {address && (
        <section className="rounded-lg border p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            Address
          </div>
          <p className="text-sm text-muted-foreground">{address}</p>
        </section>
      )}

      {client.notes && (
        <section className="rounded-lg border p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            Notes
          </div>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{client.notes}</p>
        </section>
      )}

      <Button asChild variant="outline" size="sm">
        <Link to="/ops/workspace/direct/$clientId" params={{ clientId }}>
          Open client page
          <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function InfoRow({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string | null | undefined;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs w-20 shrink-0">{label}</span>
      <span className={cn("truncate text-sm", capitalize && "capitalize")}>{value || "—"}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Right pane: client identity header
// ─────────────────────────────────────────────────────────────

function avatarInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ClientPanelHeader({ stream, id }: { stream: UnifiedStream; id: string }) {
  const isCpa = stream === "cpa";

  // CPA path — use lightweight firm header query
  const { data: firm } = useQuery({ ...opsFirmHeaderQuery(id), enabled: isCpa });
  // B2C client path
  const { data: client } = useQuery({ ...directClientDetailQuery(id), enabled: !isCpa });

  if (isCpa) {
    if (!firm)
      return (
        <div className="shrink-0 px-4 py-3 border-b">
          <Skeleton className="h-12 w-full" />
        </div>
      );
    const initials = avatarInitials(firm.name ?? "F");
    return (
      <div className="shrink-0 px-4 py-3 border-b bg-background flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0 select-none">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{firm.name}</span>
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 h-4 border-blue-300 text-blue-700 dark:border-blue-600 dark:text-blue-400 shrink-0"
            >
              CPA
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">
            {firm.contact_email ?? "—"}
            {firm.us_timezone ? ` · ${firm.us_timezone}` : ""}
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs shrink-0">
          <Link to="/ops/firms/$firmId" params={{ firmId: id }}>
            Open full page <ExternalLink className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </div>
    );
  }

  if (!client)
    return (
      <div className="shrink-0 px-4 py-3 border-b">
        <Skeleton className="h-12 w-full" />
      </div>
    );
  const initials = avatarInitials(client.display_name);
  const isActive = client.status === "active";
  return (
    <div className="shrink-0 px-4 py-3 border-b bg-background flex items-center gap-3">
      <div className="h-10 w-10 rounded-full bg-rose-600 text-white flex items-center justify-center text-sm font-bold shrink-0 select-none">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm truncate">{client.display_name}</span>
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 h-4 border-rose-300 text-rose-700 dark:border-rose-600 dark:text-rose-400 shrink-0"
          >
            DIRECT
          </Badge>
          <Badge
            variant={isActive ? "default" : "secondary"}
            className={cn(
              "text-[10px] px-1.5 h-4 capitalize shrink-0",
              isActive && "bg-rose-600 hover:bg-rose-600",
            )}
          >
            {client.status}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">
          {client.email ?? "—"}
          {client.us_timezone ? ` · ${client.us_timezone}` : ""}
        </div>
      </div>
      <Button asChild variant="outline" size="sm" className="h-7 px-2 text-xs shrink-0">
        <Link to="/ops/workspace/direct/$clientId" params={{ clientId: id }}>
          Open full page <ExternalLink className="ml-1 h-3 w-3" />
        </Link>
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Right pane: tab shell
// ─────────────────────────────────────────────────────────────

function WorkspaceRightPane({
  selection,
  tab,
  onTabChange,
}: {
  selection: { stream: UnifiedStream; id: string } | null;
  tab: WorkspaceTab;
  onTabChange: (t: WorkspaceTab) => void;
}) {
  if (!selection) {
    return (
      <div className="h-full border rounded-lg bg-background grid place-items-center p-6">
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No client selected"
          description="Pick a firm or B2C client from the list."
        />
      </div>
    );
  }

  const { stream, id } = selection;
  const isCpa = stream === "cpa";
  const activeTab = !isCpa && tab === "clients" ? "info" : tab;

  return (
    <div className="h-full border rounded-lg bg-background flex flex-col overflow-hidden">
      <ClientPanelHeader stream={stream} id={id} />
      <Tabs
        value={activeTab}
        onValueChange={(v) => onTabChange(v as WorkspaceTab)}
        className="flex flex-col flex-1 min-h-0"
      >
        {/* Tab bar */}
        <div className="border-b shrink-0 px-1 pt-1 overflow-x-auto">
          <TabsList className="h-9 bg-transparent gap-0 p-0 w-max">
            <TabsTrigger
              value="info"
              className={`${coloredTabTrigger(0)} h-8 px-3 text-xs gap-1.5`}
            >
              <Info className="h-3.5 w-3.5" />
              Client Info
            </TabsTrigger>

            <TabsTrigger
              value="projects"
              className={`${coloredTabTrigger(1)} h-8 px-3 text-xs gap-1.5`}
            >
              <FolderKanban className="h-3.5 w-3.5" />
              {isCpa ? "Projects" : "Tasks"}
            </TabsTrigger>

            {isCpa && (
              <TabsTrigger
                value="clients"
                className={`${coloredTabTrigger(2)} h-8 px-3 text-xs gap-1.5`}
              >
                <Users className="h-3.5 w-3.5" />
                Clients
              </TabsTrigger>
            )}

            <TabsTrigger
              value="logs"
              className={`${coloredTabTrigger(3)} h-8 px-3 text-xs gap-1.5`}
            >
              <Timer className="h-3.5 w-3.5" />
              Working Logs
            </TabsTrigger>

            <TabsTrigger
              value="sops"
              className={`${coloredTabTrigger(4)} h-8 px-3 text-xs gap-1.5`}
            >
              <FileText className="h-3.5 w-3.5" />
              SOP & Notes
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab content — overflow-hidden so each panel owns its scroll */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <TabsContent value="info" className="m-0 h-full overflow-y-auto">
            {isCpa ? <FirmInfoPanel firmId={id} /> : <DirectClientInfoPanel clientId={id} />}
          </TabsContent>

          <TabsContent value="projects" className="m-0 h-full overflow-hidden">
            {isCpa ? (
              <FirmProjectsPanel firmId={id} />
            ) : (
              <div className="h-full overflow-y-auto">
                <DirectTasksPanel clientId={id} />
              </div>
            )}
          </TabsContent>

          {isCpa && (
            <TabsContent value="clients" className="m-0 h-full overflow-y-auto">
              <ClientsPanel firmId={id} />
            </TabsContent>
          )}

          <TabsContent value="logs" className="m-0 h-full overflow-hidden">
            <LogsPanel stream={stream} id={id} />
          </TabsContent>

          <TabsContent value="sops" className="m-0 h-full overflow-hidden">
            <SopsTab stream={stream} id={id} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Root export
// ─────────────────────────────────────────────────────────────

export function OpsWorkspaceSplit() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/ops/workspace/" });
  const { stream: streamFilter, q: urlQ, selected: selectedFromUrl, tab } = search;

  const setSearch = (
    patch: Partial<{
      stream: StreamFilter;
      q: string;
      selected: string | undefined;
      tab: WorkspaceTab;
    }>,
  ) =>
    navigate({
      to: "/ops/workspace/",
      search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }),
      replace: true,
    });

  const [localSearch, setLocalSearch] = useDebouncedSearch(urlQ, (v) => setSearch({ q: v }));

  const { data: clients = [], isLoading } = useQuery(unifiedClientsListQuery());

  const selectedKey =
    selectedFromUrl ??
    (typeof window !== "undefined" ? window.localStorage.getItem(SELECTED_LS_KEY) : null);

  // Auto-select first item when selection becomes invalid
  useEffect(() => {
    if (clients.length === 0) return;
    const parsed = parseSelection(selectedKey);
    if (parsed && clients.some((r) => r.id === parsed.id && r.stream === parsed.stream)) return;
    const first = clients[0];
    setSearch({ selected: `${first.stream}:${first.id}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, selectedKey]);

  useEffect(() => {
    try {
      if (selectedKey) localStorage.setItem(SELECTED_LS_KEY, selectedKey);
    } catch {
      /* ignore */
    }
  }, [selectedKey]);

  const selection = parseSelection(selectedKey);

  const left = (
    <WorkspaceLeftPane
      clients={clients}
      isLoading={isLoading}
      streamFilter={streamFilter as StreamFilter}
      onStreamChange={(s) => setSearch({ stream: s })}
      localSearch={localSearch}
      onSearchChange={setLocalSearch}
      selectedKey={selectedKey}
      onSelect={(c) => setSearch({ selected: `${c.stream}:${c.id}` })}
    />
  );

  const right = (
    <WorkspaceRightPane
      selection={selection}
      tab={(tab ?? "projects") as WorkspaceTab}
      onTabChange={(t) => setSearch({ tab: t })}
    />
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      <ResizableTwoPane
        storageKey="ops-workspace-split"
        defaultLeft={28}
        minLeft={18}
        maxLeft={55}
        hideToolbar
        left={left}
        right={right}
      />
    </div>
  );
}
