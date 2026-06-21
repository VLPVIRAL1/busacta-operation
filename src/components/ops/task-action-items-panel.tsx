import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  ListChecks,
  History,
  Eye,
  EyeOff,
  Check,
  X,
  Archive,
  ArchiveRestore,
  FileText,
  Search,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PeoplePicker } from "@/components/shared/people-picker";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  templatesQuery,
  addSelectedTemplateItemsToTask,
} from "@/lib/queries/ops.queries";
import { AuditHistoryList, type AuditEventRow } from "@/components/shared/audit-history-popover";
import { RichEditorInline, RichViewer } from "@/components/shared/rich-editor";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/shared/utils";
import {
  ACTION_ITEM_KINDS as KIND_OPTS,
  ACTION_ITEM_KIND_LABEL as KIND_LABEL,
  ACTION_ITEM_KIND_CODE as KIND_CODE,
  ACTION_ITEM_KIND_TONE as KIND_TONE,
  type ActionItemKind as Kind,
} from "@/lib/ops/action-item-kinds";

type Status = "todo" | "in_progress" | "done";

interface ActionItem {
  id: string;
  task_id: string;
  title: string; // stores HTML body now (supports multi-line / lists / sub-items)
  kind: Kind;
  status: Status;
  is_client_visible: boolean;
  sort_order: number;
  start_at: string;
  end_at: string | null;
  assignee_id: string | null;
  created_by: string | null;
  created_at: string;
  completed_by: string | null;
  archived_at: string | null;
}

const STATUS_OPTS: { value: Status; label: string; tone: string }[] = [
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

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, "").trim();

export function TaskActionItemsPanel({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const queryKey = ["task-action-items", taskId];
  const [draft, setDraft] = useState("");
  const [draftKind, setDraftKind] = useState<Kind>("open_point");
  const [showArchived, setShowArchived] = useState(false);
  const [tplPickerOpen, setTplPickerOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_action_items" as never)
        .select("*")
        .eq("task_id", taskId)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ActionItem[];
    },
  });

  const allItems = data ?? [];
  const items = allItems.filter((i) => !i.archived_at);
  const archivedItems = allItems.filter((i) => !!i.archived_at);
  const itemIds = items.map((i) => i.id);

  const { data: assigneeRows } = useQuery({
    queryKey: ["task-action-item-assignees", taskId, itemIds.join(",")],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_action_item_assignees" as never)
        .select("item_id, user_id")
        .in("item_id", itemIds);
      if (error) throw error;
      return (data ?? []) as unknown as { item_id: string; user_id: string }[];
    },
  });

  const assigneesByItem = useMemo(() => {
    const m = new Map<string, string[]>();
    (assigneeRows ?? []).forEach((r) => {
      const list = m.get(r.item_id) ?? [];
      list.push(r.user_id);
      m.set(r.item_id, list);
    });
    return m;
  }, [assigneeRows]);

  const setAssignees = useMutation({
    mutationFn: async ({ itemId, next }: { itemId: string; next: string[] }) => {
      const current = assigneesByItem.get(itemId) ?? [];
      const toAdd = next.filter((u) => !current.includes(u));
      const toRemove = current.filter((u) => !next.includes(u));
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("task_action_item_assignees" as never)
          .delete()
          .eq("item_id", itemId)
          .in("user_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length > 0) {
        const rows = toAdd.map((u) => ({
          item_id: itemId,
          user_id: u,
          assigned_by: user?.id ?? null,
        }));
        const { error } = await supabase
          .from("task_action_item_assignees" as never)
          .insert(rows as never);
        if (error) throw error;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["task-action-item-assignees", taskId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const add = useMutation({
    mutationFn: async ({ html, kind }: { html: string; kind: Kind }) => {
      const row = { task_id: taskId, title: html, kind, created_by: user?.id ?? null };
      const { error } = await supabase.from("task_action_items" as never).insert(row as never);
      if (error) throw error;
    },
    onSuccess: () => setDraft(""),
    onSettled: () => qc.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast.error(e.message || "Could not add item"),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ActionItem> }) => {
      const { error } = await supabase
        .from("task_action_items" as never)
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ActionItem[]>(queryKey) ?? [];
      qc.setQueryData(
        queryKey,
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(e.message || "Update failed");
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("task_action_items" as never)
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  const archive = useMutation({
    mutationFn: async ({ id, restore }: { id: string; restore: boolean }) => {
      const { error } = await supabase
        .from("task_action_items" as never)
        .update({ archived_at: restore ? null : new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
    onSuccess: (_d, v) => toast.success(v.restore ? "Restored" : "Archived"),
    onError: (e: Error) => toast.error(e.message),
  });

  const submitDraft = () => {
    const text = stripHtml(draft);
    if (text.length < 3) {
      toast.error("Item must be at least 3 characters");
      return;
    }
    add.mutate({ html: draft, kind: draftKind });
  };

  const doneCount = items.filter((s) => s.status === "done").length;

  return (
    <div className="rounded-xl border border-border-subtle glass p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="h-4 w-4 text-primary" />
          Clarifications &amp; Action Items
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
          <div className="text-[11px] text-muted-foreground">
            Each item supports lists, sub-points and formatting.
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No items yet. Add one below.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, idx) => (
            <ActionItemRow
              key={item.id}
              item={item}
              index={idx + 1}
              assignees={assigneesByItem.get(item.id) ?? []}
              onPatch={(patch) => update.mutate({ id: item.id, patch })}
              onSetAssignees={(next) => setAssignees.mutate({ itemId: item.id, next })}
              onRemove={() => remove.mutate(item.id)}
              onArchive={() => archive.mutate({ id: item.id, restore: false })}
            />
          ))}
        </ul>
      )}

      {showArchived && archivedItems.length > 0 && (
        <div className="space-y-1.5 pt-2 mt-1 border-t border-dashed">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Archive className="h-3 w-3" /> Archived items
          </div>
          <ul className="space-y-1.5">
            {archivedItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-2 py-1.5 opacity-70"
              >
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-bold tracking-wide shrink-0",
                    KIND_TONE[item.kind],
                  )}
                >
                  {KIND_CODE[item.kind]}
                </Badge>
                <span className="flex-1 text-sm line-through text-muted-foreground truncate">
                  {stripHtml(item.title)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {item.archived_at ? format(new Date(item.archived_at), "MMM d") : ""}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs gap-1"
                  onClick={() => archive.mutate({ id: item.id, restore: true })}
                >
                  <ArchiveRestore className="h-3 w-3" /> Restore
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-border/60">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium">New item</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 ml-auto text-xs gap-1"
            onClick={() => setTplPickerOpen(true)}
          >
            <FileText className="h-3.5 w-3.5" />
            From template…
          </Button>
          <Select value={draftKind} onValueChange={(v) => setDraftKind(v as Kind)}>
            <SelectTrigger className="h-7 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.code} — {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <RichEditorInline
          value={draft}
          onChange={setDraft}
          placeholder="Type the item — use bullets / numbered lists for sub-points. Press Enter for a new line."
          minHeight={90}
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDraft("")} disabled={!draft}>
            Clear
          </Button>
          <Button size="sm" onClick={submitDraft} disabled={!stripHtml(draft) || add.isPending}>
            {add.isPending ? "Adding…" : "Add item"}
          </Button>
        </div>
      </div>

      <TemplatePickerDialog
        taskId={taskId}
        open={tplPickerOpen}
        onOpenChange={setTplPickerOpen}
        onInserted={() => qc.invalidateQueries({ queryKey })}
      />
    </div>
  );
}

function TemplatePickerDialog({
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
  const { data, isLoading } = useQuery({ ...templatesQuery(), enabled: open });
  const [tplId, setTplId] = useState<string | null>(null);
  const [step, setStep] = useState<"preview" | "customize">("preview");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const templates = useMemo(
    () =>
      (data?.templates ?? []).filter(
        (t) => (t.category ?? "workflow") === "clarification",
      ),
    [data],
  );
  const items = useMemo(
    () =>
      (data?.items ?? [])
        .filter((i) => i.workflow_template_id === tplId)
        .sort((a, b) => a.sort_order - b.sort_order),
    [data, tplId],
  );

  useEffect(() => {
    if (open) {
      setTplId(null);
      setStep("preview");
      setPicked(new Set());
      setSearch("");
    }
  }, [open]);

  useEffect(() => {
    setStep("preview");
    setPicked(new Set(items.map((i) => i.id)));
  }, [items]);

  const filteredTpls = templates.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()),
  );

  const insert = useMutation({
    mutationFn: () =>
      addSelectedTemplateItemsToTask({
        taskId,
        itemIds: Array.from(picked),
        createdBy: user?.id ?? null,
        templateId: tplId ?? undefined,
        templateName: templates.find((t) => t.id === tplId)?.name,
      }),
    onSuccess: (count) => {
      if (count === 0) {
        toast.message("All selected items already exist on this task");
      } else {
        toast.success(`Added ${count} item${count === 1 ? "" : "s"}`);
      }
      onInserted();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allSelected = items.length > 0 && picked.size === items.length;
  const toggleAll = () => {
    setPicked(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="text-base">Add from template</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-[260px_1fr] border-t min-h-[360px]">
          <div className="border-r flex flex-col min-h-0">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 pl-8 text-xs"
                  placeholder="Search templates…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-1">
              {isLoading ? (
                <div className="p-4 text-xs text-muted-foreground">Loading…</div>
              ) : filteredTpls.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">
                  No clarification templates.
                </div>
              ) : (
                filteredTpls.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTplId(t.id)}
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
          <div className="flex flex-col min-h-0">
            {!tplId ? (
              <div className="grid place-items-center h-full p-6 text-xs text-muted-foreground">
                Pick a template on the left to preview its items.
              </div>
            ) : items.length === 0 ? (
              <div className="grid place-items-center h-full p-6 text-xs text-muted-foreground">
                This template has no items.
              </div>
            ) : step === "preview" ? (
              <div className="flex flex-col min-h-0">
                <div className="flex items-center justify-between px-3 py-2 border-b">
                  <span className="text-xs font-medium text-muted-foreground">
                    {items.length} item{items.length === 1 ? "" : "s"}
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
                <ul className="flex-1 overflow-y-auto p-2 space-y-1">
                  {items.map((it, idx) => {
                    const kind = (it.kind ?? "clarification") as Kind;
                    return (
                      <li key={it.id} className="flex items-start gap-2 px-2 py-1.5">
                        <span className="text-[10px] font-mono text-muted-foreground w-5 shrink-0 text-right tabular-nums mt-0.5">
                          {idx + 1}.
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-bold tracking-wide shrink-0 mt-0.5",
                            KIND_TONE[kind],
                          )}
                        >
                          {KIND_CODE[kind]}
                        </Badge>
                        <span className="flex-1 text-sm">{it.title}</span>
                      </li>
                    );
                  })}
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
                <ul className="flex-1 overflow-y-auto p-2 space-y-1">
                  {items.map((it, idx) => {
                    const kind = (it.kind ?? "clarification") as Kind;
                    return (
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
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-bold tracking-wide shrink-0 mt-0.5",
                            KIND_TONE[kind],
                          )}
                        >
                          {KIND_CODE[kind]}
                        </Badge>
                        <span className="flex-1 text-sm">{it.title}</span>
                      </li>
                    );
                  })}
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
              {insert.isPending ? "Adding…" : `Add ${picked.size} item${picked.size === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActionItemRow({
  item,
  index,
  assignees,
  onPatch,
  onSetAssignees,
  onRemove,
  onArchive,
}: {
  item: ActionItem;
  index: number;
  assignees: string[];
  onPatch: (patch: Partial<ActionItem>) => void;
  onSetAssignees: (next: string[]) => void;
  onRemove: () => void;
  onArchive?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const [historyOpen, setHistoryOpen] = useState(false);
  const statusTone = STATUS_OPTS.find((o) => o.value === item.status)?.tone ?? "";
  const kindTone = KIND_TONE[item.kind];

  const commit = () => {
    const text = stripHtml(draft);
    if (text.length < 3) {
      toast.error("Item must be at least 3 characters");
      setDraft(item.title);
      setEditing(false);
      return;
    }
    if (draft !== item.title) onPatch({ title: draft });
    setEditing(false);
  };

  return (
    <li
      className={cn(
        "group rounded-md border border-border/60 px-2 py-1.5 hover:bg-muted/30 transition-colors",
        item.status === "done" && "bg-muted/20",
      )}
    >
      {editing ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-semibold text-muted-foreground tabular-nums">
              #{index}
            </span>
            <Badge
              variant="outline"
              className={cn("text-[10px] font-bold tracking-wide", kindTone)}
              title={KIND_LABEL[item.kind]}
            >
              {KIND_CODE[item.kind]}
            </Badge>
          </div>
          <RichEditorInline value={draft} onChange={setDraft} minHeight={80} />
          <div className="flex justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                setDraft(item.title);
                setEditing(false);
              }}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <Button size="sm" className="h-7" onClick={commit}>
              <Check className="h-3.5 w-3.5 mr-1" />
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-mono font-semibold text-muted-foreground tabular-nums w-6 shrink-0">
            #{index}
          </span>
          <Badge
            variant="outline"
            className={cn("text-[10px] font-bold tracking-wide shrink-0", kindTone)}
            title={KIND_LABEL[item.kind]}
          >
            {KIND_CODE[item.kind]}
          </Badge>
          <button
            type="button"
            onClick={() => {
              setDraft(item.title);
              setEditing(true);
            }}
            className={cn(
              "flex-1 min-w-[200px] text-left text-sm rounded px-1 py-0.5 hover:bg-muted/50 truncate",
              item.status === "done" && "opacity-60",
            )}
            title="Click to edit"
          >
            <RichViewer
              html={item.title}
              className={cn(
                "inline [&>*]:inline [&_p]:inline",
                item.status === "done" && "line-through",
              )}
            />
          </button>
          <Select value={item.kind} onValueChange={(v) => onPatch({ kind: v as Kind })}>
            <SelectTrigger className="h-7 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.code} — {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={item.status} onValueChange={(v) => onPatch({ status: v as Status })}>
            <SelectTrigger className={cn("h-7 w-28 text-xs border", statusTone)}>
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
          <PeoplePicker
            value={assignees}
            onChange={onSetAssignees}
            placeholder="Assignees"
            className="w-44"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground"
            onClick={() => onPatch({ is_client_visible: !item.is_client_visible })}
            aria-label={
              item.is_client_visible
                ? "Visible to firm — click to make internal"
                : "Internal — click to share with firm"
            }
            title={item.is_client_visible ? "Visible to firm" : "Internal only"}
          >
            {item.is_client_visible ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
          </Button>
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground"
                aria-label="History"
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              {historyOpen ? <ItemHistory itemId={item.id} createdAt={item.created_at} /> : null}
            </PopoverContent>
          </Popover>
          {onArchive && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-amber-600 opacity-0 group-hover:opacity-100"
              aria-label="Archive item"
              title="Archive"
              onClick={onArchive}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          )}
          <DeleteConfirmDialog
            entityLabel="Open point"
            entityName={stripHtml(item.title).slice(0, 60)}
            onConfirm={onRemove}
            trigger={
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
                aria-label="Delete item"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            }
          />
        </div>
      )}
    </li>
  );
}

function ItemHistory({ itemId, createdAt }: { itemId: string; createdAt: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["action-item-events", itemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_action_item_events" as never)
        .select("id, actor_id, event, before, after, created_at")
        .eq("item_id", itemId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AuditEventRow[];
    },
  });
  return <AuditHistoryList events={data} isLoading={isLoading} createdAt={createdAt} />;
}

// Legacy alias — old import sites continue to work.
export { TaskActionItemsPanel as TaskOpenPointsPanel };
