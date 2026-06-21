import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  ListChecks,
  GripVertical,
  Calendar as CalendarIcon,
  Workflow,
  History,
  Archive,
  ArchiveRestore,
  Eye,
  EyeOff,
  Search,
} from "lucide-react";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";
import { AuditHistoryList, type AuditEventRow } from "@/components/shared/audit-history-popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { toast } from "sonner";
import { templatesQuery } from "@/lib/queries/ops.queries";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SinglePersonPicker } from "@/components/shared/single-person-picker";
import { SubtaskTimerButton } from "@/components/ops/subtask-timer-button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/shared/utils";

type SubStatus = "todo" | "in_progress" | "done";

interface Subtask {
  id: string;
  task_id: string;
  title: string;
  description: string | null;
  is_done: boolean;
  status: SubStatus;
  sort_order: number;
  created_at: string;
  completed_at: string | null;
  assignee_id: string | null;
  due_date: string | null;
  archived_at: string | null;
}

const STATUS_OPTS: { value: SubStatus; label: string; tone: string }[] = [
  { value: "todo", label: "To do", tone: "bg-muted text-foreground" },
  {
    value: "in_progress",
    label: "In progress",
    tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  },
  {
    value: "done",
    label: "Done",
    tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
];

export function SubtaskList({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const queryKey = ["subtasks", taskId];
  const [draft, setDraft] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [wfDialogOpen, setWfDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_subtasks")
        .select(
          "id, task_id, title, description, is_done, status, sort_order, created_at, completed_at, assignee_id, due_date, archived_at",
        )
        .eq("task_id", taskId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Subtask[];
    },
  });

  const add = useMutation({
    mutationFn: async (title: string) => {
      const { error } = await supabase.from("task_subtasks").insert({
        task_id: taskId,
        title,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Subtask> }) => {
      const { error } = await supabase
        .from("task_subtasks")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<Subtask[]>(queryKey) ?? [];
      qc.setQueryData(
        queryKey,
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_subtasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async ({ id, restore }: { id: string; restore: boolean }) => {
      const { error } = await supabase
        .from("task_subtasks")
        .update({ archived_at: restore ? null : new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
    onSuccess: (_d, v) => toast.success(v.restore ? "Restored" : "Archived"),
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = useMutation({
    mutationFn: async (ordered: Subtask[]) => {
      for (let i = 0; i < ordered.length; i++) {
        const { error } = await supabase
          .from("task_subtasks")
          .update({ sort_order: -(i + 1) })
          .eq("id", ordered[i].id);
        if (error) throw error;
      }
      for (let i = 0; i < ordered.length; i++) {
        const { error } = await supabase
          .from("task_subtasks")
          .update({ sort_order: i + 1 })
          .eq("id", ordered[i].id);
        if (error) throw error;
      }
    },
    onMutate: async (ordered) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<Subtask[]>(queryKey) ?? [];
      qc.setQueryData(
        queryKey,
        ordered.map((s, i) => ({ ...s, sort_order: i + 1 })),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(`Reorder failed: ${e.message}`);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const list = data ?? [];
    const from = list.findIndex((s) => s.id === active.id);
    const to = list.findIndex((s) => s.id === over.id);
    if (from < 0 || to < 0) return;
    reorder.mutate(arrayMove(list, from, to));
  };

  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft("");
    add.mutate(t);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const allItems = data ?? [];
  const activeItems = allItems.filter((s) => !s.archived_at);
  const archivedItems = allItems.filter((s) => !!s.archived_at);
  const items = activeItems;
  const doneCount = items.filter((s) => s.status === "done").length;

  return (
    <div className="rounded-xl border border-border-subtle glass p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="h-4 w-4 text-primary" />
          Sub-tasks
          {items.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              · {doneCount} / {items.length} done
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {archivedItems.length > 0 && (
            <Button
              size="sm"
              variant={showArchived ? "default" : "outline"}
              className="h-7 text-xs gap-1"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              Archived ({archivedItems.length})
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1"
            onClick={() => setWfDialogOpen(true)}
          >
            <Workflow className="h-3 w-3" /> Add from workflow
          </Button>
          <WorkflowTemplateDialog
            taskId={taskId}
            open={wfDialogOpen}
            onOpenChange={setWfDialogOpen}
            onInserted={() => qc.invalidateQueries({ queryKey })}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          No sub-tasks yet. Add one below or use "Add from workflow" to seed from a template.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1.5">
              {items.map((s) => (
                <SortableSubtaskRow
                  key={s.id}
                  subtask={s}
                  taskId={taskId}
                  onPatch={(patch) => update.mutate({ id: s.id, patch })}
                  onRemove={() => remove.mutate(s.id)}
                  onArchive={() => archive.mutate({ id: s.id, restore: false })}
                  onRestore={() => archive.mutate({ id: s.id, restore: true })}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {showArchived && archivedItems.length > 0 && (
        <div className="space-y-1.5 pt-2 mt-2 border-t border-dashed">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Archive className="h-3 w-3" /> Archived
          </div>
          <ul className="space-y-1.5">
            {archivedItems.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-2 py-1.5 opacity-70"
              >
                <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 text-sm line-through text-muted-foreground truncate">
                  {s.title}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {s.archived_at ? format(new Date(s.archived_at), "MMM d") : ""}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs gap-1"
                  onClick={() => archive.mutate({ id: s.id, restore: true })}
                >
                  <ArchiveRestore className="h-3 w-3" /> Restore
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Plus className="h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Add a sub-task and press Enter…"
          className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
        />
      </div>
    </div>
  );
}

function SortableSubtaskRow({
  subtask,
  taskId,
  onPatch,
  onRemove,
  onArchive,
  onRestore,
}: {
  subtask: Subtask;
  taskId: string;
  onPatch: (patch: Partial<Subtask>) => void;
  onRemove: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const tone = STATUS_OPTS.find((o) => o.value === subtask.status)?.tone ?? "";
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex flex-wrap items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 hover:bg-muted/40 hover:border-border transition-colors",
        isDragging && "opacity-60 ring-1 ring-primary/40 bg-background shadow-sm",
      )}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-0.5 opacity-40 group-hover:opacity-100"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <InlineSubtaskTitle
        value={subtask.title}
        description={subtask.description}
        done={subtask.status === "done"}
        onSave={(v) => onPatch({ title: v })}
      />
      <Select
        value={subtask.status}
        onValueChange={(v: string) => onPatch({ status: v as SubStatus })}
      >
        <SelectTrigger className={cn("h-7 w-28 text-xs border", tone)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-2">
            <CalendarIcon className="h-3 w-3" />
            {subtask.due_date ? format(new Date(subtask.due_date), "MMM d") : "Due"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={subtask.due_date ? new Date(subtask.due_date) : undefined}
            onSelect={(d) => onPatch({ due_date: d ? format(d, "yyyy-MM-dd") : null })}
            className="p-3 pointer-events-auto"
          />
          {subtask.due_date && (
            <div className="border-t p-2">
              <Button
                size="sm"
                variant="ghost"
                className="w-full h-7 text-xs"
                onClick={() => onPatch({ due_date: null })}
              >
                Clear date
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      <SinglePersonPicker
        value={subtask.assignee_id}
        onChange={(id) => onPatch({ assignee_id: id })}
        size="xs"
        className="w-36"
      />
      <SubtaskTimerButton taskId={taskId} subtaskId={subtask.id} />
      <SubtaskHistoryButton subtaskId={subtask.id} createdAt={subtask.created_at} />
      {onArchive && (
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-amber-600 opacity-0 group-hover:opacity-100"
          aria-label="Archive sub-task"
          title="Archive"
          onClick={onArchive}
        >
          <Archive className="h-3.5 w-3.5" />
        </Button>
      )}
      <DeleteConfirmDialog
        entityLabel="Sub-task"
        entityName={subtask.title}
        onConfirm={onRemove}
        trigger={
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
            aria-label="Delete sub-task"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        }
      />
    </li>
  );
}

function SubtaskHistoryButton({ subtaskId, createdAt }: { subtaskId: string; createdAt: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["subtask-events", subtaskId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_subtask_events" as never)
        .select("id, actor_id, event, before, after, created_at")
        .eq("subtask_id", subtaskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AuditEventRow[];
    },
  });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground opacity-60 group-hover:opacity-100"
          aria-label="History"
        >
          <History className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {open ? (
          <AuditHistoryList events={data} isLoading={isLoading} createdAt={createdAt} />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function WorkflowTemplateDialog({
  taskId,
  open,
  onOpenChange,
  onInserted,
}: {
  taskId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onInserted: () => void;
}) {
  const { user } = useAuth();
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  const [tplId, setTplId] = useState<string | null>(null);
  const [step, setStep] = useState<"preview" | "customize">("preview");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const { data: ctx } = useQuery({
    queryKey: ["task-workflow-ctx", taskId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("client_entities(project_id, projects(id, firm_id, project_type))")
        .eq("id", taskId)
        .single();
      const proj = (
        data as {
          client_entities?: {
            project_id?: string;
            projects?: { id?: string; firm_id?: string; project_type?: string } | null;
          } | null;
        }
      )?.client_entities?.projects;
      return {
        project_id: proj?.id ?? null,
        firm_id: proj?.firm_id ?? null,
        project_type: proj?.project_type ?? null,
      };
    },
  });

  const { data: scoped } = useQuery({
    queryKey: ["scoped-templates", ctx?.firm_id, ctx?.project_id, ctx?.project_type, showAll],
    enabled: open && !!ctx,
    queryFn: async () => {
      const { data: all } = await supabase
        .from("workflow_templates")
        .select(
          "id, name, category, project_types, workflow_template_firms(firm_id), workflow_template_projects(project_id)",
        )
        .eq("category", "workflow")
        .order("name");
      type Row = {
        id: string;
        name: string;
        category: string | null;
        project_types: string[] | null;
        workflow_template_firms: { firm_id: string }[];
        workflow_template_projects: { project_id: string }[];
      };
      const rows = (all ?? []) as Row[];
      if (showAll) return rows;
      return rows.filter((r) => {
        const firmMatch = ctx?.firm_id
          ? r.workflow_template_firms.some((f) => f.firm_id === ctx.firm_id)
          : false;
        const projMatch = ctx?.project_id
          ? r.workflow_template_projects.some((p) => p.project_id === ctx.project_id)
          : false;
        const typeMatch = ctx?.project_type
          ? (r.project_types ?? []).includes(ctx.project_type)
          : false;
        const isUnscoped =
          r.workflow_template_firms.length === 0 &&
          r.workflow_template_projects.length === 0 &&
          (r.project_types ?? []).length === 0;
        return firmMatch || projMatch || typeMatch || isUnscoped;
      });
    },
  });

  const { data: tplData, isLoading: itemsLoading } = useQuery({
    ...templatesQuery(),
    enabled: open,
  });

  const templates = scoped ?? [];
  const items = useMemo(
    () =>
      (tplData?.items ?? [])
        .filter((i) => i.workflow_template_id === tplId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [tplData, tplId],
  );

  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Reset step + pre-check all items when a different template is selected
  useEffect(() => {
    setStep("preview");
    setPicked(new Set(items.map((i) => i.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplId]);

  // Reset everything when dialog opens
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setTplId(null);
    setStep("preview");
    setPicked(new Set());
    setShowAll(false);
  }, [open]);

  const insert = useMutation({
    mutationFn: async () => {
      const selectedItems = items.filter((i) => picked.has(i.id));
      if (selectedItems.length === 0) return 0;
      const { data: existing } = await supabase
        .from("task_subtasks")
        .select("title")
        .eq("task_id", taskId);
      const seen = new Set(
        (existing ?? []).map((s) => (s as { title: string }).title.trim().toLowerCase()),
      );
      const fresh = selectedItems.filter((it) => !seen.has(it.title.trim().toLowerCase()));
      if (fresh.length === 0) {
        toast.message("All selected items already exist");
        return 0;
      }
      const rows = fresh.map((it) => ({
        task_id: taskId,
        title: it.title,
        description: it.description ?? null,
        created_by: user?.id ?? null,
      }));
      const { error } = await supabase.from("task_subtasks").insert(rows as never);
      if (error) throw error;
      return fresh.length;
    },
    onSuccess: (n) => {
      if (n > 0) toast.success(`Added ${n} item${n === 1 ? "" : "s"} from workflow`);
      onInserted();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const allSelected = items.length > 0 && picked.size === items.length;
  const toggleAll = () =>
    setPicked(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSelectTemplate = (id: string) => {
    setTplId(id);
    setStep("preview");
    // items will update via memo; picked is set after items update via the memo below
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3">
          <DialogTitle className="text-base">Add from Workflow Template</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[260px_1fr] border-t min-h-[360px] max-h-[65vh]">
          {/* Left: template list */}
          <div className="border-r flex flex-col min-h-0">
            <div className="p-2 border-b space-y-1.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 pl-8 text-xs"
                  placeholder="Search templates…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between px-0.5">
                <span className="text-[10px] text-muted-foreground">
                  {showAll ? "All templates" : "Matching this task"}
                </span>
                <button
                  type="button"
                  className="text-[10px] text-primary hover:underline"
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? "Filter" : "Show all"}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">
                  No templates {showAll ? "found." : "scoped to this task."}
                </div>
              ) : (
                filtered.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectTemplate(t.id)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded text-xs truncate",
                      tplId === t.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    {t.name}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right: preview or customize */}
          <div className="flex flex-col min-h-0">
            {!tplId ? (
              <div className="grid place-items-center h-full p-6 text-xs text-muted-foreground">
                Pick a template on the left to preview its checklist steps.
              </div>
            ) : itemsLoading ? (
              <div className="grid place-items-center h-full p-6 text-xs text-muted-foreground">
                Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="grid place-items-center h-full p-6 text-xs text-muted-foreground">
                This template has no checklist items.
              </div>
            ) : step === "preview" ? (
              <div className="flex flex-col min-h-0">
                <div className="flex items-center justify-between px-3 py-2 border-b">
                  <span className="text-xs font-medium text-muted-foreground">
                    {items.length} step{items.length === 1 ? "" : "s"}
                  </span>
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      setPicked(new Set(items.map((i) => i.id)));
                      setStep("customize");
                    }}
                  >
                    Customize →
                  </Button>
                </div>
                <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
                  {items.map((it, idx) => (
                    <li key={it.id} className="flex items-start gap-2 px-2 py-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground w-5 shrink-0 text-right tabular-nums mt-0.5">
                        {idx + 1}.
                      </span>
                      <span className="text-sm flex-1">{it.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex flex-col min-h-0">
                <div className="flex items-center justify-between px-3 py-2 border-b">
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                    Select all
                  </label>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {picked.size} / {items.length} selected
                  </span>
                </div>
                <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
                  {items.map((it, idx) => (
                    <li
                      key={it.id}
                      className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-muted/40"
                    >
                      <Checkbox
                        className="mt-0.5"
                        checked={picked.has(it.id)}
                        onCheckedChange={() => toggle(it.id)}
                      />
                      <span className="text-[10px] font-mono text-muted-foreground w-5 shrink-0 text-right tabular-nums mt-0.5">
                        {idx + 1}.
                      </span>
                      <span className="text-sm flex-1">{it.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-4 py-3 border-t">
          {step === "customize" && tplId && items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto"
              onClick={() => setStep("preview")}
            >
              ← Back
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {step === "customize" && (
            <Button
              size="sm"
              disabled={picked.size === 0 || insert.isPending}
              onClick={() => insert.mutate()}
            >
              {insert.isPending
                ? "Adding…"
                : `Add ${picked.size} item${picked.size === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InlineSubtaskTitle({
  value,
  description,
  done,
  onSave,
}: {
  value: string;
  description?: string | null;
  done: boolean;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    const btn = (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={cn(
          "flex-1 min-w-[180px] text-left text-sm truncate rounded px-1 -mx-1 hover:bg-muted/60",
          done && "line-through text-muted-foreground",
        )}
        title="Click to edit"
      >
        {value}
      </button>
    );
    if (!description) return btn;
    return (
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>{btn}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {description}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }
  const commit = () => {
    const v = draft.trim();
    setEditing(false);
    if (v && v !== value) onSave(v);
    else setDraft(value);
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
          setDraft(value);
          setEditing(false);
        }
      }}
      className="h-7 flex-1 min-w-[180px] text-sm"
    />
  );
}
