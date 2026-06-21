import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Wand2, Loader2, Search, ArrowRight } from "lucide-react";
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
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/shared/utils";
import { useAuth } from "@/lib/auth/auth-context";
import {
  ACTION_ITEM_KINDS,
  ACTION_ITEM_KIND_CODE,
  ACTION_ITEM_KIND_TONE,
  asActionItemKind,
  type ActionItemKind,
} from "@/lib/ops/action-item-kinds";
import {
  addTemplateChecklistItem,
  updateTemplateChecklistItem,
  deleteTemplateChecklistItem,
  reorderTemplateChecklistItems,
  generateActionItemsFromTemplate,
  templateTaskPickerQuery,
  type WorkflowTemplate as Template,
  type TemplateChecklistItem as Item,
} from "@/lib/queries/ops.queries";

// ─── One clarification item (kind + text) ─────────────────────
function SortableClarificationItem({
  item,
  slNo,
  canEdit,
  onPatch,
  onDelete,
}: {
  item: Item;
  slNo: number;
  canEdit: boolean;
  onPatch: (patch: { title?: string; kind?: string }) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const kind = asActionItemKind(item.kind);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);

  const commit = () => {
    const v = draft.trim();
    setEditing(false);
    if (v && v !== item.title) onPatch({ title: v });
    else setDraft(item.title);
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 hover:bg-muted/40 hover:border-border transition-colors",
        isDragging && "opacity-60 ring-1 ring-primary/40 bg-background shadow-sm",
      )}
    >
      <span className="text-[10px] font-mono text-muted-foreground w-5 shrink-0 text-right tabular-nums">
        {slNo}.
      </span>
      {canEdit && (
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-muted-foreground p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 shrink-0"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      <Badge
        variant="outline"
        className={cn("text-[10px] font-bold tracking-wide shrink-0", ACTION_ITEM_KIND_TONE[kind])}
      >
        {ACTION_ITEM_KIND_CODE[kind]}
      </Badge>
      {editing && canEdit ? (
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
              setDraft(item.title);
              setEditing(false);
            }
          }}
          className="h-7 flex-1 text-sm"
        />
      ) : (
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => {
            setDraft(item.title);
            setEditing(true);
          }}
          className="flex-1 min-w-0 text-left text-sm truncate rounded px-1 -mx-1 hover:bg-muted/60 disabled:hover:bg-transparent"
          title={canEdit ? "Click to edit" : undefined}
        >
          {item.title}
        </button>
      )}
      {canEdit && (
        <>
          <Select value={kind} onValueChange={(v) => onPatch({ kind: v })}>
            <SelectTrigger className="h-7 w-[150px] text-xs shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_ITEM_KINDS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.code} — {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100"
            onClick={onDelete}
            title="Delete item"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </>
      )}
    </li>
  );
}

// ─── Generate Action Items → pick a task ──────────────────────
function GenerateActionItemsDialog({
  template,
  itemCount,
  open,
  onOpenChange,
}: {
  template: Template;
  itemCount: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: tasks, isLoading } = useQuery({ ...templateTaskPickerQuery(), enabled: open });

  const generate = useMutation({
    mutationFn: (taskId: string) =>
      generateActionItemsFromTemplate({
        templateId: template.id,
        taskId,
        createdBy: user?.id ?? null,
        templateName: template.name,
      }),
    onSuccess: (count, taskId) => {
      if (count === 0) {
        toast.message("All items already exist on that task");
      } else {
        toast.success(`Added ${count} action item${count === 1 ? "" : "s"}`, {
          action: {
            label: "Open task",
            onClick: () => navigate({ to: "/ops/tasks/$taskId", params: { taskId } }),
          },
        });
      }
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="text-base">Generate action items</DialogTitle>
        </DialogHeader>
        <p className="px-4 text-xs text-muted-foreground">
          Pick a task — its <span className="font-medium">Clarifications &amp; Action Items</span>{" "}
          section gets {itemCount} item{itemCount === 1 ? "" : "s"} from{" "}
          <span className="font-medium">{template.name}</span>. Items already present are skipped.
        </p>
        <Command className="border-t">
          <CommandInput placeholder="Search tasks…" />
          <CommandList className="max-h-72">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tasks…
              </div>
            ) : (
              <>
                <CommandEmpty>
                  <span className="flex items-center justify-center gap-1.5 text-xs">
                    <Search className="h-3.5 w-3.5" /> No tasks found.
                  </span>
                </CommandEmpty>
                <CommandGroup>
                  {(tasks ?? []).map((t) => (
                    <CommandItem
                      key={t.id}
                      value={`${t.title} ${t.firm_name ?? ""} ${t.project_name ?? ""}`}
                      onSelect={() => {
                        if (!generate.isPending) generate.mutate(t.id);
                      }}
                      className="flex items-center gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm truncate">{t.title}</div>
                        {(t.firm_name || t.project_name) && (
                          <div className="text-[11px] text-muted-foreground truncate">
                            {[t.firm_name, t.project_name].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      {generate.isPending && generate.variables === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// ─── Clarification detail body ────────────────────────────────
export function ClarificationDetailPane({
  template,
  items,
  canEdit,
}: {
  template: Template;
  items: Item[];
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<ActionItemKind>("clarification");
  const [genOpen, setGenOpen] = useState(false);

  useEffect(() => {
    setGenOpen(false);
    setNewTitle("");
  }, [template.id]);

  const addItem = useMutation({
    mutationFn: (v: { title: string; kind: ActionItemKind }) =>
      addTemplateChecklistItem({
        workflow_template_id: template.id,
        title: v.title,
        kind: v.kind,
        sort_order: items.length,
        template: null,
      }),
    onSuccess: () => {
      setNewTitle("");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchItem = useMutation({
    mutationFn: (v: { id: string; title: string; kind: string }) =>
      updateTemplateChecklistItem({ id: v.id, title: v.title, kind: v.kind }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => deleteTemplateChecklistItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderItems = useMutation({
    mutationFn: (updates: { id: string; sort_order: number }[]) =>
      reorderTemplateChecklistItems(updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(items, from, to);
    reorderItems.mutate(reordered.map((item, idx) => ({ id: item.id, sort_order: idx })));
  };

  // Per-kind counts for the header summary.
  const kindCounts = useMemo(() => {
    const m = new Map<ActionItemKind, number>();
    for (const it of items) {
      const k = asActionItemKind(it.kind);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return ACTION_ITEM_KINDS.filter((k) => m.has(k.value)).map((k) => ({
      ...k,
      count: m.get(k.value)!,
    }));
  }, [items]);

  const submitNew = () => {
    const t = newTitle.trim();
    if (!t) return;
    addItem.mutate({ title: t, kind: newKind });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"}
          </span>
          {kindCounts.map((k) => (
            <Badge key={k.value} variant="outline" className={cn("text-[10px]", k.tone)}>
              {k.code} {k.count}
            </Badge>
          ))}
        </div>
        <Button
          size="sm"
          className="h-7 gap-1 text-xs"
          disabled={items.length === 0}
          onClick={() => setGenOpen(true)}
          title={items.length === 0 ? "Add items first" : "Generate action items into a task"}
        >
          <Wand2 className="h-3.5 w-3.5" /> Generate Action Items
        </Button>
      </div>

      {/* Items */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {canEdit
              ? "No clarification items yet — add one below. Each becomes an entry in a task's Clarifications & Action Items section."
              : "No clarification items."}
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-0.5">
                {items.map((item, idx) => (
                  <SortableClarificationItem
                    key={item.id}
                    item={item}
                    slNo={idx + 1}
                    canEdit={canEdit}
                    onPatch={(patch) =>
                      patchItem.mutate({
                        id: item.id,
                        title: patch.title ?? item.title,
                        kind: patch.kind ?? item.kind ?? "clarification",
                      })
                    }
                    onDelete={() => deleteItem.mutate(item.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Add row */}
      {canEdit && (
        <div className="shrink-0 border-t px-4 py-2 flex gap-2">
          <Select value={newKind} onValueChange={(v) => setNewKind(v as ActionItemKind)}>
            <SelectTrigger className="h-8 w-[150px] text-xs shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_ITEM_KINDS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.code} — {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="h-8 flex-1 text-sm"
            placeholder="Add a clarification / action item and press Enter…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitNew();
              }
            }}
          />
          <Button size="sm" disabled={!newTitle.trim() || addItem.isPending} onClick={submitNew}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <GenerateActionItemsDialog
        template={template}
        itemCount={items.length}
        open={genOpen}
        onOpenChange={setGenOpen}
      />
    </div>
  );
}
