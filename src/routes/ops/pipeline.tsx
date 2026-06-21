import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  pipelineTasksQuery,
  pipelineProfilesQuery,
  pipelineEntitiesQuery,
} from "@/lib/queries/ops.queries";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday as dfnsIsToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  Kanban,
  Calendar as CalendarIcon,
  ExternalLink,
  Plus,
  Filter,
  Search,
  X,
  List,
  Users,
  LayoutGrid,
  GripVertical,
  ArrowUpDown,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  Save,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/shared/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { safeHref } from "@/lib/routing/safe-href";
import { toneChip, asToneColor } from "@/lib/ui/tone";
import { profileLabel as resolveProfileLabel } from "@/lib/shared/profile-name";
import { useSavedViews } from "@/lib/shared/use-saved-views";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { TaskTimerControl } from "@/components/ops/timer-widget";
import { TaskEditButton } from "@/components/ops/task-edit-sheet";
import { DateTime } from "@/components/shared/date-time";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CaptchaAlertAction,
  CaptchaAlertDescription,
  CaptchaBlock,
  useCaptchaGate,
} from "@/components/auth/captcha-confirm";
import {
  TASK_PRIORITY_OPTIONS,
  SOFTWARE_OPTIONS,
  TEMPLATE_OPTIONS,
  PROJECT_TYPE_OPTIONS,
  type TaskPriority,
  type SoftwareType,
  type TemplateType,
  type ProjectType,
  labelFor,
} from "@/lib/shared/domain";
import { PriorityIcon, PriorityBadge } from "@/lib/ui/task-option-icons";

export const Route = createFileRoute("/ops/pipeline")({
  component: PipelinePage,
  errorComponent: RouteErrorComponent,
});

type PipelineStage = {
  id: string;
  key: string;
  label: string;
  tone: string;
  isTerminal: boolean;
};
// A "stage" is identified by its project_pipeline_stages.id (uuid). `key` is the
// human/enum-ish label kept only to keep the legacy `pipeline_stage` enum column
// in sync where the key happens to be a valid enum value.
type StageKey = string;

// The 6 legacy enum values of tasks.pipeline_stage. When a relational stage's
// `key` matches one of these we also update the enum column so older surfaces
// (reports, task detail) that still read it stay consistent.
const ENUM_STAGE_KEYS = new Set<string>([
  "handover_received",
  "in_prep",
  "internal_qc",
  "waiting_cpa",
  "ready_for_delivery",
  "final_signoff",
]);

// Stages come exclusively from project_pipeline_stages — no hardcoded defaults.

// Filter snapshot persisted into saved Views via `useSavedViews`.
type FilterSnapshot = {
  search: string;
  firmFilter: string;
  projectFilter: string;
  assigneeFilter: string;
  priorityFilter: string;
  stageFilter: string;
  sortBy: SortKey;
};

const PRESET_KEY = "pipeline-filter-presets";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  pipeline_stage: string;
  pipeline_stage_id: string | null;
  priority: TaskPriority;
  due_date: string | null;
  sharepoint_url: string | null;
  assignee_id: string | null;
  reviewer_id: string | null;
  task_type_id: string | null;
  created_at?: string;
  client_entities: {
    id: string;
    name: string;
    project_id: string;
    projects: {
      id: string;
      slug: string | null;
      name: string;
      firm_id: string;
      project_type?: ProjectType;
      firms: { id: string; name: string } | null;
    } | null;
  } | null;
  direct_client_task_types?: { id: string; label: string } | null;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type SortKey = "newest" | "oldest" | "due_asc" | "due_desc" | "priority" | "title";

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function PipelinePage() {
  const qc = useQueryClient();
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [view, setView] = useState<"kanban" | "list" | "calendar" | "assignee">("kanban");
  const [search, setSearch] = useState("");
  const [firmFilter, setFirmFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState<string>("");
  const [bulkDueDate, setBulkDueDate] = useState<string>("");
  const [bulkDueConfirm, setBulkDueConfirm] = useState<{ date: string; ids: string[] } | null>(
    null,
  );
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [deleteTask, setDeleteTask] = useState<TaskRow | null>(null);
  const deleteCaptcha = useCaptchaGate(deleteTask?.id);

  const [stepMode, setStepMode] = useState<"major" | "detailed">("detailed");

  const STAGE_WIDTH_KEY = "pipeline-kanban-stage-widths-v1";
  const [stageWidths, setStageWidths] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STAGE_WIDTH_KEY) ?? "{}");
    } catch {
      return {};
    }
  });
  const setStageWidth = (key: string, w: number | null) => {
    setStageWidths((cur) => {
      const next = { ...cur };
      if (w === null) delete next[key];
      else next[key] = Math.max(160, Math.round(w));
      try {
        localStorage.setItem(STAGE_WIDTH_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Saved filter presets (localStorage)
  // Saved filter views (shared util — see src/lib/shared/use-saved-views.ts).
  const savedViews = useSavedViews<FilterSnapshot>(PRESET_KEY);
  const [savePresetName, setSavePresetName] = useState("");

  const saveCurrentPreset = () => {
    const id = savedViews.save(savePresetName, {
      search,
      firmFilter,
      projectFilter,
      assigneeFilter,
      priorityFilter,
      stageFilter,
      sortBy,
    });
    if (id) {
      toast.success(`View "${savePresetName.trim()}" saved`);
      setSavePresetName("");
    }
  };

  const applyPreset = (snap: FilterSnapshot) => {
    setSearch(snap.search);
    setFirmFilter(snap.firmFilter);
    setProjectFilter(snap.projectFilter);
    setAssigneeFilter(snap.assigneeFilter);
    setPriorityFilter(snap.priorityFilter);
    setStageFilter(snap.stageFilter);
    setSortBy(snap.sortBy);
  };

  const { data: projectStagesRaw } = useQuery({
    queryKey: ["project-pipeline-stages", projectFilter],
    enabled: projectFilter !== "all",
    queryFn: async () => {
      const { data } = await supabase
        .from("project_pipeline_stages")
        .select("id, key, label, color, sort_order, is_terminal")
        .eq("project_id", projectFilter)
        .order("sort_order");
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Stages come only from the selected project — empty when no project is chosen.
  const activeStages = useMemo<PipelineStage[]>(() => {
    if (projectFilter === "all" || !projectStagesRaw?.length) return [];
    return projectStagesRaw.map((s) => ({
      id: s.id,
      key: s.key,
      label: s.label,
      tone: toneChip(asToneColor(s.color as string | null)),
      isTerminal: !!s.is_terminal,
    }));
  }, [projectFilter, projectStagesRaw]);

  // Keep bulkStage in sync with available stages (bulkStage holds a stage id)
  useEffect(() => {
    if (activeStages.length > 0 && !activeStages.find((s) => s.id === bulkStage)) {
      setBulkStage(activeStages[0].id);
    }
  }, [activeStages]);

  const toggleSelected = (id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const { data: tasksRaw, isLoading } = useQuery(pipelineTasksQuery());
  const tasks = tasksRaw as unknown as TaskRow[] | undefined;

  const { data: profilesRaw } = useQuery(pipelineProfilesQuery());
  const profiles = profilesRaw as unknown as Profile[] | undefined;

  const { data: taskTypes } = useQuery({
    queryKey: ["direct-client-task-types-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("direct_client_task_types")
        .select("id, label")
        .eq("active", true)
        .order("sort_order");
      return (data ?? []) as { id: string; label: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const patchTask = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<{
        title: string;
        description: string | null;
        assignee_id: string | null;
        reviewer_id: string | null;
        task_type_id: string | null;
        pipeline_stage_id: string | null;
        pipeline_stage: string;
      }>;
    }) => {
      const { error } = await supabase
        .from("tasks")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ["pipeline-tasks"] });
      const prev = qc.getQueryData<TaskRow[]>(["pipeline-tasks"]);
      qc.setQueryData<TaskRow[]>(["pipeline-tasks"], (cur) =>
        (cur ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["pipeline-tasks"], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline-tasks"] }),
  });

  const moveStage = useMutation({
    // `stage` is a project_pipeline_stages.id (uuid).
    mutationFn: async ({ id, stage }: { id: string; stage: StageKey }) => {
      const target = activeStages.find((s) => s.id === stage);
      const patch: Record<string, unknown> = { pipeline_stage_id: stage };
      // Keep the legacy enum column in sync only when the stage key is valid.
      if (target && ENUM_STAGE_KEYS.has(target.key)) patch.pipeline_stage = target.key;
      const { error } = await supabase
        .from("tasks")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: ["pipeline-tasks"] });
      const prev = qc.getQueryData<TaskRow[]>(["pipeline-tasks"]);
      qc.setQueryData<TaskRow[]>(["pipeline-tasks"], (cur) =>
        (cur ?? []).map((t) => (t.id === id ? { ...t, pipeline_stage_id: stage } : t)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["pipeline-tasks"], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeline-tasks"] }),
  });

  const bulkUpdate = useMutation({
    mutationFn: async ({
      ids,
      patch,
    }: {
      ids: string[];
      patch: Partial<{
        pipeline_stage: StageKey;
        pipeline_stage_id: string | null;
        assignee_id: string | null;
        priority: TaskPriority;
        due_date: string | null;
      }>;
      label?: string;
    }) => {
      if (ids.length === 0) return;
      const { error } = await supabase
        .from("tasks")
        .update(patch as never)
        .in("id", ids);
      if (error) throw error;
    },
    onMutate: async ({ ids, patch }) => {
      await qc.cancelQueries({ queryKey: ["pipeline-tasks"] });
      const prev = qc.getQueryData<TaskRow[]>(["pipeline-tasks"]);
      qc.setQueryData<TaskRow[]>(["pipeline-tasks"], (cur) =>
        (cur ?? []).map((t) => (ids.includes(t.id) ? { ...t, ...patch } : t)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["pipeline-tasks"], ctx.prev);
      toast.error(e.message);
    },
    onSuccess: (_d, vars) => {
      toast.success(
        `Updated ${vars.ids.length} task${vars.ids.length > 1 ? "s" : ""}${vars.label ? ` · ${vars.label}` : ""}`,
      );
      clearSelection();
      qc.invalidateQueries({ queryKey: ["pipeline-tasks"] });
    },
  });
  const bulkMove = {
    isPending: bulkUpdate.isPending,
    // `stage` is a project_pipeline_stages.id (uuid).
    mutate: ({ ids, stage }: { ids: string[]; stage: StageKey }) => {
      const target = activeStages.find((s) => s.id === stage);
      const patch: {
        pipeline_stage_id: string;
        pipeline_stage?: StageKey;
      } = { pipeline_stage_id: stage };
      if (target && ENUM_STAGE_KEYS.has(target.key)) patch.pipeline_stage = target.key;
      bulkUpdate.mutate({ ids, patch, label: "stage" });
    },
  };

  const updateTask = useMutation({
    mutationFn: async (input: {
      id: string;
      title: string;
      priority: TaskPriority;
      due_date: string | null;
      sharepoint_url: string | null;
    }) => {
      const { error } = await supabase
        .from("tasks")
        .update({
          title: input.title,
          priority: input.priority,
          due_date: input.due_date,
          sharepoint_url: input.sharepoint_url,
        } as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task updated");
      setEditTask(null);
      qc.invalidateQueries({ queryKey: ["pipeline-tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task deleted");
      setDeleteTask(null);
      qc.invalidateQueries({ queryKey: ["pipeline-tasks"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const firms = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks ?? []) {
      const f = t.client_entities?.projects?.firms;
      if (f) map.set(f.id, f.name);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [tasks]);

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks ?? []) {
      const p = t.client_entities?.projects;
      if (!p) continue;
      if (firmFilter !== "all" && p.firms?.id !== firmFilter) continue;
      map.set(p.id, p.name);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [tasks, firmFilter]);

  // When firm changes (or projects load), default to the first project of that firm.
  // Only stays "all" when no projects are available.
  useEffect(() => {
    if (firmFilter === "all") {
      setProjectFilter("all");
      return;
    }
    if (projects.length === 0) {
      setProjectFilter("all");
      return;
    }
    setProjectFilter((cur) => (projects.find((p) => p.id === cur) ? cur : projects[0].id));
  }, [firmFilter, projects]);

  // Kanban view requires a single firm — auto-correct when the user switches in with "all".
  useEffect(() => {
    if (view !== "kanban") return;
    if (firmFilter === "all" && firms.length > 0) setFirmFilter(firms[0].id);
  }, [view, firms, firmFilter]);

  const profileLabel = (id: string | null) =>
    id ? resolveProfileLabel(profiles, id, "Unknown") : "Unassigned";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (tasks ?? []).filter((t) => {
      if (
        q &&
        !t.title.toLowerCase().includes(q) &&
        !(t.client_entities?.name ?? "").toLowerCase().includes(q)
      )
        return false;
      if (firmFilter !== "all" && t.client_entities?.projects?.firms?.id !== firmFilter)
        return false;
      if (assigneeFilter !== "all") {
        if (
          assigneeFilter === "unassigned"
            ? t.assignee_id !== null
            : t.assignee_id !== assigneeFilter
        )
          return false;
      }
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (stageFilter !== "all" && t.pipeline_stage_id !== stageFilter) return false;
      if (projectFilter !== "all" && t.client_entities?.projects?.id !== projectFilter)
        return false;
      return true;
    });
    const FAR = 8640000000000000;
    const dueVal = (d: string | null) => (d ? new Date(d).getTime() : FAR);
    const created = (t: TaskRow) => (t.created_at ? new Date(t.created_at).getTime() : 0);
    const sorted = [...list];
    switch (sortBy) {
      case "newest":
        sorted.sort((a, b) => created(b) - created(a));
        break;
      case "oldest":
        sorted.sort((a, b) => created(a) - created(b));
        break;
      case "due_asc":
        sorted.sort((a, b) => dueVal(a.due_date) - dueVal(b.due_date));
        break;
      case "due_desc":
        sorted.sort((a, b) => dueVal(b.due_date) - dueVal(a.due_date));
        break;
      case "priority":
        sorted.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9));
        break;
      case "title":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }
    return sorted;
  }, [
    tasks,
    search,
    firmFilter,
    assigneeFilter,
    priorityFilter,
    stageFilter,
    projectFilter,
    sortBy,
  ]);

  const visibleIdsKey = useMemo(
    () =>
      filtered
        .map((t) => t.id)
        .sort()
        .join(","),
    [filtered],
  );

  const { data: stepsByTask } = useQuery({
    queryKey: ["pipeline-task-substeps", visibleIdsKey],
    enabled: stepMode === "major" && visibleIdsKey.length > 0,
    queryFn: async () => {
      const ids = visibleIdsKey.split(",").filter(Boolean);
      if (ids.length === 0)
        return {} as Record<string, { id: string; title: string; is_done: boolean }[]>;
      const { data } = await supabase
        .from("task_subtasks")
        .select("id, task_id, title, is_done, sort_order")
        .is("archived_at", null)
        .in("task_id", ids)
        .order("sort_order");
      const m: Record<string, { id: string; title: string; is_done: boolean }[]> = {};
      for (const s of data ?? []) {
        (m[s.task_id] ??= []).push({ id: s.id, title: s.title, is_done: s.is_done });
      }
      return m;
    },
    staleTime: 60_000,
  });

  const clearFilters = () => {
    setSearch("");
    setFirmFilter("all");
    setAssigneeFilter("all");
    setPriorityFilter("all");
    setStageFilter("all");
    setProjectFilter("all");
  };
  const hasFilter =
    search ||
    firmFilter !== "all" ||
    assigneeFilter !== "all" ||
    priorityFilter !== "all" ||
    stageFilter !== "all" ||
    projectFilter !== "all";

  return (
    <AuthGuard allow={["admin", "employee"]}>
      <AppShell crumbs={[{ label: "Pipeline" }]} fullBleed>
        <div className="flex h-full min-h-0 flex-col">
          {/* ── Docked underline tabs (full-bleed) + actions ── */}
          <Tabs
            value={view}
            onValueChange={(v) => setView(v as typeof view)}
            className="flex flex-1 min-h-0 flex-col"
          >
            <div className="shrink-0 flex items-center gap-2 border-b bg-background px-4">
              <TabsList className="h-10 bg-transparent gap-1 p-0 rounded-none">
                <TabsTrigger
                  value="kanban"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none h-10 px-3 text-sm"
                >
                  <LayoutGrid className="h-3.5 w-3.5 mr-1" />
                  Kanban
                </TabsTrigger>
                <TabsTrigger
                  value="list"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none h-10 px-3 text-sm"
                >
                  <List className="h-3.5 w-3.5 mr-1" />
                  List
                </TabsTrigger>
                <TabsTrigger
                  value="assignee"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none h-10 px-3 text-sm"
                >
                  <Users className="h-3.5 w-3.5 mr-1" />
                  Assignee
                </TabsTrigger>
                <TabsTrigger
                  value="calendar"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none h-10 px-3 text-sm"
                >
                  <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                  Calendar
                </TabsTrigger>
              </TabsList>
              <div className="ml-auto flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                      <Bookmark className="h-3.5 w-3.5" />
                      {savedViews.views.length > 0
                        ? `Views (${savedViews.views.length})`
                        : "Save View"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground">
                        Save current filters
                      </Label>
                      <div className="flex gap-1.5">
                        <Input
                          value={savePresetName}
                          onChange={(e) => setSavePresetName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveCurrentPreset()}
                          placeholder="View name…"
                          className="h-8 flex-1 text-xs"
                        />
                        <Button
                          size="sm"
                          className="h-8 px-2"
                          onClick={saveCurrentPreset}
                          disabled={!savePresetName.trim()}
                        >
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {savedViews.views.length > 0 && (
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">Saved views</Label>
                        {savedViews.views.map((v) => (
                          <div key={v.id} className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => applyPreset(v.snapshot)}
                              className="flex-1 truncate rounded px-2 py-1 text-left text-xs hover:bg-accent"
                            >
                              {v.name}
                            </button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 shrink-0"
                              onClick={() => savedViews.remove(v.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="h-8 text-xs">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      New Task
                    </Button>
                  </DialogTrigger>
                  <NewTaskDialog
                    onCreated={() => {
                      setCreateOpen(false);
                      qc.invalidateQueries({ queryKey: ["pipeline-tasks"] });
                    }}
                  />
                </Dialog>
              </div>
            </div>

            {/* Unified filter bar — same under all tabs */}
            <div className="shrink-0 flex flex-wrap items-center gap-2 border-b bg-card/50 px-4 py-2">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="h-8 w-[180px] pl-7 text-xs"
                />
              </div>
              <Select value={firmFilter} onValueChange={setFirmFilter}>
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue placeholder="Firm" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All firms</SelectItem>
                  {firms.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {firmFilter !== "all" && (
                <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue placeholder="Select project…" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.length === 0 ? (
                      <SelectItem value="all" disabled>
                        No projects
                      </SelectItem>
                    ) : (
                      projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
              <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All assignees</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {(profiles ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="h-8 w-[120px] text-xs" aria-label="Filter by priority">
                  {priorityFilter === "all" ? (
                    <span className="text-muted-foreground">Priority</span>
                  ) : (
                    <PriorityIcon value={priorityFilter} />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any priority</SelectItem>
                  {TASK_PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex items-center gap-1.5">
                        <PriorityIcon value={o.value} />
                        {o.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeStages.length > 0 && (
                <Select value={stageFilter} onValueChange={setStageFilter}>
                  <SelectTrigger className="h-8 w-[160px] text-xs">
                    <SelectValue placeholder="Stage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any stage</SelectItem>
                    {activeStages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select
                value={stepMode}
                onValueChange={(v) => setStepMode(v as "major" | "detailed")}
              >
                <SelectTrigger className="h-8 w-[140px] text-xs" aria-label="Step display mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="major">Major Step</SelectItem>
                  <SelectItem value="detailed">Detailed Step</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                <SelectTrigger className="h-8 w-[155px] text-xs">
                  <ArrowUpDown className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="due_asc">Due · soonest</SelectItem>
                  <SelectItem value="due_desc">Due · latest</SelectItem>
                  <SelectItem value="priority">Priority · highest</SelectItem>
                  <SelectItem value="title">Title · A→Z</SelectItem>
                </SelectContent>
              </Select>
              {hasFilter && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs">
                  <X className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              )}
              <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <Filter className="h-3 w-3" />
                {filtered.length} of {tasks?.length ?? 0}
              </div>
            </div>

            {/* Bulk action bar */}
            {selected.size > 0 && (
              <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-primary/30 bg-primary/5 px-4 py-2">
                <CheckSquare className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{selected.size} selected</span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {activeStages.length > 0 && (
                    <>
                      <Label className="text-xs text-muted-foreground">Stage</Label>
                      <Select value={bulkStage} onValueChange={(v) => setBulkStage(v)}>
                        <SelectTrigger className="h-8 w-[160px] text-xs">
                          <SelectValue placeholder="Pick stage" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeStages.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={bulkUpdate.isPending || !bulkStage}
                        onClick={() =>
                          bulkMove.mutate({ ids: Array.from(selected), stage: bulkStage })
                        }
                      >
                        Apply
                      </Button>
                    </>
                  )}
                  <span className="mx-1 h-5 w-px bg-border" />
                  <Label className="text-xs text-muted-foreground">Assignee</Label>
                  <Select
                    onValueChange={(v) =>
                      bulkUpdate.mutate({
                        ids: Array.from(selected),
                        patch: { assignee_id: v === "__unassigned__" ? null : v },
                        label: "assignee",
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[160px] text-xs">
                      <SelectValue placeholder="Set assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unassigned__">Unassigned</SelectItem>
                      {(profiles ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name || p.email || p.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label className="text-xs text-muted-foreground">Priority</Label>
                  <Select
                    onValueChange={(v) =>
                      bulkUpdate.mutate({
                        ids: Array.from(selected),
                        patch: { priority: v as TaskPriority },
                        label: "priority",
                      })
                    }
                  >
                    <SelectTrigger className="h-8 w-[130px] text-xs">
                      <SelectValue placeholder="Set priority" />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITY_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          <span className="flex items-center gap-1.5">
                            <PriorityIcon value={p.value} />
                            {p.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label className="text-xs text-muted-foreground">Due</Label>
                  <Input
                    type="date"
                    value={bulkDueDate}
                    className="h-8 w-[140px] font-mono text-xs tabular-nums"
                    onChange={(e) => setBulkDueDate(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!bulkDueDate || bulkUpdate.isPending}
                    onClick={() => {
                      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bulkDueDate);
                      if (!m) {
                        toast.error("Invalid date");
                        return;
                      }
                      setBulkDueConfirm({ date: bulkDueDate, ids: Array.from(selected) });
                    }}
                  >
                    Set due…
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
              </div>
            )}

            {/* ── Tab content area ── */}
            <TabsContent
              value="kanban"
              className="mt-0 flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden"
            >
              {isLoading ? (
                <div className="flex h-full gap-3 overflow-x-auto p-3">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-full w-48 shrink-0 rounded-xl" />
                  ))}
                </div>
              ) : activeStages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    icon={<Kanban className="h-10 w-10" />}
                    title="Select a project"
                    description="Choose a firm and project in the filters above to load its pipeline stages."
                  />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    icon={<Kanban className="h-10 w-10" />}
                    title="No tasks match"
                    description={
                      hasFilter
                        ? "Try clearing the filters."
                        : "Tasks created on entities show up here."
                    }
                  />
                </div>
              ) : (
                <KanbanView
                  tasks={filtered}
                  stages={activeStages}
                  onMove={(id, stage) => moveStage.mutate({ id, stage })}
                  profileLabel={profileLabel}
                  selected={selected}
                  onToggle={toggleSelected}
                  onEdit={setEditTask}
                  onDelete={(task) => {
                    setDeleteTask(task);
                    deleteCaptcha.reset();
                  }}
                  isAdmin={isAdmin}
                  stepMode={stepMode}
                  stepsByTask={stepsByTask ?? {}}
                  columnWidths={stageWidths}
                  onColumnWidth={setStageWidth}
                />
              )}
            </TabsContent>

            <TabsContent
              value="list"
              className="mt-0 flex-1 min-h-0 overflow-y-auto data-[state=inactive]:hidden p-3"
            >
              <ListView
                tasks={filtered}
                stages={activeStages}
                profiles={profiles ?? []}
                taskTypes={taskTypes ?? []}
                selected={selected}
                onToggle={toggleSelected}
                onPatch={(id, patch) => {
                  const fullPatch: Record<string, unknown> = { ...patch };
                  if (patch.pipeline_stage_id) {
                    const target = activeStages.find((s) => s.id === patch.pipeline_stage_id);
                    if (target && ENUM_STAGE_KEYS.has(target.key))
                      fullPatch.pipeline_stage = target.key;
                  }
                  patchTask.mutate({ id, patch: fullPatch as never });
                }}
              />
            </TabsContent>

            <TabsContent
              value="assignee"
              className="mt-0 flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden p-3"
            >
              <AssigneeView
                tasks={filtered}
                profiles={profiles ?? []}
                stages={activeStages}
                onMove={(id, stage) => moveStage.mutate({ id, stage })}
                profileLabel={profileLabel}
                selected={selected}
                onToggle={toggleSelected}
                onEdit={setEditTask}
                onDelete={(task) => {
                  setDeleteTask(task);
                  deleteCaptcha.reset();
                }}
                isAdmin={isAdmin}
                stepMode={stepMode}
                stepsByTask={stepsByTask ?? {}}
                columnWidths={stageWidths}
                onColumnWidth={setStageWidth}
              />
            </TabsContent>

            <TabsContent
              value="calendar"
              className="mt-0 flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden"
            >
              <CalendarView tasks={filtered} stages={activeStages} profileLabel={profileLabel} />
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Dialogs ── */}
        <AlertDialog open={!!bulkDueConfirm} onOpenChange={(o) => !o && setBulkDueConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Update due date?</AlertDialogTitle>
              <AlertDialogDescription>
                Set due date to{" "}
                <span className="font-mono tabular-nums font-medium text-foreground">
                  {bulkDueConfirm
                    ? new Date(bulkDueConfirm.date + "T00:00:00").toLocaleDateString(undefined, {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : ""}
                </span>{" "}
                for{" "}
                <span className="font-medium text-foreground">
                  {bulkDueConfirm?.ids.length ?? 0}
                </span>{" "}
                task(s).
                {bulkDueConfirm && new Date(bulkDueConfirm.date + "T23:59:59") < new Date() && (
                  <div className="mt-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-amber-700 dark:text-amber-300 text-xs">
                    Heads up: this date is in the past.
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (!bulkDueConfirm) return;
                  bulkUpdate.mutate({
                    ids: bulkDueConfirm.ids,
                    patch: { due_date: bulkDueConfirm.date },
                    label: "due date",
                  });
                  setBulkDueConfirm(null);
                  setBulkDueDate("");
                }}
              >
                Apply
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <EditTaskDialog
          task={editTask}
          onClose={() => setEditTask(null)}
          onSave={(p) => updateTask.mutate(p)}
          saving={updateTask.isPending}
        />

        <AlertDialog
          open={!!deleteTask}
          onOpenChange={(o) => {
            if (!o) {
              setDeleteTask(null);
              deleteCaptcha.reset();
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this task?</AlertDialogTitle>
              <CaptchaAlertDescription
                captchaKey={deleteCaptcha.nonce}
                onValidChange={deleteCaptcha.setValid}
              >
                "{deleteTask?.title}" will be permanently removed along with its messages, time
                logs, and history. This cannot be undone.
              </CaptchaAlertDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <CaptchaAlertAction
                valid={deleteCaptcha.valid}
                pending={removeTask.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onConfirm={() => deleteTask && removeTask.mutate(deleteTask.id)}
              >
                {removeTask.isPending ? "Deleting…" : "Delete"}
              </CaptchaAlertAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </AppShell>
    </AuthGuard>
  );
}

function EditTaskDialog({
  task,
  onClose,
  onSave,
  saving,
}: {
  task: TaskRow | null;
  onClose: () => void;
  onSave: (p: {
    id: string;
    title: string;
    priority: TaskPriority;
    due_date: string | null;
    sharepoint_url: string | null;
  }) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [sharepointUrl, setSharepointUrl] = useState("");
  const editCaptcha = useCaptchaGate(task?.id);
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setPriority(task.priority);
      setDueDate(task.due_date ?? "");
      setSharepointUrl(task.sharepoint_url ?? "");
      editCaptcha.reset();
    }
  }, [task?.id]);
  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        {task && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                  <SelectTrigger
                    className="w-20 justify-center"
                    aria-label={`Priority: ${priority}`}
                  >
                    <PriorityIcon value={priority} />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="flex items-center gap-1.5">
                          <PriorityIcon value={o.value} />
                          {o.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>SharePoint URL</Label>
              <Input
                type="url"
                value={sharepointUrl}
                onChange={(e) => setSharepointUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <CaptchaBlock
              captchaKey={editCaptcha.nonce}
              onValidChange={editCaptcha.setValid}
              label="Solve this captcha before saving task edits."
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!task || !title.trim() || saving || !editCaptcha.valid}
            onClick={() =>
              task &&
              onSave({
                id: task.id,
                title: title.trim(),
                priority,
                due_date: dueDate || null,
                sharepoint_url: sharepointUrl.trim() || null,
              })
            }
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Kanban view with HTML5 drag-and-drop ---------- */

const DEFAULT_STAGE_WIDTH = 230;

function useColumnResize(onColumnWidth: (key: string, w: number | null) => void) {
  return (key: string, startW: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const onMove = (ev: MouseEvent) =>
      onColumnWidth(key, Math.max(160, startW + (ev.clientX - startX)));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
}

function KanbanView({
  tasks,
  stages,
  onMove,
  profileLabel,
  selected,
  onToggle,
  onEdit,
  onDelete,
  isAdmin,
  stepMode,
  stepsByTask,
  columnWidths,
  onColumnWidth,
}: {
  tasks: TaskRow[];
  stages: PipelineStage[];
  onMove: (id: string, stage: StageKey) => void;
  profileLabel: (id: string | null) => string;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (t: TaskRow) => void;
  onDelete: (t: TaskRow) => void;
  isAdmin: boolean;
  stepMode: "major" | "detailed";
  stepsByTask: Record<string, { id: string; title: string; is_done: boolean }[]>;
  columnWidths: Record<string, number>;
  onColumnWidth: (key: string, w: number | null) => void;
}) {
  const [overStage, setOverStage] = useState<StageKey | null>(null);
  const [collapsed, setCollapsed] = useState<Set<StageKey>>(new Set());
  const startResize = useColumnResize(onColumnWidth);

  const toggleCollapsed = (key: StageKey) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const grouped = useMemo(() => {
    const m: Record<string, TaskRow[]> = {};
    for (const s of stages) m[s.id] = [];
    for (const t of tasks) {
      const k = t.pipeline_stage_id ?? stages[0]?.id ?? "";
      if (m[k] !== undefined) m[k].push(t);
      else if (stages[0]) m[stages[0].id].push(t);
    }
    return m;
  }, [tasks, stages]);

  return (
    <div className="flex h-full gap-2 overflow-x-auto overflow-y-hidden p-3">
      {stages.map((stage) => {
        const isCollapsed = collapsed.has(stage.id);
        const stageTasks = grouped[stage.id] ?? [];
        const isOver = overStage === stage.id;
        const width = columnWidths[stage.id] ?? DEFAULT_STAGE_WIDTH;
        return (
          <div
            key={stage.id}
            style={isCollapsed ? undefined : { width, minWidth: width }}
            className={cn(
              "relative flex shrink-0 flex-col rounded-xl border transition-colors duration-200",
              isCollapsed ? "w-10" : "",
              isOver ? "border-primary/50 bg-primary/5" : "bg-card/60",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOverStage(stage.id);
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              setOverStage(stage.id);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setOverStage((s) => (s === stage.id ? null : s));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const raw =
                e.dataTransfer.getData("text/task-id") || e.dataTransfer.getData("text/plain");
              const from = e.dataTransfer.getData("text/from-stage") as StageKey | "";
              setOverStage(null);
              const uuidMatch =
                raw && raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
              const id = uuidMatch ? uuidMatch[0] : "";
              if (id && from !== stage.id) onMove(id, stage.id);
            }}
          >
            {/* Column header */}
            {isCollapsed ? (
              <div className="flex flex-col items-center gap-2 border-b px-1.5 py-3">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(stage.id)}
                  className="rounded p-0.5 hover:bg-accent/50"
                  aria-label={`Expand ${stage.label}`}
                >
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <span
                  className={cn("px-0.5 text-[11px] font-semibold", stage.tone)}
                  style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
                  title={stage.label}
                >
                  {stage.label}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {stageTasks.length}
                </span>
              </div>
            ) : (
              <div className="flex shrink-0 items-center justify-between gap-1 border-b px-2 py-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Badge
                    variant="secondary"
                    className={cn("max-w-[140px] truncate text-[11px]", stage.tone)}
                  >
                    {stage.label}
                  </Badge>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {stageTasks.length}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0"
                        aria-label="Column options"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onColumnWidth(stage.id, null)}>
                        Reset width
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    type="button"
                    onClick={() => toggleCollapsed(stage.id)}
                    className="shrink-0 rounded p-0.5 hover:bg-accent/50"
                    aria-label={`Collapse ${stage.label}`}
                  >
                    <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            )}

            {/* Task list */}
            {!isCollapsed && (
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-2 p-2">
                  {stageTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      stages={stages}
                      fromStage={stage.id}
                      onMove={onMove}
                      profileLabel={profileLabel}
                      selected={selected.has(t.id)}
                      onToggle={() => onToggle(t.id)}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      isAdmin={isAdmin}
                      stepMode={stepMode}
                      steps={stepsByTask[t.id]}
                    />
                  ))}
                  {stageTasks.length === 0 && (
                    <div className="rounded-md border border-dashed py-8 text-center text-[11px] text-muted-foreground">
                      Drop here
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
            {!isCollapsed && (
              <span
                role="separator"
                aria-label={`Resize ${stage.label}`}
                onMouseDown={startResize(stage.id, width)}
                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({
  task,
  fromStage,
  profileLabel,
  selected,
  onToggle,
  onEdit,
  onDelete,
  isAdmin,
  stepMode,
  steps,
}: {
  task: TaskRow;
  stages: PipelineStage[];
  fromStage: StageKey;
  onMove: (id: string, stage: StageKey) => void;
  profileLabel: (id: string | null) => string;
  selected: boolean;
  onToggle: () => void;
  onEdit: (t: TaskRow) => void;
  onDelete: (t: TaskRow) => void;
  isAdmin: boolean;
  stepMode: "major" | "detailed";
  steps?: { id: string; title: string; is_done: boolean }[];
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <Card
      className={`border-border-subtle ${selected ? "ring-2 ring-primary" : ""} ${dragging ? "opacity-60" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.setData("text/from-stage", fromStage);
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-1.5">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5"
            aria-label="Select task"
          />
          <div
            role="presentation"
            aria-label="Drag handle"
            title="Drag the card to move between stages"
            className="shrink-0 cursor-grab active:cursor-grabbing rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <GripVertical className="h-4 w-4" />
          </div>
          <div className="block min-w-0 flex-1">
            <Link
              to="/ops/tasks/$taskId"
              params={{ taskId: task.id }}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className="text-sm font-medium leading-tight line-clamp-3 hover:text-primary"
            >
              {task.title}
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <PriorityBadge value={task.priority} />
          {task.due_date && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <CalendarIcon className="h-2.5 w-2.5" />
              <DateTime value={task.due_date + "T00:00:00"} mode="date" className="text-[10px]" />
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            {profileLabel(task.assignee_id)}
          </Badge>
          {safeHref(task.sharepoint_url) && (
            <a
              href={safeHref(task.sharepoint_url)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex"
            >
              <Badge variant="outline" className="text-[10px] gap-1">
                <ExternalLink className="h-2.5 w-2.5" />
                SP
              </Badge>
            </a>
          )}
        </div>
        {stepMode === "major" && steps && steps.length > 0 && (
          <ul className="mt-1 space-y-0.5 rounded-md border border-border-subtle bg-muted/30 p-1.5">
            {steps.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "flex items-start gap-1 text-[11px] leading-tight",
                  s.is_done && "text-muted-foreground line-through",
                )}
              >
                <CheckSquare
                  className={cn(
                    "mt-0.5 h-3 w-3 shrink-0",
                    s.is_done ? "text-emerald-600" : "text-muted-foreground/60",
                  )}
                />
                <span className="break-words">{s.title}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-end gap-1">
          <TaskTimerControl taskId={task.id} compact />
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------- List view ---------- */

type ListColKey =
  | "select"
  | "title"
  | "stage"
  | "description"
  | "assignee"
  | "reviewer"
  | "task_type";

const LIST_COL_DEFAULTS: Record<ListColKey, number> = {
  select: 36,
  title: 260,
  stage: 170,
  description: 320,
  assignee: 170,
  reviewer: 170,
  task_type: 170,
};

const LIST_COL_STORAGE_KEY = "pipeline-list-col-widths-v1";

function loadColWidths(): Record<ListColKey, number> {
  try {
    const raw = localStorage.getItem(LIST_COL_STORAGE_KEY);
    if (!raw) return { ...LIST_COL_DEFAULTS };
    return { ...LIST_COL_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...LIST_COL_DEFAULTS };
  }
}

function InlineText({
  value,
  onCommit,
  placeholder,
  multiline,
}: {
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next !== (value ?? "").trim()) onCommit(next);
  };
  const common = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: commit,
    onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
    placeholder,
    className:
      "w-full resize-none bg-transparent text-xs leading-relaxed outline-none focus:ring-1 focus:ring-primary/40 rounded px-1 py-1 whitespace-pre-wrap break-words",
  };
  if (multiline) {
    return (
      <textarea
        {...common}
        rows={Math.min(6, Math.max(2, draft.split("\n").length))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />
    );
  }
  return (
    <textarea
      {...common}
      rows={Math.min(4, Math.max(1, draft.split("\n").length))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
    />
  );
}

function ListView({
  tasks,
  stages,
  profiles,
  taskTypes,
  selected,
  onToggle,
  onPatch,
}: {
  tasks: TaskRow[];
  stages: PipelineStage[];
  profiles: Profile[];
  taskTypes: { id: string; label: string }[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onPatch: (
    id: string,
    patch: Partial<{
      title: string;
      description: string | null;
      assignee_id: string | null;
      reviewer_id: string | null;
      task_type_id: string | null;
      pipeline_stage_id: string | null;
    }>,
  ) => void;
}) {
  const navigate = useNavigate();
  const [widths, setWidths] = useState<Record<ListColKey, number>>(() => loadColWidths());

  const setColWidth = (key: ListColKey, w: number) => {
    setWidths((cur) => {
      const next = { ...cur, [key]: Math.max(60, Math.round(w)) };
      try {
        localStorage.setItem(LIST_COL_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const startResize = (key: ListColKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key];
    const onMove = (ev: MouseEvent) => setColWidth(key, startW + (ev.clientX - startX));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (tasks.length === 0)
    return (
      <EmptyState
        icon={<List className="h-10 w-10" />}
        title="No tasks match"
        description="Try clearing the filters."
      />
    );
  const allSelected = tasks.length > 0 && tasks.every((t) => selected.has(t.id));
  const toggleAll = () => {
    if (allSelected) tasks.forEach((t) => selected.has(t.id) && onToggle(t.id));
    else tasks.forEach((t) => !selected.has(t.id) && onToggle(t.id));
  };

  const headerCell = (key: ListColKey, label: React.ReactNode, className?: string) => (
    <TableHead
      className={cn("relative select-none", className)}
      style={{ width: widths[key], minWidth: widths[key] }}
    >
      {label}
      <span
        role="separator"
        aria-label="Resize column"
        onMouseDown={(e) => startResize(key, e)}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40"
      />
    </TableHead>
  );

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              {headerCell(
                "select",
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />,
              )}
              {headerCell("title", "Task Name")}
              {headerCell("stage", "Stage")}
              {headerCell("description", "Task Description")}
              {headerCell("assignee", "Assignee")}
              {headerCell("reviewer", "Reviewer")}
              {headerCell("task_type", "Task Type")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((t) => (
              <TableRow
                key={t.id}
                data-state={selected.has(t.id) ? "selected" : undefined}
                onDoubleClick={() =>
                  navigate({ to: "/ops/tasks/$taskId", params: { taskId: t.id } })
                }
                className="cursor-pointer"
                title="Double-click to open task"
              >
                <TableCell
                  className="align-top"
                  style={{ width: widths.select, minWidth: widths.select }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={selected.has(t.id)}
                    onCheckedChange={() => onToggle(t.id)}
                    aria-label="Select task"
                  />
                </TableCell>
                <TableCell
                  className="align-top whitespace-normal break-words"
                  style={{ width: widths.title, minWidth: widths.title }}
                >
                  <InlineText
                    value={t.title ?? ""}
                    onCommit={(next) => next && onPatch(t.id, { title: next })}
                    placeholder="Untitled task"
                  />
                </TableCell>
                <TableCell
                  className="align-top"
                  style={{ width: widths.stage, minWidth: widths.stage }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <Select
                    value={t.pipeline_stage_id ?? ""}
                    onValueChange={(v) => onPatch(t.id, { pipeline_stage_id: v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          No stages
                        </SelectItem>
                      ) : (
                        stages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.label}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell
                  className="align-top whitespace-normal break-words"
                  style={{ width: widths.description, minWidth: widths.description }}
                >
                  <InlineText
                    value={t.description ?? ""}
                    multiline
                    onCommit={(next) => onPatch(t.id, { description: next.length ? next : null })}
                    placeholder="Add description…"
                  />
                </TableCell>
                <TableCell
                  className="align-top"
                  style={{ width: widths.assignee, minWidth: widths.assignee }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <Select
                    value={t.assignee_id ?? "__unassigned__"}
                    onValueChange={(v) =>
                      onPatch(t.id, { assignee_id: v === "__unassigned__" ? null : v })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unassigned__">Unassigned</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="inline-flex items-center gap-2">
                            <UserAvatar
                              profile={{
                                id: p.id,
                                full_name: p.full_name,
                                email: p.email,
                                avatar_url: p.avatar_url,
                              }}
                              size="xs"
                            />
                            <span className="truncate">
                              {p.full_name || p.email || p.id.slice(0, 8)}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell
                  className="align-top"
                  style={{ width: widths.reviewer, minWidth: widths.reviewer }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <Select
                    value={t.reviewer_id ?? "__none__"}
                    onValueChange={(v) =>
                      onPatch(t.id, { reviewer_id: v === "__none__" ? null : v })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No reviewer</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="inline-flex items-center gap-2">
                            <UserAvatar
                              profile={{
                                id: p.id,
                                full_name: p.full_name,
                                email: p.email,
                                avatar_url: p.avatar_url,
                              }}
                              size="xs"
                            />
                            <span className="truncate">
                              {p.full_name || p.email || p.id.slice(0, 8)}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell
                  className="align-top"
                  style={{ width: widths.task_type, minWidth: widths.task_type }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <Select
                    value={t.task_type_id ?? "__none__"}
                    onValueChange={(v) =>
                      onPatch(t.id, { task_type_id: v === "__none__" ? null : v })
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {taskTypes.map((tt) => (
                        <SelectItem key={tt.id} value={tt.id}>
                          {tt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ---------- Assignee view ---------- */

function AssigneeView({
  tasks,
  profiles,
  stages,
  onMove,
  profileLabel,
  selected,
  onToggle,
  onEdit,
  onDelete,
  isAdmin,
  stepMode,
  stepsByTask,
  columnWidths,
  onColumnWidth,
}: {
  tasks: TaskRow[];
  profiles: Profile[];
  stages: PipelineStage[];
  onMove: (id: string, stage: StageKey) => void;
  profileLabel: (id: string | null) => string;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onEdit: (t: TaskRow) => void;
  onDelete: (t: TaskRow) => void;
  isAdmin: boolean;
  stepMode: "major" | "detailed";
  stepsByTask: Record<string, { id: string; title: string; is_done: boolean }[]>;
  columnWidths: Record<string, number>;
  onColumnWidth: (key: string, w: number | null) => void;
}) {
  const startResize = useColumnResize(onColumnWidth);
  const groups = useMemo(() => {
    const m = new Map<string, TaskRow[]>();
    for (const t of tasks) {
      const k = t.assignee_id ?? "unassigned";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return Array.from(m, ([k, v]) => ({
      key: k,
      label: k === "unassigned" ? "Unassigned" : profileLabel(k),
      tasks: v,
    })).sort((a, b) => a.label.localeCompare(b.label));
  }, [tasks, profiles]);

  if (groups.length === 0)
    return (
      <EmptyState
        icon={<Users className="h-10 w-10" />}
        title="No tasks match"
        description="Try clearing the filters."
      />
    );
  return (
    <div className="flex h-full gap-2 overflow-x-auto overflow-y-hidden p-1">
      {groups.map((g) => {
        const colKey = `assignee:${g.key}`;
        const width = columnWidths[colKey] ?? DEFAULT_STAGE_WIDTH;
        return (
          <div
            key={g.key}
            style={{ width, minWidth: width }}
            className="relative flex shrink-0 flex-col rounded-xl border bg-card/60"
          >
            <div className="flex shrink-0 items-center justify-between gap-1 border-b bg-background/60 px-2 py-2 sticky top-0 rounded-t-xl">
              <div className="flex min-w-0 items-center gap-1.5">
                <Badge variant="secondary" className="truncate max-w-[160px] text-[11px]">
                  {g.label}
                </Badge>
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {g.tasks.length}
                </span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    aria-label="Column options"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onColumnWidth(colKey, null)}>
                    Reset width
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="space-y-2 p-2">
                {g.tasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    stages={stages}
                    fromStage={t.pipeline_stage_id ?? ""}
                    onMove={onMove}
                    profileLabel={profileLabel}
                    selected={selected.has(t.id)}
                    onToggle={() => onToggle(t.id)}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    isAdmin={isAdmin}
                    stepMode={stepMode}
                    steps={stepsByTask[t.id]}
                  />
                ))}
                {g.tasks.length === 0 && (
                  <div className="rounded-md border border-dashed py-8 text-center text-[11px] text-muted-foreground">
                    No tasks
                  </div>
                )}
              </div>
            </ScrollArea>
            <span
              role="separator"
              aria-label={`Resize ${g.label}`}
              onMouseDown={startResize(colKey, width)}
              className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40"
            />
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Calendar view ---------- */

function CalendarView({
  tasks,
  stages,
  profileLabel,
}: {
  tasks: TaskRow[];
  stages: PipelineStage[];
  profileLabel: (id: string | null) => string;
}) {
  const today = new Date();
  const [month, setMonth] = useState<Date>(() => startOfMonth(today));
  const [selected, setSelected] = useState<Date>(today);

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  // A task is "ended" when it sits in a terminal stage. Prefer stages flagged
  // is_terminal; fall back to the last stage in the ordered list.
  const terminalStageIds = useMemo(() => {
    const flagged = stages.filter((s) => s.isTerminal).map((s) => s.id);
    if (flagged.length > 0) return new Set(flagged);
    const last = stages[stages.length - 1];
    return new Set(last ? [last.id] : []);
  }, [stages]);
  const isEnded = (t: TaskRow) =>
    !!t.pipeline_stage_id && terminalStageIds.has(t.pipeline_stage_id);

  // Per-day dot counts for the mini calendar grid
  const byDay = useMemo(() => {
    const m = new Map<string, { active: number; ended: number }>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const cur = m.get(t.due_date) ?? { active: 0, ended: 0 };
      if (isEnded(t)) cur.ended++;
      else cur.active++;
      m.set(t.due_date, cur);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, terminalStageIds]);

  // Categorise ALL filtered tasks relative to the selected date
  const { running, dueOrOverdue, ended } = useMemo(() => {
    const running: TaskRow[] = [];
    const dueOrOverdue: TaskRow[] = [];
    const ended: TaskRow[] = [];
    for (const t of tasks) {
      if (isEnded(t)) {
        ended.push(t);
      } else if (!t.due_date || new Date(t.due_date + "T00:00:00") > selected) {
        running.push(t);
      } else {
        dueOrOverdue.push(t);
      }
    }
    return { running, dueOrOverdue, ended };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, selected, terminalStageIds]);

  return (
    <div className="flex gap-4 items-start">
      {/* ── Left: mini calendar ── */}
      <div className="shrink-0 w-72 rounded-lg border bg-background">
        {/* Month header */}
        <div className="flex items-center gap-1 border-b p-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="flex-1 text-center text-sm font-semibold">{format(month, "MMMM yyyy")}</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setMonth(startOfMonth(today));
              setSelected(today);
            }}
          >
            Today
          </Button>
        </div>

        {/* Weekday labels */}
        <div className="grid grid-cols-7 border-b text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 auto-rows-[clamp(38px,5vh,48px)]">
          {days.map((d) => {
            const k = format(d, "yyyy-MM-dd");
            const info = byDay.get(k);
            const inMonth = isSameMonth(d, month);
            const isTd = dfnsIsToday(d);
            const isSel = isSameDay(d, selected);
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSelected(d)}
                className={cn(
                  "group relative flex flex-col items-center gap-0.5 border-b border-r px-0.5 pt-0.5 pb-1 text-xs transition-colors",
                  !inMonth && "bg-muted/30 text-muted-foreground/50",
                  inMonth && !isSel && "hover:bg-accent/40",
                  isSel && "bg-primary/10 ring-2 ring-inset ring-primary",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                    isTd && "bg-primary text-primary-foreground",
                    !isTd && isSel && "text-primary",
                  )}
                >
                  {format(d, "d")}
                </span>
                {info && (
                  <div className="flex flex-wrap items-center justify-center gap-0.5">
                    {info.active > 0 && (
                      <span className="rounded bg-violet-100 px-1 text-[9px] font-semibold tabular-nums text-violet-700">
                        {info.active}
                      </span>
                    )}
                    {info.ended > 0 && (
                      <span className="rounded bg-emerald-100 px-1 text-[9px] font-semibold tabular-nums text-emerald-700">
                        {info.ended}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-3 border-t px-2 py-1.5 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-violet-100" />
            Active
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-100" />
            Ended
          </span>
        </div>
      </div>

      {/* ── Right: task categories ── */}
      <div className="flex-1 min-w-0 rounded-lg border bg-background overflow-hidden">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {format(selected, "EEEE")}
            </p>
            <h2 className="text-base font-semibold leading-tight">
              {format(selected, "MMMM d, yyyy")}
            </h2>
          </div>
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        </header>
        <ScrollArea className="h-[calc(100vh-18rem)]">
          <div className="space-y-5 p-4">
            <PipelineCalendarSection
              title="Running"
              dotClass="bg-blue-500"
              countClass="bg-blue-100 text-blue-700"
              tasks={running}
              profileLabel={profileLabel}
              empty="No tasks are running ahead of this date."
            />
            <PipelineCalendarSection
              title="Due / Overdue"
              dotClass="bg-rose-500"
              countClass="bg-rose-100 text-rose-700"
              tasks={dueOrOverdue}
              profileLabel={profileLabel}
              empty="No tasks are due or overdue on this date."
            />
            <PipelineCalendarSection
              title="Ended"
              dotClass="bg-emerald-500"
              countClass="bg-emerald-100 text-emerald-700"
              tasks={ended}
              profileLabel={profileLabel}
              empty="No completed tasks."
            />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function PipelineCalendarSection({
  title,
  dotClass,
  countClass,
  tasks,
  profileLabel,
  empty,
}: {
  title: string;
  dotClass: string;
  countClass: string;
  tasks: TaskRow[];
  profileLabel: (id: string | null) => string;
  empty: string;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full shrink-0", dotClass)} />
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex-1">
          {title}
        </h3>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", countClass)}>
          {tasks.length}
        </span>
      </div>
      {tasks.length === 0 ? (
        <p className="px-1 py-1 text-[11px] italic text-muted-foreground/60">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {tasks.map((t) => (
            <Link
              key={t.id}
              to="/ops/tasks/$taskId"
              params={{ taskId: t.id }}
              className="flex items-start gap-2 rounded-md border bg-card px-3 py-2 hover:bg-accent"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{t.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                  {t.client_entities?.projects?.firms?.name && (
                    <span>{t.client_entities.projects.firms.name}</span>
                  )}
                  {t.client_entities?.name && (
                    <>
                      <span>·</span>
                      <span>{t.client_entities.name}</span>
                    </>
                  )}
                  {t.due_date && (
                    <>
                      <span>·</span>
                      <span>Due {t.due_date}</span>
                    </>
                  )}
                  <span>·</span>
                  <span>{profileLabel(t.assignee_id)}</span>
                </div>
              </div>
              <PriorityBadge value={t.priority} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------- Quick New-Task dialog ---------- */

function NewTaskDialog({ onCreated }: { onCreated: () => void }) {
  const [entityId, setEntityId] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [dueDate, setDueDate] = useState("");
  const [software, setSoftware] = useState<SoftwareType | "">("");
  const [stage, setStage] = useState<StageKey>("");
  const [sharepointUrl, setSharepointUrl] = useState("");
  const [formTemplate, setFormTemplate] = useState<TemplateType>("none");

  const { data: entities } = useQuery(pipelineEntitiesQuery());

  // Derive selected entity's project_id
  const entityProjectId = useMemo(() => {
    const found = (entities ?? []).find((e) => e.id === entityId);
    return found?.projects?.id ?? "";
  }, [entityId, entities]);

  // Fetch pipeline stages for that project
  const { data: entityStagesRaw = [] } = useQuery({
    queryKey: ["project-pipeline-stages", entityProjectId],
    enabled: !!entityProjectId,
    queryFn: async () => {
      const { data } = await supabase
        .from("project_pipeline_stages")
        .select("id, key, label, color, sort_order")
        .eq("project_id", entityProjectId)
        .order("sort_order");
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Auto-select first stage when stages load or entity changes (stage = id)
  useEffect(() => {
    if (entityStagesRaw.length > 0) {
      setStage(entityStagesRaw[0].id);
    } else {
      setStage("");
    }
  }, [entityProjectId, entityStagesRaw]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!entityId || !title.trim()) throw new Error("Pick an entity and enter a title");
      const { data: parent, error } = await supabase
        .from("tasks")
        .insert({
          entity_id: entityId,
          title: title.trim(),
          description: desc.trim() || null,
          priority,
          due_date: dueDate || null,
          software: software || null,
          sharepoint_url: sharepointUrl.trim() || null,
          // `stage` is a project_pipeline_stages.id. Set the relational link and,
          // when the stage key is a valid enum value, keep the legacy enum column
          // in sync (otherwise it falls back to its DB default 'handover_received').
          pipeline_stage_id: stage || null,
          ...(() => {
            const key = entityStagesRaw.find((s) => s.id === stage)?.key;
            return key && ENUM_STAGE_KEYS.has(key) ? { pipeline_stage: key } : {};
          })(),
          status: "draft",
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      if (formTemplate !== "none" && parent) {
        const { data: items } = await supabase
          .from("template_checklist_items")
          .select("title, description, sort_order")
          .eq("template", formTemplate)
          .order("sort_order");
        if (items && items.length > 0) {
          const formLabel =
            TEMPLATE_OPTIONS.find((o) => o.value === formTemplate)?.label ?? formTemplate;
          const rows = items.map((it) => ({
            entity_id: entityId,
            title: it.title,
            description: it.description
              ? `${it.description}\n\n[Auto-injected: ${formLabel} for "${title.trim()}"]`
              : `[Auto-injected: ${formLabel}]`,
            status: "draft" as const,
            priority,
            due_date: dueDate || null,
            software: software || null,
          }));
          await supabase.from("tasks").insert(rows as never);
        }
      }
    },
    onSuccess: () => {
      toast.success("Task created");
      onCreated();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>New task</DialogTitle>
      </DialogHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          createMut.mutate();
        }}
        className="space-y-3"
      >
        <div className="space-y-2">
          <Label>Entity *</Label>
          <Select value={entityId} onValueChange={setEntityId}>
            <SelectTrigger>
              <SelectValue placeholder="Pick an entity" />
            </SelectTrigger>
            <SelectContent>
              {(entities ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.projects?.firms?.name ? `${e.projects.firms.name} · ` : ""}
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Title *</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Pipeline stage</Label>
            <Select
              value={stage}
              onValueChange={(v) => setStage(v as StageKey)}
              disabled={entityStagesRaw.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !entityId
                      ? "Pick an entity first"
                      : entityStagesRaw.length === 0
                        ? "No stages defined"
                        : "Select stage"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {entityStagesRaw.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger className="w-20 justify-center" aria-label={`Priority: ${priority}`}>
                <PriorityIcon value={priority} />
              </SelectTrigger>
              <SelectContent>
                {TASK_PRIORITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="flex items-center gap-1.5">
                      <PriorityIcon value={o.value} />
                      {o.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Due date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Software</Label>
            <Select
              value={software || "none"}
              onValueChange={(v) => setSoftware(v === "none" ? "" : (v as SoftwareType))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {SOFTWARE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Form Type (auto-injects checklist)</Label>
          <Select value={formTemplate} onValueChange={(v) => setFormTemplate(v as TemplateType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>SharePoint URL</Label>
          <Input
            type="url"
            value={sharepointUrl}
            onChange={(e) => setSharepointUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={createMut.isPending || !entityId || !title.trim()}>
            {createMut.isPending ? "Creating…" : "Create task"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
