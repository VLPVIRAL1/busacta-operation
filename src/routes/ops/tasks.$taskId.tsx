import { createFileRoute, Link, Navigate, notFound, useSearch } from "@tanstack/react-router";
import { useState, useRef, useMemo, useEffect } from "react";
import { TaskViewShortcutsDialog } from "@/components/ops/task-view/shortcuts-dialog";
import {
  RotateCcw,
  Keyboard,
  CalendarRange,
  GitBranch,
  CalendarClock,
  FileText,
  ListChecks,
  PanelLeftClose,
  PanelRightClose,
} from "lucide-react";
import { InlineDatePopover } from "@/components/shared/inline-date-popover";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { Users, UserCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Pencil,
  Trash2,
  Loader2,
  MoreHorizontal,
  MessageSquare,
  X,
  AlignLeft,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichEditor, RichViewer } from "@/components/shared/rich-editor";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { safeHref } from "@/lib/routing/safe-href";
import { TaskTimerControl } from "@/components/ops/timer-widget";
import { TaskWatchToggle } from "@/components/ops/task-watch-toggle";
import { TaskDraftEmailButton } from "@/components/ops/task-draft-email-button";
import { SubtaskList } from "@/components/ops/subtask-list";
import { MentionTextarea, renderMentioned } from "@/components/ops/mention-textarea";
import { TaskLinksPanel } from "@/components/ops/task-links-panel";
import { TaskTimeSheetPanel } from "@/components/ops/task-time-sheet-panel";
import { TaskActivityFeed } from "@/components/ops/task-activity-feed";
import { TaskNotesPanel } from "@/components/ops/task-notes-panel";
import { TaskActionItemsPanel } from "@/components/ops/task-action-items-panel";
import { TaskAuditTimeline } from "@/components/ops/task-audit-timeline";
import { DocumentManager } from "@/components/ops/document-manager";
import { SharePointDocumentsPanel } from "@/components/sharepoint/sharepoint-documents-panel";
import { ThreadChat } from "@/components/ops/communication/thread-chat";
import { UserAvatar } from "@/components/shared/user-avatar";
// TaskEditButton removed — title and year are now inline-editable in the ribbon.
import { DateTime } from "@/components/shared/date-time";
import { Pin, PinOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  TASK_STATUS_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  SOFTWARE_OPTIONS,
  TEMPLATE_OPTIONS,
  labelFor,
  formatEntityDisplayName,
  isHiddenDefaultEntity,
  type TaskStatus,
  type TaskPriority,
  type TemplateType,
} from "@/lib/shared/domain";
import { projectLevelsQuery } from "@/lib/queries/ops.queries";
import {
  ProjectLevelPicker,
  AvatarPickerPopover,
  InlineYearEditor,
  TaskClientPicker,
} from "@/components/ops/task-meta/task-field-controls";
import { cn } from "@/lib/shared/utils";

import { RouteErrorComponent } from "@/components/shared/route-error";

// Canonical task detail route. The `$taskId` param accepts BOTH a UUID and a
// readable slug — the resolver below detects format and queries accordingly.
// UUIDs received here are 301'd to the slug-form URL so the address bar stays
// stable; readable slugs render the task view in-place.
export const Route = createFileRoute("/ops/tasks/$taskId")({
  component: TaskRouteResolver,
  errorComponent: RouteErrorComponent,
  // Optional deep-link target tab (e.g. File Gallery "Go to Task" → Files tab).
  validateSearch: (search: Record<string, unknown>): { tab?: "task" | "time" | "files" } => {
    const tab = search.tab;
    return tab === "task" || tab === "time" || tab === "files" ? { tab } : {};
  },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function TaskRouteResolver() {
  const { taskId } = Route.useParams();
  const { tab } = Route.useSearch();
  const isUuid = UUID_RE.test(taskId);
  const { data, isLoading } = useQuery({
    queryKey: ["task-route-resolve", taskId],
    queryFn: async () => {
      const col = isUuid ? "id" : "slug";
      const { data } = await supabase
        .from("tasks")
        .select("id, slug, client_entities(project_id, projects(id, firm_id))")
        .eq(col, taskId)
        .maybeSingle();
      return data as typeof data & {
        client_entities?: {
          project_id?: string | null;
          projects?: { id?: string | null; firm_id?: string | null } | null;
        } | null;
      };
    },
  });
  if (isLoading) {
    return (
      <div className="space-y-3 p-4 sm:p-6">
        <Skeleton className="h-8 w-1/2" />
      </div>
    );
  }
  if (!data) throw notFound();

  const firmId = data.client_entities?.projects?.firm_id;
  const projectId = data.client_entities?.projects?.id;
  const slug = data.slug;

  // Redirect to the hierarchical canonical URL when context is available.
  if (firmId && projectId && slug && slug !== taskId) {
    return (
      <Navigate
        to="/ops/tasks/$firmId/$projectId/$taskSlug"
        params={{ firmId, projectId, taskSlug: slug }}
        search={tab ? { tab } : {}}
        replace
      />
    );
  }
  // UUID or slug without firm/project context — render in-place.
  return <TaskDetailView taskId={data.id} />;
}

const EDIT_WINDOW_MINUTES = 30;

interface MessageRow {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  is_client_visible: boolean;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  is_pinned?: boolean | null;
}

// AttachmentRow type moved with FilesPanel to src/components/ops/files-panel.tsx

export function TaskDetailView({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const isInternal =
    role === "super_admin" || role === "admin" || role === "employee" || role === "hr_manager";

  const DISCUSSION_LS_KEY = "task-detail:discussion-open";
  const [discussionOpen, setDiscussionOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(DISCUSSION_LS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleDiscussion = (next?: boolean) => {
    setDiscussionOpen((prev) => {
      const v = typeof next === "boolean" ? next : !prev;
      try {
        window.localStorage.setItem(DISCUSSION_LS_KEY, v ? "1" : "0");
      } catch {
        /* ignore */
      }
      return v;
    });
  };

  const { data: task, isLoading: taskLoading } = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(
          "id, title, description, status, priority, complexity, difficulty_level_id, urgency_level_id, due_date, start_date, completed_at, period, software, tax_year, template, entity_id, client_id, assignee_id, reviewer_id, pipeline_stage, pipeline_stage_id, sharepoint_url, task_type_id, direct_client_task_types:task_type_id(id, label), client_entities(id, name, slug, project_id, projects(id, name, slug, firm_id, firms(id, name)))",
        )
        .eq("id", taskId)
        .single();
      if (error) throw error;
      return data as typeof data & {
        pipeline_stage?: string;
        sharepoint_url?: string | null;
        template?: TemplateType | null;
        tax_year?: number | null;
        completed_at?: string | null;
        assignee_id?: string | null;
        reviewer_id?: string | null;
      };
    },
  });

  const PIPELINE_STAGES = [
    { key: "handover_received", label: "Handover Received" },
    { key: "in_prep", label: "In-Prep" },
    { key: "internal_qc", label: "Internal QC" },
    { key: "waiting_cpa", label: "Waiting on B2B Firm" },
    { key: "ready_for_delivery", label: "Ready for Delivery" },
    { key: "final_signoff", label: "Final Sign-off" },
  ];

  const projectId = (task as any)?.client_entities?.project_id ?? null;
  const { data: projectStages = [] } = useQuery({
    queryKey: ["project-pipeline-stages", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_pipeline_stages")
        .select("id, key, label, sort_order")
        .eq("project_id", projectId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Project-level difficulty and urgency levels (replace hardcoded complexity/priority).
  const { data: difficultyLevels = [] } = useQuery({
    ...projectLevelsQuery(projectId, "difficulty"),
    enabled: !!projectId,
  });
  const { data: urgencyLevels = [] } = useQuery({
    ...projectLevelsQuery(projectId, "urgency"),
    enabled: !!projectId,
  });

  const updateTask = useMutation({
    mutationFn: async (
      patch: Partial<{
        status: TaskStatus;
        priority: TaskPriority;
        pipeline_stage: string;
        pipeline_stage_id: string | null;
        tax_year: number | null;
        template: TemplateType | null;
        client_id: string | null;
        difficulty_level_id: string | null;
        urgency_level_id: string | null;
      }>,
    ) => {
      const prevStatus = task?.status;
      const prevTemplate =
        (task as { template?: TemplateType | null } | undefined)?.template ?? null;
      // Guard: never send empty strings to enum columns.
      const safePatch = Object.fromEntries(
        Object.entries(patch as Record<string, unknown>).filter(([, v]) => v !== ""),
      );
      if (Object.keys(safePatch).length === 0) return;
      const { error } = await supabase
        .from("tasks")
        .update(safePatch as never)
        .eq("id", taskId);
      if (error) throw error;
      if (patch.status && patch.status !== prevStatus) {
        await supabase.from("task_audit").insert({
          task_id: taskId,
          actor_id: user?.id,
          event_type: "status_changed",
          payload: { from: prevStatus, to: patch.status },
        });
      }
      // Auto-create sub-tasks from the workflow template's checklist items.
      // De-duplicate by title against any subtasks already on this task.
      if (patch.template !== undefined && patch.template && patch.template !== prevTemplate) {
        const [{ data: items }, { data: existing }] = await Promise.all([
          supabase
            .from("template_checklist_items")
            .select("title, sort_order")
            .eq("template", patch.template)
            .order("sort_order"),
          supabase.from("task_subtasks").select("title").eq("task_id", taskId),
        ]);
        const existingTitles = new Set(
          (existing ?? []).map((s) => (s as { title: string }).title.trim().toLowerCase()),
        );
        const newItems = (items ?? []).filter(
          (it) => !existingTitles.has(it.title.trim().toLowerCase()),
        );
        if (newItems.length > 0) {
          const rows = newItems.map((it) => ({
            task_id: taskId,
            title: it.title,
            created_by: user?.id ?? null,
          }));
          const { error: subErr } = await supabase.from("task_subtasks").insert(rows as never);
          if (subErr) throw subErr;
          const formLabel =
            TEMPLATE_OPTIONS.find((o) => o.value === patch.template)?.label ?? patch.template;
          await supabase.from("task_audit").insert({
            task_id: taskId,
            actor_id: user?.id,
            event_type: "template_applied",
            payload: {
              template: patch.template,
              items_created: newItems.length,
              items_skipped: (items?.length ?? 0) - newItems.length,
              label: formLabel,
            },
          } as never);
          toast.success(
            `Added ${newItems.length} sub-task${newItems.length === 1 ? "" : "s"} from ${formLabel}`,
          );
        } else if ((items?.length ?? 0) > 0) {
          toast.message("All template sub-tasks already exist on this work item");
        }
      }
    },
    // Optimistic update: write the patch to the cache before the server replies.
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["task", taskId] });
      const previous = qc.getQueryData<Record<string, unknown>>(["task", taskId]);
      if (previous) {
        qc.setQueryData(["task", taskId], { ...previous, ...patch });
      }
      return { previous };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["task", taskId], ctx.previous);
      toast.error(e.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["task", taskId] });
      qc.invalidateQueries({ queryKey: ["task-audit", taskId] });
      qc.invalidateQueries({ queryKey: ["subtasks", taskId] });
    },
  });

  // Generic field updater for inline-edited meta fields (dates, period, etc.).
  // Optimistic + invalidate, no audit side effects (those live in updateTask).
  const updateField = useMutation({
    mutationFn: async (rawPatch: Record<string, unknown>) => {
      // Strip empty-string values — they would violate enum columns (task_status etc.)
      // if the caller accidentally passes "" instead of null.
      const patch = Object.fromEntries(Object.entries(rawPatch).filter(([, v]) => v !== ""));
      if (Object.keys(patch).length === 0) return;
      const { error } = await supabase
        .from("tasks")
        .update(patch as never)
        .eq("id", taskId);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["task", taskId] });
      const previous = qc.getQueryData<Record<string, unknown>>(["task", taskId]);
      if (previous) qc.setQueryData(["task", taskId], { ...previous, ...patch });
      return { previous };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(["task", taskId], ctx.previous);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["task", taskId] }),
  });

  const updateAssignment = useMutation({
    mutationFn: async (patch: { assignee_id?: string | null; reviewer_id?: string | null }) => {
      const { error } = await supabase
        .from("tasks")
        .update(patch as never)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["task", taskId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // Multi-assignees and multi-reviewers via task_assignees(role)
  const { data: assigneeRows } = useQuery({
    queryKey: ["task-assignees", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_assignees")
        .select("user_id, role")
        .eq("task_id", taskId);
      if (error) throw error;
      return (data ?? []) as { user_id: string; role: "assignee" | "reviewer" }[];
    },
  });
  const assigneeIds = useMemo(() => {
    const ids = new Set<string>(
      (assigneeRows ?? []).filter((r) => r.role === "assignee").map((r) => r.user_id),
    );
    if ((task as { assignee_id?: string | null } | undefined)?.assignee_id)
      ids.add((task as { assignee_id: string }).assignee_id);
    return Array.from(ids);
  }, [assigneeRows, task]);
  const reviewerIds = useMemo(() => {
    const ids = new Set<string>(
      (assigneeRows ?? []).filter((r) => r.role === "reviewer").map((r) => r.user_id),
    );
    if ((task as { reviewer_id?: string | null } | undefined)?.reviewer_id)
      ids.add((task as { reviewer_id: string }).reviewer_id);
    return Array.from(ids);
  }, [assigneeRows, task]);

  const setAssignees = useMutation({
    mutationFn: async ({ ids, role }: { ids: string[]; role: "assignee" | "reviewer" }) => {
      const { error: delErr } = await supabase
        .from("task_assignees")
        .delete()
        .eq("task_id", taskId)
        .eq("role", role);
      if (delErr) throw delErr;
      if (ids.length > 0) {
        const rows = ids.map((uid) => ({ task_id: taskId, user_id: uid, role }));
        const { error } = await supabase.from("task_assignees").insert(rows as never);
        if (error) throw error;
      }
      // Sync the singleton column to the first id for backward compat across views.
      const patch =
        role === "assignee" ? { assignee_id: ids[0] ?? null } : { reviewer_id: ids[0] ?? null };
      const { error: tErr } = await supabase
        .from("tasks")
        .update(patch as never)
        .eq("id", taskId);
      if (tErr) throw tErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-assignees", taskId] });
      qc.invalidateQueries({ queryKey: ["task", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  void updateAssignment;
  void setAssignees;

  // Header stats — subtask + clarification + action-item counts.
  const { data: subtaskStats } = useQuery({
    queryKey: ["subtask-stats", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_subtasks")
        .select("status")
        .eq("task_id", taskId);
      if (error) throw error;
      const rows = (data ?? []) as { status: string | null }[];
      return { total: rows.length, done: rows.filter((r) => r.status === "done").length };
    },
  });
  const { data: actionItemStats } = useQuery({
    queryKey: ["action-item-stats", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_action_items" as never)
        .select("kind, status, archived_at, deleted_at")
        .eq("task_id", taskId);
      if (error) throw error;
      const rows = (data ?? []) as unknown as {
        kind: string;
        status: string;
        archived_at: string | null;
        deleted_at: string | null;
      }[];
      const live = rows.filter((r) => !r.archived_at && !r.deleted_at);
      const isClarif = (k: string) => k === "clarification";
      const clar = live.filter((r) => isClarif(r.kind));
      const act = live.filter((r) => !isClarif(r.kind));
      const openCount = (xs: typeof live) => xs.filter((r) => r.status !== "done").length;
      return {
        clarOpen: openCount(clar),
        clarTotal: clar.length,
        actOpen: openCount(act),
        actTotal: act.length,
      };
    },
  });

  const entity = (
    task as
      | {
          client_entities?: {
            id: string;
            name: string;
            slug: string;
            project_id: string;
            projects?: {
              id: string;
              name: string;
              slug: string;
              firm_id: string;
              firms?: { id: string; name: string } | null;
            } | null;
          } | null;
        }
      | undefined
  )?.client_entities;
  const project = entity?.projects;
  const firm = project?.firms;

  // Controlled tabs so keyboard shortcuts (1 / 7) can cycle them.
  const tabKeys = useMemo<string[]>(() => ["task", "time", "files"], []);
  // Seed from a `?tab=` deep link (e.g. File Gallery "Go to Task" → Files tab).
  // `strict: false` lets this shared view read search from either task route.
  const search = useSearch({ strict: false }) as { tab?: string };
  const [activeTab, setActiveTab] = useState<string>(
    search.tab && ["task", "time", "files"].includes(search.tab) ? search.tab : "task",
  );
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const PANE_KEY = `task-workspace-discussion:${taskId}`;

  // Keyboard shortcuts — mirror Open Points / To-Do / Communication conventions.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      const typing =
        tag === "input" || tag === "textarea" || tag === "select" || t?.isContentEditable;
      if (typing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === "/") {
        e.preventDefault();
        const el = document.querySelector<HTMLElement>("[data-task-view-search], input, textarea");
        el?.focus();
      } else if (k === "r") {
        e.preventDefault();
        qc.invalidateQueries({ queryKey: ["task", taskId] });
        qc.invalidateQueries({ queryKey: ["subtasks", taskId] });
        qc.invalidateQueries({ queryKey: ["task-action-items", taskId] });
        qc.invalidateQueries({ queryKey: ["task-audit", taskId] });
        toast.message("Refreshed");
      } else if (k === "d") {
        e.preventDefault();
        toggleDiscussion();
      } else if (k === "1" || k === "7") {
        e.preventDefault();
        setActiveTab((cur) => {
          const i = tabKeys.indexOf(cur);
          const next =
            k === "7"
              ? tabKeys[(i + 1) % tabKeys.length]
              : tabKeys[(i - 1 + tabKeys.length) % tabKeys.length];
          return next;
        });
      } else if (k === "2" || k === "8") {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("wi-pane:nudge", {
            detail: { storageKey: PANE_KEY, delta: k === "8" ? 4 : -4 },
          }),
        );
      } else if (k === "0") {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("wi-pane:reset", { detail: { storageKey: PANE_KEY } }),
        );
      } else if (k === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qc, taskId, tabKeys, PANE_KEY]);

  return (
    <AuthGuard>
      <AppShell
        fullBleed
        crumbs={[
          { label: "Firms", to: "/ops/firms" },
          firm ? { label: firm.name, to: `/ops/firms/${firm.id}` } : { label: "…" },
          project ? { label: project.name, to: `/projects/${project.slug}` } : { label: "…" },
          ...(entity && !isHiddenDefaultEntity(entity.name)
            ? [
                {
                  label: formatEntityDisplayName(entity.name),
                  to: `/projects/${project?.slug}/${entity.slug}`,
                },
              ]
            : []),
          { label: task?.title ? `Work Item: ${task.title}` : "Work Item" },
        ]}
      >
        <TaskViewShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        {taskLoading || !task ? (
          <div className="space-y-3 p-4 sm:p-6">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {/* ====== Meta Header (shrink-0) — Slate / Indigo glass ====== */}
            <div className="shrink-0 border-b border-blue-500/10 bg-card/80 px-4 py-3 shadow-sm md:px-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {isInternal ? (
                    <InlineTitleEditor
                      value={task.title}
                      onSave={(v) => updateField.mutate({ title: v })}
                    />
                  ) : (
                    <h1 className="truncate text-lg font-semibold text-foreground">{task.title}</h1>
                  )}
                  <DescriptionBlock
                    value={task.description ?? ""}
                    editable={isInternal}
                    onSave={(v) => updateField.mutate({ description: v || null })}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isInternal ? (
                    <>
                      <TaskTimerControl taskId={taskId} />
                      <TaskWatchToggle taskId={taskId} />
                      <TaskDraftEmailButton taskId={taskId} />
                      {/* Difficulty — from project_difficulty_levels */}
                      <ProjectLevelPicker
                        label="Difficulty"
                        levels={difficultyLevels}
                        value={
                          (task as { difficulty_level_id?: string | null }).difficulty_level_id ??
                          null
                        }
                        onChange={(v) => updateTask.mutate({ difficulty_level_id: v })}
                      />
                      {/* Urgency — from project_urgency_levels */}
                      <ProjectLevelPicker
                        label="Urgency"
                        levels={urgencyLevels}
                        value={
                          (task as { urgency_level_id?: string | null }).urgency_level_id ?? null
                        }
                        onChange={(v) => updateTask.mutate({ urgency_level_id: v })}
                      />
                    </>
                  ) : (
                    <Badge
                      className={cn(
                        "capitalize",
                        TASK_STATUS_OPTIONS.find((s) => s.value === task.status)?.tone,
                      )}
                    >
                      {labelFor(TASK_STATUS_OPTIONS, task.status)}
                    </Badge>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={discussionOpen ? "default" : "outline"}
                    aria-pressed={discussionOpen}
                    aria-controls="task-discussion-panel"
                    onClick={() => toggleDiscussion()}
                    title={discussionOpen ? "Hide discussion" : "Show discussion"}
                    className="h-8 gap-1.5"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span className="text-xs">Discussion</span>
                  </Button>
                </div>
              </div>

              {/* Inline-editable meta row */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <InlineDatePopover
                  label="Start"
                  value={(task as { start_date?: string | null }).start_date}
                  onChange={(v) => updateField.mutate({ start_date: v })}
                  toneClass="border-teal-300/60 bg-teal-50/40 hover:bg-teal-50 dark:bg-teal-950/20"
                />
                <InlineDatePopover
                  label="Due"
                  value={task.due_date as string | null | undefined}
                  onChange={(v) => updateField.mutate({ due_date: v })}
                  toneClass="border-blue-300/60 bg-blue-50/40 hover:bg-blue-50 dark:bg-blue-950/20"
                />
                <InlineDatePopover
                  label="Completed"
                  value={task.completed_at as string | null | undefined}
                  onChange={(v) =>
                    updateField.mutate({ completed_at: v ? `${v}T00:00:00.000Z` : null })
                  }
                  toneClass="border-sky-300/60 bg-sky-50/40 hover:bg-sky-50 dark:bg-sky-950/20"
                />

                {/* Period */}
                <Select
                  value={(task as { period?: string | null }).period ?? "none"}
                  onValueChange={(v) => updateField.mutate({ period: v === "none" ? null : v })}
                >
                  <SelectTrigger className="relative h-7 w-36 pl-7 pr-7 text-xs">
                    <CalendarRange
                      className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
                      aria-hidden
                    />
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Period —</SelectItem>
                    <SelectItem value="Monthly">Monthly</SelectItem>
                    <SelectItem value="Quarterly">Quarterly</SelectItem>
                    <SelectItem value="Yearly">Yearly</SelectItem>
                    <SelectItem value="Ad-hoc">Ad-hoc</SelectItem>
                  </SelectContent>
                </Select>

                {/* Pipeline Stage */}
                {isInternal &&
                  (projectStages.length > 0 ? (
                    <Select
                      value={
                        (task as { pipeline_stage_id?: string | null }).pipeline_stage_id ??
                        undefined
                      }
                      onValueChange={(v) => {
                        const stage = (projectStages as any[]).find((s) => s.id === v);
                        const patch: any = { pipeline_stage_id: v };
                        const legacyKeys = [
                          "handover_received",
                          "in_prep",
                          "internal_qc",
                          "waiting_cpa",
                          "ready_for_delivery",
                          "final_signoff",
                        ];
                        if (stage && legacyKeys.includes(stage.key))
                          patch.pipeline_stage = stage.key;
                        updateTask.mutate(patch);
                      }}
                    >
                      <SelectTrigger className="relative h-7 w-52 pl-7 pr-7 text-xs">
                        <GitBranch
                          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
                          aria-hidden
                        />
                        <SelectValue placeholder="Pipeline stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {(projectStages as any[]).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={
                        (task as { pipeline_stage?: string }).pipeline_stage ?? "handover_received"
                      }
                      onValueChange={(v) => updateTask.mutate({ pipeline_stage: v })}
                    >
                      <SelectTrigger className="relative h-7 w-52 pl-7 pr-7 text-xs">
                        <GitBranch
                          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
                          aria-hidden
                        />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PIPELINE_STAGES.map((s) => (
                          <SelectItem key={s.key} value={s.key}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ))}

                {/* Client */}
                {isInternal && (
                  <TaskClientPicker
                    firmId={task.client_entities?.projects?.firm_id ?? null}
                    value={(task as { client_id?: string | null }).client_id ?? null}
                    onChange={(v) => updateTask.mutate({ client_id: v })}
                  />
                )}

                {/* Assignees */}
                <AvatarPickerPopover
                  icon={<Users className="h-3 w-3" />}
                  label="Assignees"
                  ids={assigneeIds}
                  disabled={!isInternal}
                  onChange={(ids) => setAssignees.mutate({ ids, role: "assignee" })}
                />

                {/* Reviewers */}
                <AvatarPickerPopover
                  icon={<UserCheck className="h-3 w-3" />}
                  label="Reviewers"
                  ids={reviewerIds}
                  disabled={!isInternal}
                  onChange={(ids) => setAssignees.mutate({ ids, role: "reviewer" })}
                />

                {/* Read-only chips */}
                {(task as { direct_client_task_types?: { label: string } | null })
                  .direct_client_task_types?.label && (
                  <Badge
                    variant="outline"
                    className="h-7 text-[11px] border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                  >
                    {
                      (
                        task as {
                          direct_client_task_types: { label: string };
                        }
                      ).direct_client_task_types.label
                    }
                  </Badge>
                )}
                {task.software && (
                  <Badge variant="outline" className="h-7 text-[11px]">
                    {labelFor(SOFTWARE_OPTIONS, task.software)}
                  </Badge>
                )}
                {isInternal ? (
                  <InlineYearEditor
                    value={(task as { tax_year?: number | null }).tax_year ?? null}
                    onSave={(v) => updateField.mutate({ tax_year: v })}
                  />
                ) : (
                  (task as { tax_year?: number | null }).tax_year && (
                    <Badge
                      variant="outline"
                      className="h-7 text-[11px] inline-flex items-center gap-1"
                    >
                      <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      TY {(task as { tax_year: number }).tax_year}
                    </Badge>
                  )
                )}
                {/* Stat badges */}
                {subtaskStats && subtaskStats.total > 0 && (
                  <Badge
                    variant="outline"
                    className="h-7 text-[11px] inline-flex items-center gap-1"
                    title={`Subtasks — ${subtaskStats.done} of ${subtaskStats.total} done`}
                  >
                    <ListChecks className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {subtaskStats.done}/{subtaskStats.total}
                  </Badge>
                )}
                {actionItemStats && actionItemStats.clarTotal > 0 && (
                  <Badge
                    variant="outline"
                    className="h-7 text-[11px] inline-flex items-center gap-1 border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                    title={`Clarifications — ${actionItemStats.clarOpen} open of ${actionItemStats.clarTotal}`}
                  >
                    CF {actionItemStats.clarOpen}/{actionItemStats.clarTotal}
                  </Badge>
                )}
                {actionItemStats && actionItemStats.actTotal > 0 && (
                  <Badge
                    variant="outline"
                    className="h-7 text-[11px] inline-flex items-center gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    title={`Action items — ${actionItemStats.actOpen} open of ${actionItemStats.actTotal}`}
                  >
                    AI {actionItemStats.actOpen}/{actionItemStats.actTotal}
                  </Badge>
                )}
                {(task as { template?: TemplateType | null }).template && !isInternal && (
                  <Badge
                    variant="outline"
                    className="h-7 text-[11px] inline-flex items-center gap-1"
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    {labelFor(TEMPLATE_OPTIONS, (task as { template: TemplateType }).template)}
                  </Badge>
                )}
                {safeHref((task as { sharepoint_url?: string | null }).sharepoint_url) && (
                  <a
                    href={safeHref((task as { sharepoint_url: string }).sharepoint_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex"
                  >
                    <Badge
                      variant="outline"
                      className="h-7 text-[11px] hover:bg-accent cursor-pointer"
                    >
                      SharePoint ↗
                    </Badge>
                  </a>
                )}
              </div>
            </div>

            {/* ====== Workspace (tabs own discussion layout per-tab) ====== */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-4 md:px-6 pt-3 pb-3">
              {(() => {
                // Per-tab pane storage key — toolbar Reset targets the active pane.
                const activePaneKey =
                  activeTab === "task"
                    ? discussionOpen
                      ? `wi-tab1-disc:${taskId}`
                      : `wi-tab1-nodisc:${taskId}`
                    : activeTab === "time"
                      ? discussionOpen
                        ? `wi-tab2-disc:${taskId}`
                        : `wi-tab3:${taskId}`
                      : null;

                const discussionAside = (
                  <aside id="task-discussion-panel" role="complementary" className="w-full h-full">
                    <Card className="bg-card/60 backdrop-blur border border-border/60 flex flex-col h-full">
                      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 shrink-0">
                        <h3 className="text-sm font-semibold flex items-center gap-1.5">
                          <MessageSquare className="h-4 w-4" /> Discussion
                        </h3>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => toggleDiscussion(false)}
                          title="Hide discussion"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        <ThreadChat scope="task" id={taskId} hideHeader />
                      </div>
                    </Card>
                  </aside>
                );

                const cardSubtasks = (
                  <Card className="bg-card/60 backdrop-blur border-border/60">
                    <CardContent className="p-3">
                      <SubtaskList taskId={taskId} />
                    </CardContent>
                  </Card>
                );
                const cardLinks = (
                  <Card className="bg-card/60 backdrop-blur border-border/60">
                    <CardContent className="p-3">
                      <h3 className="mb-2 text-sm font-semibold">Related Links</h3>
                      <TaskLinksPanel taskId={taskId} />
                    </CardContent>
                  </Card>
                );
                const cardActionItems = (
                  <Card className="bg-card/60 backdrop-blur border-border/60">
                    <CardContent className="p-3">
                      <TaskActionItemsPanel taskId={taskId} />
                    </CardContent>
                  </Card>
                );
                const cardNotes = (
                  <Card className="bg-card/60 backdrop-blur border-border/60">
                    <CardContent className="p-3">
                      <TaskNotesPanel taskId={taskId} />
                    </CardContent>
                  </Card>
                );

                return (
                  <Tabs
                    value={activeTab}
                    onValueChange={(v) => {
                      setActiveTab(v);
                      // Rule 5g: turning on the Files tab forces discussion closed.
                      if (v === "files" && discussionOpen) toggleDiscussion(false);
                    }}
                    className="w-full flex h-full flex-col min-h-0"
                  >
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <TabsList className="bg-transparent gap-1 p-0 h-auto">
                        <TabsTrigger
                          value="task"
                          className="text-xs border-t-2 border-transparent rounded-b-none data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none"
                        >
                          Task &amp; Activity
                        </TabsTrigger>
                        <TabsTrigger
                          value="time"
                          className="text-xs border-t-2 border-transparent rounded-b-none data-[state=active]:border-slate-500 data-[state=active]:bg-slate-500/10 data-[state=active]:text-slate-700 dark:data-[state=active]:text-slate-300 data-[state=active]:shadow-none"
                        >
                          Time Sheet &amp; Activity
                        </TabsTrigger>
                        <TabsTrigger
                          value="files"
                          className="text-xs border-t-2 border-transparent rounded-b-none data-[state=active]:border-violet-500 data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-700 dark:data-[state=active]:text-violet-300 data-[state=active]:shadow-none"
                        >
                          Files
                        </TabsTrigger>
                      </TabsList>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hidden lg:inline-flex"
                          disabled={!activePaneKey}
                          onClick={() => {
                            if (activePaneKey) {
                              window.dispatchEvent(
                                new CustomEvent("wi-pane:set", {
                                  detail: { storageKey: activePaneKey, value: 100 },
                                }),
                              );
                            }
                          }}
                          title="Focus left pane"
                          aria-label="Focus left pane"
                        >
                          <PanelRightClose className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hidden lg:inline-flex"
                          disabled={!activePaneKey}
                          onClick={() => {
                            if (activePaneKey) {
                              window.dispatchEvent(
                                new CustomEvent("wi-pane:set", {
                                  detail: { storageKey: activePaneKey, value: 0 },
                                }),
                              );
                            }
                          }}
                          title="Focus right pane"
                          aria-label="Focus right pane"
                        >
                          <PanelLeftClose className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground"
                          disabled={!activePaneKey}
                          onClick={() => {
                            if (activePaneKey) {
                              window.dispatchEvent(
                                new CustomEvent("wi-pane:reset", {
                                  detail: { storageKey: activePaneKey },
                                }),
                              );
                            }
                          }}
                          title="Reset pane width"
                          aria-label="Reset pane width"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={() => setShortcutsOpen(true)}
                          title="Keyboard shortcuts (?)"
                          aria-label="Keyboard shortcuts"
                        >
                          <Keyboard className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Tab 1 — Task & Activity */}
                    <TabsContent value="task" className="mt-3 flex-1 min-h-0 overflow-hidden">
                      {discussionOpen ? (
                        <ResizableTwoPane
                          hideToolbar
                          storageKey={`wi-tab1-disc:${taskId}`}
                          defaultLeft={70}
                          minLeft={50}
                          maxLeft={85}
                          left={
                            <div className="h-full overflow-y-auto min-h-0 pr-1">
                              <div className="space-y-3">
                                {cardSubtasks}
                                {cardActionItems}
                                {cardNotes}
                                {cardLinks}
                              </div>
                            </div>
                          }
                          right={discussionAside}
                        />
                      ) : (
                        <ResizableTwoPane
                          hideToolbar
                          storageKey={`wi-tab1-nodisc:${taskId}`}
                          defaultLeft={50}
                          minLeft={20}
                          maxLeft={80}
                          left={
                            <div className="h-full overflow-y-auto min-h-0 pr-1">
                              <div className="space-y-3">
                                {cardSubtasks}
                                {cardLinks}
                              </div>
                            </div>
                          }
                          right={
                            <div className="h-full overflow-y-auto min-h-0 pl-1">
                              <div className="space-y-3">
                                {cardActionItems}
                                {cardNotes}
                              </div>
                            </div>
                          }
                        />
                      )}
                    </TabsContent>

                    {/* Tab 3 — Files (full width, no discussion split) */}
                    <TabsContent
                      value="files"
                      className="mt-3 flex-1 min-h-0 w-full overflow-y-auto space-y-4"
                    >
                      <SharePointDocumentsPanel
                        taskId={taskId}
                        projectId={(task as any)?.client_entities?.project_id ?? null}
                        firmId={(task as any)?.client_entities?.projects?.firm_id ?? null}
                      />
                      <DocumentManager
                        taskId={taskId}
                        firmName={
                          project && entity && !isHiddenDefaultEntity(entity.name)
                            ? `${project.name} — ${formatEntityDisplayName(entity.name)}`
                            : formatEntityDisplayName(entity?.name) !== "—" &&
                                !isHiddenDefaultEntity(entity?.name)
                              ? formatEntityDisplayName(entity?.name)
                              : (project?.name ??
                                task.client_entities?.projects?.firms?.name ??
                                "Workspace")
                        }
                      />
                    </TabsContent>

                    {/* Tab 2 — Time Sheet & Activity */}
                    {
                      <TabsContent value="time" className="mt-3 flex-1 min-h-0 overflow-hidden">
                        {discussionOpen ? (
                          <ResizableTwoPane
                            hideToolbar
                            storageKey={`wi-tab2-disc:${taskId}`}
                            defaultLeft={70}
                            minLeft={40}
                            maxLeft={85}
                            left={
                              <div className="h-full overflow-y-auto min-h-0 pr-1 space-y-3">
                                <Card className="bg-card/60 backdrop-blur border-border/60">
                                  <CardContent className="p-3">
                                    <h3 className="mb-2 text-sm font-semibold">Time Sheet</h3>
                                    <TaskTimeSheetPanel taskId={taskId} />
                                  </CardContent>
                                </Card>
                                <Card className="bg-card/60 backdrop-blur border-border/60">
                                  <CardContent className="p-3">
                                    <h3 className="mb-2 text-sm font-semibold">Activity history</h3>
                                    <TaskAuditTimeline taskId={taskId} />
                                  </CardContent>
                                </Card>
                              </div>
                            }
                            right={discussionAside}
                          />
                        ) : (
                          <ResizableTwoPane
                            hideToolbar
                            storageKey={`wi-tab3:${taskId}`}
                            defaultLeft={70}
                            left={
                              <div className="h-full overflow-y-auto min-h-0 pr-1">
                                <Card className="bg-card/60 backdrop-blur border-border/60">
                                  <CardContent className="p-3">
                                    <h3 className="mb-2 text-sm font-semibold">Time Sheet</h3>
                                    <TaskTimeSheetPanel taskId={taskId} />
                                  </CardContent>
                                </Card>
                              </div>
                            }
                            right={
                              <div className="h-full overflow-y-auto min-h-0 pl-1">
                                <Card className="bg-card/60 backdrop-blur border-border/60">
                                  <CardContent className="p-3">
                                    <h3 className="mb-2 text-sm font-semibold">Activity history</h3>
                                    <TaskAuditTimeline taskId={taskId} />
                                  </CardContent>
                                </Card>
                              </div>
                            }
                          />
                        )}
                      </TabsContent>
                    }
                  </Tabs>
                );
              })()}
            </div>

            {entity && !isHiddenDefaultEntity(entity.name) && (
              <div className="shrink-0 px-4 md:px-6 pb-3 text-xs text-muted-foreground">
                <Link
                  to="/projects/$projectSlug/$entitySlug"
                  params={{ projectSlug: project?.slug ?? "", entitySlug: entity.slug }}
                  className="hover:text-foreground"
                >
                  ← Back to {formatEntityDisplayName(entity.name)}
                </Link>
              </div>
            )}
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}

function InlineTitleEditor({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <h1
        className="truncate text-lg font-semibold text-foreground cursor-text hover:bg-accent/40 rounded px-1 -mx-1"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Click to edit title"
      >
        {value}
      </h1>
    );
  }
  const commit = () => {
    const v = draft.trim();
    setEditing(false);
    if (v && v !== value) onSave(v);
  };
  return (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") {
          setEditing(false);
        }
      }}
      className="h-8 text-lg font-semibold"
    />
  );
}

function WorkflowTemplatePicker({
  taskId,
  firmId,
  projectId,
}: {
  taskId: string;
  firmId: string | null;
  projectId: string | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: templates = [] } = useQuery({
    queryKey: ["workflow-templates-scoped", firmId, projectId],
    queryFn: async () => {
      const [tplsRes, firmLinks, projLinks] = await Promise.all([
        supabase
          .from("workflow_templates")
          .select("id, name, category")
          .eq("category", "workflow")
          .order("sort_order")
          .order("name"),
        firmId
          ? supabase.from("workflow_template_firms").select("template_id").eq("firm_id", firmId)
          : Promise.resolve({ data: [] as { template_id: string }[] }),
        projectId
          ? supabase
              .from("workflow_template_projects")
              .select("template_id")
              .eq("project_id", projectId)
          : Promise.resolve({ data: [] as { template_id: string }[] }),
      ]);
      const all = (tplsRes.data ?? []) as { id: string; name: string; category: string | null }[];
      const firmAllowed = new Set((firmLinks.data ?? []).map((r) => r.template_id));
      const projAllowed = new Set((projLinks.data ?? []).map((r) => r.template_id));
      // If a template has no firm/project links it's considered global.
      if (firmAllowed.size === 0 && projAllowed.size === 0) return all;
      return all.filter((t) => firmAllowed.has(t.id) || projAllowed.has(t.id));
    },
  });

  const apply = useMutation({
    mutationFn: async (templateId: string | null) => {
      if (!templateId) return { added: 0, name: "" };
      const [{ data: items }, { data: existing }, { data: tplRow }] = await Promise.all([
        supabase
          .from("template_checklist_items")
          .select("title, kind, sort_order")
          .eq("workflow_template_id", templateId)
          .order("sort_order"),
        supabase.from("task_subtasks").select("title").eq("task_id", taskId),
        supabase.from("workflow_templates").select("name").eq("id", templateId).single(),
      ]);
      const existingTitles = new Set(
        (existing ?? []).map((s) => (s as { title: string }).title.trim().toLowerCase()),
      );
      type ItemRow = { title: string; kind: string | null; sort_order: number | null };
      const newItems = ((items ?? []) as ItemRow[]).filter(
        (it) => !existingTitles.has(it.title.trim().toLowerCase()),
      );
      const subtaskRows = newItems
        .filter((it) => !it.kind || it.kind === "subtask" || it.kind === "open_point")
        .map((it) => ({ task_id: taskId, title: it.title, created_by: user?.id ?? null }));
      const actionRows = newItems
        .filter((it) => it.kind && it.kind !== "subtask" && it.kind !== "open_point")
        .map((it) => ({
          task_id: taskId,
          title: it.title,
          kind: it.kind,
          created_by: user?.id ?? null,
        }));
      if (subtaskRows.length > 0) {
        await supabase.from("task_subtasks").insert(subtaskRows as never);
      }
      if (actionRows.length > 0) {
        await supabase.from("task_action_items" as never).insert(actionRows as never);
      }
      return {
        added: subtaskRows.length + actionRows.length,
        name: (tplRow as { name?: string } | null)?.name ?? "",
      };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["subtasks", taskId] });
      qc.invalidateQueries({ queryKey: ["subtask-stats", taskId] });
      qc.invalidateQueries({ queryKey: ["task-action-items", taskId] });
      qc.invalidateQueries({ queryKey: ["action-item-stats", taskId] });
      if (res && res.added > 0) {
        toast.success(`Applied ${res.name}: ${res.added} item${res.added === 1 ? "" : "s"}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Select value="" onValueChange={(v) => apply.mutate(v || null)}>
      <SelectTrigger className="relative h-7 w-48 pl-7 pr-7 text-xs">
        <FileText
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground"
          aria-hidden
        />
        <SelectValue placeholder="Apply workflow template" />
      </SelectTrigger>
      <SelectContent>
        {templates.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No templates</div>
        ) : (
          templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

function DescriptionBlock({
  value,
  editable,
  onSave,
}: {
  value: string;
  editable: boolean;
  onSave: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const stripped = value.replace(/<[^>]*>/g, "").trim();

  return (
    <>
      <div className="mt-0.5 flex items-start gap-1 group">
        {stripped ? (
          <RichViewer html={value} className="flex-1 line-clamp-2 text-xs text-muted-foreground" />
        ) : (
          <span className="flex-1 text-xs text-muted-foreground italic">
            {editable ? "Add description…" : ""}
          </span>
        )}
        {editable && (
          <button
            type="button"
            onClick={() => {
              setDraft(value);
              setOpen(true);
            }}
            className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-opacity"
            title="Edit description"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlignLeft className="h-4 w-4" /> Description
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-[160px]">
            <RichEditor
              value={draft}
              onChange={setDraft}
              placeholder="Enter task description…"
              minHeight={160}
              compact
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onSave(draft);
                setOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MessagesPanel({ taskId, isInternal }: { taskId: string; isInternal: boolean }) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [clientVisible, setClientVisible] = useState(!isInternal);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const { data: messages, isLoading } = useQuery({
    queryKey: ["messages", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_messages")
        .select(
          "id, task_id, author_id, body, is_client_visible, created_at, edited_at, deleted_at, is_pinned",
        )
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MessageRow[];
    },
  });

  const togglePinned = async (m: MessageRow) => {
    const { error } = await supabase
      .from("task_messages")
      .update({ is_pinned: !m.is_pinned } as never)
      .eq("id", m.id);
    if (error) toast.error(error.message);
    else qc.invalidateQueries({ queryKey: ["messages", taskId] });
  };

  const authorIds = useMemo(
    () => Array.from(new Set((messages ?? []).map((m) => m.author_id))),
    [messages],
  );
  const { data: authors } = useQuery({
    queryKey: ["msg-authors", authorIds.join(",")],
    queryFn: async () => {
      if (authorIds.length === 0) return {};
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", authorIds);
      return Object.fromEntries((data ?? []).map((p) => [p.id, p]));
    },
    enabled: authorIds.length > 0,
  });

  const send = useMutation({
    mutationFn: async (text: string) => {
      if (!text.trim() || !user) return;
      const { error } = await supabase.from("task_messages").insert({
        task_id: taskId,
        author_id: user.id,
        body: text.trim(),
        is_client_visible: isInternal ? clientVisible : true,
      });
      if (error) throw error;
      if (mentions.length > 0) {
        await supabase.from("notifications").insert(
          mentions.map((uid) => ({
            user_id: uid,
            kind: "mention",
            title: "You were mentioned",
            body: text.trim().slice(0, 140),
            task_id: taskId,
            url: `/ops/tasks/${taskId}`,
          })) as never,
        );
      }
      setMentions([]);
    },
    // Optimistic insert: append a temporary row so the UI updates instantly.
    onMutate: async (text: string) => {
      if (!text.trim() || !user) return { previous: undefined };
      await qc.cancelQueries({ queryKey: ["messages", taskId] });
      const previous = qc.getQueryData<MessageRow[]>(["messages", taskId]);
      const optimistic: MessageRow = {
        id: `temp-${crypto.randomUUID()}`,
        task_id: taskId,
        author_id: user.id,
        body: text.trim(),
        is_client_visible: isInternal ? clientVisible : true,
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
      };
      qc.setQueryData<MessageRow[]>(["messages", taskId], [...(previous ?? []), optimistic]);
      setBody("");
      return { previous };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(["messages", taskId], ctx.previous);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["messages", taskId] }),
  });

  const edit = useMutation({
    mutationFn: async ({ id, newBody }: { id: string; newBody: string }) => {
      const { error } = await supabase
        .from("task_messages")
        .update({ body: newBody, edited_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["messages", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("task_messages")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages", taskId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const editBlockedReason = (m: MessageRow): string | null => {
    if (m.deleted_at) return "Message has been deleted";
    if (isAdmin) return null;
    if (m.author_id !== user?.id) return "Only the author or an admin can edit";
    const ageMin = (Date.now() - new Date(m.created_at).getTime()) / 60000;
    if (ageMin > EDIT_WINDOW_MINUTES) return `Edit window expired (${EDIT_WINDOW_MINUTES} min)`;
    return null;
  };
  const deleteBlockedReason = (m: MessageRow): string | null => {
    if (m.deleted_at) return "Already deleted";
    if (isAdmin) return null;
    if (m.author_id !== user?.id) return "Only the author or an admin can delete";
    const ageMin = (Date.now() - new Date(m.created_at).getTime()) / 60000;
    if (ageMin > EDIT_WINDOW_MINUTES) return `Delete window expired (${EDIT_WINDOW_MINUTES} min)`;
    return null;
  };

  const allMessages = messages ?? [];
  const pinned = allMessages.filter((m) => m.is_pinned && !m.deleted_at);

  const dayKey = (d: string) => {
    const dt = new Date(d);
    const today = new Date();
    const yest = new Date();
    yest.setDate(today.getDate() - 1);
    const same = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
    if (same(dt, today)) return "Today";
    if (same(dt, yest)) return "Yesterday";
    return dt.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: dt.getFullYear() === today.getFullYear() ? undefined : "numeric",
    });
  };

  return (
    <div className="flex h-full flex-col">
      {pinned.length > 0 && (
        <details className="mb-2 shrink-0 rounded-md border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20">
          <summary className="cursor-pointer px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-800 dark:text-amber-300 flex items-center gap-1">
            <Pin className="h-3 w-3" /> {pinned.length} pinned · view
          </summary>
          <div className="space-y-1 px-3 pb-2">
            {pinned.map((m) => {
              const a = authors?.[m.author_id];
              return (
                <div key={`pin-${m.id}`} className="text-[12px]">
                  <span className="font-medium">{a?.full_name ?? a?.email ?? "User"}:</span>{" "}
                  <span className="text-foreground/80">
                    {m.body.slice(0, 160)}
                    {m.body.length > 160 ? "…" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {/* Scrollable messages region — owns its own scroll so the composer stays visible. */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-muted/20 p-2">
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : allMessages.length === 0 ? (
          <EmptyState title="No messages yet" description="Start the conversation below." />
        ) : (
          allMessages.map((m, idx) => {
            const a = authors?.[m.author_id];
            const prev = idx > 0 ? allMessages[idx - 1] : null;
            const showDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
            const sameAuthor = !!prev && prev.author_id === m.author_id;
            const within5 =
              !!prev &&
              Math.abs(new Date(m.created_at).getTime() - new Date(prev.created_at).getTime()) <
                5 * 60 * 1000;
            const showAuthor = !sameAuthor || !within5 || showDay;
            const isMe = m.author_id === user?.id;
            const editReason = editBlockedReason(m);
            const deleteReason = deleteBlockedReason(m);
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-2 flex justify-center">
                    <span className="rounded-full bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground border">
                      {dayKey(m.created_at)}
                    </span>
                  </div>
                )}
                <div
                  className={cn(
                    "group flex gap-2",
                    showAuthor ? "mt-2" : "mt-0.5",
                    isMe ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  {showAuthor && !isMe ? (
                    <UserAvatar
                      userId={m.author_id}
                      profile={
                        a
                          ? {
                              id: m.author_id,
                              full_name: a.full_name ?? null,
                              email: a.email ?? null,
                              avatar_url: null,
                            }
                          : undefined
                      }
                      size="sm"
                    />
                  ) : !isMe ? (
                    <div className="w-8 shrink-0" />
                  ) : null}
                  <div
                    className={cn(
                      "max-w-[78%] min-w-0 flex flex-col",
                      isMe ? "items-end" : "items-start",
                    )}
                  >
                    {showAuthor && (
                      <div
                        className={cn(
                          "mb-0.5 px-0.5 flex flex-wrap items-center gap-2 text-[12px]",
                          isMe && "flex-row-reverse",
                        )}
                      >
                        <span className="font-semibold text-foreground">
                          {isMe ? "You" : (a?.full_name ?? a?.email ?? "User")}
                        </span>
                        <span className="text-muted-foreground text-[11px] tabular-nums">
                          {new Date(m.created_at).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {m.is_pinned && <Pin className="h-3 w-3 text-amber-600" />}
                        {isInternal && !m.is_client_visible && (
                          <span className="rounded px-1 text-[9px] font-semibold uppercase tracking-wide bg-amber-200 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100">
                            Internal
                          </span>
                        )}
                      </div>
                    )}
                    <div
                      className={cn("relative flex items-start gap-1", isMe && "flex-row-reverse")}
                    >
                      <div
                        className={cn(
                          "rounded-2xl px-3 py-1.5 text-[13px] leading-snug border",
                          isMe
                            ? "bg-primary text-primary-foreground border-primary rounded-br-sm"
                            : "bg-muted/60 rounded-bl-sm",
                          !m.is_client_visible &&
                            !isMe &&
                            "border-l-[3px] border-l-amber-500 bg-amber-50/60 dark:bg-amber-950/20",
                          !m.is_client_visible && isMe && "ring-2 ring-amber-400",
                        )}
                      >
                        {m.deleted_at ? (
                          <span className="italic opacity-70">[message deleted]</span>
                        ) : editingId === m.id ? (
                          <div className="space-y-2 min-w-[240px]">
                            <MentionTextarea value={editBody} onChange={setEditBody} rows={3} />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => edit.mutate({ id: m.id, newBody: editBody.trim() })}
                                disabled={!editBody.trim() || edit.isPending}
                              >
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap break-words">
                            {renderMentioned(m.body)}
                          </div>
                        )}
                        {m.edited_at && !m.deleted_at && editingId !== m.id && (
                          <span
                            className={cn(
                              "ml-1 text-[10px] italic",
                              isMe ? "text-primary-foreground/70" : "text-muted-foreground",
                            )}
                          >
                            (edited)
                          </span>
                        )}
                      </div>
                      {!m.deleted_at && editingId !== m.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity self-center"
                              title="Message actions"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align={isMe ? "end" : "start"}>
                            <DropdownMenuItem onClick={() => togglePinned(m)}>
                              {m.is_pinned ? (
                                <>
                                  <PinOff className="mr-2 h-3.5 w-3.5" /> Unpin
                                </>
                              ) : (
                                <>
                                  <Pin className="mr-2 h-3.5 w-3.5" /> Pin
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={!!editReason}
                              onClick={() => {
                                setEditingId(m.id);
                                setEditBody(m.body);
                              }}
                              title={editReason ?? undefined}
                            >
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!!deleteReason}
                              className="text-destructive focus:text-destructive"
                              onClick={() => {
                                if (confirm("Delete this message?")) remove.mutate(m.id);
                              }}
                              title={deleteReason ?? undefined}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer — fixed at bottom of the panel, never scrolls out of view. */}
      <div
        className="mt-2 shrink-0 rounded-lg border bg-background p-3 space-y-2 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
        onKeyDownCapture={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && body.trim()) {
            e.preventDefault();
            send.mutate(body);
          }
        }}
      >
        <MentionTextarea
          placeholder="Write a message… use @ to mention. ⌘/Ctrl+Enter to send."
          rows={2}
          value={body}
          onChange={setBody}
          onMentionsChange={setMentions}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          {isInternal ? (
            <div className="flex items-center gap-2">
              <Switch id="cvis" checked={clientVisible} onCheckedChange={setClientVisible} />
              <Label htmlFor="cvis" className="text-xs cursor-pointer">
                {clientVisible ? "Visible to client" : "Internal only"}
              </Label>
            </div>
          ) : (
            <span />
          )}
          <Button
            onClick={() => send.mutate(body)}
            disabled={!body.trim() || send.isPending}
            className="gap-1.5"
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

// FilesPanel moved to src/components/ops/files-panel.tsx
