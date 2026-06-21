import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Pencil,
  X as XIcon,
  ListChecks,
  GripVertical,
  Globe,
  Save,
  Loader2,
} from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/shared/utils";
import { PROJECT_TYPE_OPTIONS, type ProjectType } from "@/lib/shared/domain";
import {
  addTemplateChecklistItem,
  updateTemplateChecklistItem,
  deleteTemplateChecklistItem,
  reorderTemplateChecklistItems,
  templateScopeQuery,
  saveTemplateScope,
  type WorkflowTemplate as Template,
  type TemplateChecklistItem as Item,
} from "@/lib/queries/ops.queries";

// ─── Inline Scope Panel (shown in "Scope" tab) ────────────────
function InlineScopePanel({ templateId }: { templateId: string }) {
  const qc = useQueryClient();
  const [firmIds, setFirmIds] = useState<Set<string>>(new Set());
  const [projectIds, setProjectIds] = useState<Set<string>>(new Set());
  const [projectTypes, setProjectTypes] = useState<Set<ProjectType>>(new Set());
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery(templateScopeQuery(templateId));

  useEffect(() => {
    if (data) {
      setFirmIds(new Set(data.linkedFirmIds));
      setProjectIds(new Set(data.linkedProjectIds));
      setProjectTypes(new Set(data.projectTypes as ProjectType[]));
      setDirty(false);
    }
  }, [data]);

  const toggle = <T,>(set: Set<T>, val: T): Set<T> => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  };

  const save = useMutation({
    mutationFn: () =>
      saveTemplateScope({
        templateId,
        firmIds: Array.from(firmIds),
        projectIds: Array.from(projectIds),
        projectTypes: Array.from(projectTypes),
      }),
    onSuccess: () => {
      toast.success("Scope saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["template-scope-inline", templateId] });
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isUnscoped = firmIds.size === 0 && projectIds.size === 0 && projectTypes.size === 0;

  if (isLoading)
    return (
      <div className="p-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    );

  return (
    <div className="p-4 space-y-5">
      {isUnscoped && (
        <p className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
          No scope set — this template is global (available in all projects).
        </p>
      )}

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Project types
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PROJECT_TYPE_OPTIONS.map((o) => {
            const on = projectTypes.has(o.value as ProjectType);
            return (
              <Button
                key={o.value}
                size="sm"
                variant={on ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => {
                  setProjectTypes((s) => toggle(s, o.value as ProjectType));
                  setDirty(true);
                }}
              >
                {o.label}
              </Button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Firms ({firmIds.size} selected)
        </div>
        <ScrollArea className="h-36 border rounded-md p-2">
          <div className="space-y-1">
            {(data?.firms ?? []).map((f) => (
              <label
                key={f.id}
                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5"
              >
                <Checkbox
                  checked={firmIds.has(f.id)}
                  onCheckedChange={() => {
                    setFirmIds((s) => toggle(s, f.id));
                    setDirty(true);
                  }}
                />
                <span>{f.name}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </section>

      <section className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Projects ({projectIds.size} selected)
        </div>
        <ScrollArea className="h-44 border rounded-md p-2">
          <div className="space-y-1">
            {(data?.projects ?? []).map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/40 rounded px-1 py-0.5"
              >
                <Checkbox
                  checked={projectIds.has(p.id)}
                  onCheckedChange={() => {
                    setProjectIds((s) => toggle(s, p.id));
                    setDirty(true);
                  }}
                />
                <span className="flex-1">{p.name}</span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {p.project_type}
                </Badge>
              </label>
            ))}
          </div>
        </ScrollArea>
      </section>

      <Button
        size="sm"
        disabled={!dirty || save.isPending}
        onClick={() => save.mutate()}
        className="w-full"
      >
        {save.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
        ) : (
          <Save className="h-3.5 w-3.5 mr-1.5" />
        )}
        Save scope
      </Button>
    </div>
  );
}

// ─── Sortable checklist row ───────────────────────────────────
function SortableChecklistItem({
  item,
  slNo,
  canEdit,
  editMode,
  draft,
  onDraftChange,
  onDelete,
  onEnterEditMode,
}: {
  item: Item;
  slNo: number;
  canEdit: boolean;
  editMode: boolean;
  draft: { title: string; description: string } | undefined;
  onDraftChange: (v: { title: string; description: string }) => void;
  onDelete: () => void;
  onEnterEditMode: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: editMode,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const title = editMode && draft ? draft.title : item.title;
  const description = editMode && draft ? draft.description : (item.description ?? "");

  const row = (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group rounded-md border border-transparent transition-colors",
        isDragging && "opacity-60 ring-1 ring-primary/40 bg-background shadow-sm",
        !editMode && "hover:bg-muted/40 hover:border-border",
        editMode && "bg-muted/20 border-border/50",
      )}
    >
      {editMode ? (
        <div className="flex gap-2 px-2 py-1.5 items-start">
          <span className="text-[10px] font-mono text-muted-foreground mt-2 w-5 shrink-0 text-right">
            {slNo}.
          </span>
          <div className="flex-1 space-y-1">
            <Input
              className="h-7 text-sm"
              value={draft?.title ?? ""}
              onChange={(e) =>
                onDraftChange({ title: e.target.value, description: draft?.description ?? "" })
              }
              placeholder="Item title"
            />
            <Input
              className="h-6 text-xs"
              value={draft?.description ?? ""}
              onChange={(e) =>
                onDraftChange({ title: draft?.title ?? "", description: e.target.value })
              }
              placeholder="Short description (tooltip on subtask hover)…"
            />
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-1.5 px-2 py-1.5">
          <span className="text-[10px] font-mono text-muted-foreground mt-1.5 w-5 shrink-0 text-right">
            {slNo}.
          </span>
          {canEdit && (
            <button
              type="button"
              className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground opacity-0 group-hover:opacity-60 hover:!opacity-100 shrink-0 p-0.5"
              aria-label="Drag to reorder"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <span className="text-sm leading-snug">{title}</span>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{description}</p>
            )}
          </div>
          {canEdit && (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 text-destructive"
              onClick={onDelete}
              title="Delete item"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </li>
  );

  if (!canEdit || editMode) return row;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={onEnterEditMode}>
          <Pencil className="h-3.5 w-3.5 mr-2" /> Edit all items
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete item
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// ─── Workflow detail body — checklist + scope tabs ────────────
export function WorkflowDetailPane({
  template,
  items,
  canEdit,
}: {
  template: Template;
  items: Item[];
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("checklist");
  const [checklistEditMode, setChecklistEditMode] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { title: string; description: string }>>({});
  const [newItem, setNewItem] = useState("");

  // Leaving a template resets transient edit state.
  useEffect(() => {
    setChecklistEditMode(false);
    setActiveTab("checklist");
  }, [template.id]);

  const addItem = useMutation({
    mutationFn: (v: {
      workflow_template_id: string;
      title: string;
      sort_order: number;
      template: string | null;
    }) => addTemplateChecklistItem(v),
    onSuccess: () => {
      setNewItem("");
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
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

  const saveAllItems = useMutation({
    mutationFn: async (changes: { id: string; title: string; description: string | null }[]) => {
      await Promise.all(
        changes.map((c) =>
          updateTemplateChecklistItem({ id: c.id, title: c.title, description: c.description }),
        ),
      );
    },
    onSuccess: () => {
      toast.success("Checklist saved");
      setChecklistEditMode(false);
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    if (checklistEditMode) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(items, from, to);
    reorderItems.mutate(reordered.map((item, idx) => ({ id: item.id, sort_order: idx })));
  };

  const enterChecklistEdit = () => {
    const d: Record<string, { title: string; description: string }> = {};
    for (const item of items)
      d[item.id] = { title: item.title, description: item.description ?? "" };
    setDrafts(d);
    setChecklistEditMode(true);
  };

  const handleSaveAll = () => {
    const changes = items
      .filter((item) => {
        const d = drafts[item.id];
        if (!d) return false;
        return d.title.trim() !== item.title || (d.description.trim() || null) !== item.description;
      })
      .map((item) => ({
        id: item.id,
        title: drafts[item.id].title.trim() || item.title,
        description: drafts[item.id].description.trim() || null,
      }));
    if (changes.length === 0) {
      setChecklistEditMode(false);
      return;
    }
    saveAllItems.mutate(changes);
  };

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 pt-2 shrink-0">
        <TabsList className="bg-transparent gap-1 p-0 h-auto">
          <TabsTrigger
            value="checklist"
            className="text-xs border-t-2 border-transparent rounded-b-none data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none gap-1"
          >
            <ListChecks className="h-3.5 w-3.5" />
            Checklist
            <Badge variant="secondary" className="text-[9px] px-1 py-0 tabular-nums ml-0.5">
              {items.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="scope"
            className="text-xs border-t-2 border-transparent rounded-b-none data-[state=active]:border-violet-500 data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-700 dark:data-[state=active]:text-violet-300 data-[state=active]:shadow-none gap-1"
          >
            <Globe className="h-3.5 w-3.5" />
            Scope
          </TabsTrigger>
        </TabsList>

        {activeTab === "checklist" && canEdit && (
          <div className="flex items-center gap-1.5">
            {checklistEditMode ? (
              <>
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 gap-1 text-xs"
                  disabled={saveAllItems.isPending}
                  onClick={handleSaveAll}
                >
                  {saveAllItems.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3" />
                  )}
                  Save all
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setChecklistEditMode(false)}
                >
                  <XIcon className="h-3 w-3 mr-1" /> Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs"
                onClick={enterChecklistEdit}
                disabled={items.length === 0}
              >
                <Pencil className="h-3 w-3" /> Edit
              </Button>
            )}
          </div>
        )}
      </div>

      <TabsContent value="checklist" className="flex-1 min-h-0 flex flex-col mt-0">
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {items.length === 0 && !canEdit && (
            <p className="text-xs text-muted-foreground italic">No checklist items.</p>
          )}
          {items.length === 0 && canEdit && !checklistEditMode && (
            <p className="text-xs text-muted-foreground">No items yet — add one below.</p>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-0.5">
                {items.map((item, idx) => (
                  <SortableChecklistItem
                    key={item.id}
                    item={item}
                    slNo={idx + 1}
                    canEdit={canEdit}
                    editMode={checklistEditMode}
                    draft={drafts[item.id]}
                    onDraftChange={(v) => setDrafts((prev) => ({ ...prev, [item.id]: v }))}
                    onDelete={() => deleteItem.mutate(item.id)}
                    onEnterEditMode={enterChecklistEdit}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </div>

        {canEdit && !checklistEditMode && (
          <div className="shrink-0 border-t px-4 py-2 flex gap-2">
            <Input
              className="h-8 flex-1 text-sm"
              placeholder="Add checklist item and press Enter…"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newItem.trim())
                  addItem.mutate({
                    workflow_template_id: template.id,
                    title: newItem.trim(),
                    sort_order: items.length,
                    template: template.template,
                  });
              }}
            />
            <Button
              size="sm"
              disabled={!newItem.trim() || addItem.isPending}
              onClick={() => {
                if (newItem.trim())
                  addItem.mutate({
                    workflow_template_id: template.id,
                    title: newItem.trim(),
                    sort_order: items.length,
                    template: template.template,
                  });
              }}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </TabsContent>

      <TabsContent value="scope" className="flex-1 min-h-0 overflow-y-auto mt-0">
        {canEdit ? (
          <InlineScopePanel key={template.id} templateId={template.id} />
        ) : (
          <p className="p-4 text-xs text-muted-foreground">Only admins can edit scope settings.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
