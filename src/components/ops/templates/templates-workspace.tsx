import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
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
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { cn } from "@/lib/shared/utils";
import { useAuth } from "@/lib/auth/auth-context";
import {
  templatesQuery,
  deleteWorkflowTemplate,
  updateWorkflowTemplate,
  duplicateWorkflowTemplate,
  reorderWorkflowTemplates,
  type TemplateCategory,
  type WorkflowTemplate as Template,
} from "@/lib/queries/ops.queries";
import { CATEGORY_META } from "./category-meta";
import { SortableTemplateRow } from "./template-row";
import { TemplateCreateDialog } from "./template-create-dialog";
import { WorkflowDetailPane } from "./workflow-detail-pane";
import { ClarificationDetailPane } from "./clarification-detail-pane";
import { EmailDetailPane } from "./email-detail-pane";

type Filter = TemplateCategory | "all";

const FILTER_PILLS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "workflow", label: "Workflow" },
  { value: "clarification", label: "Clarification" },
  { value: "email", label: "Email" },
];

/**
 * Shared split-pane templates workspace, reused by all three category routes
 * (/ops/templates, /ops/tem-cai, /ops/email-templates). The `category` prop
 * sets the initial filter and the default type for the create dialog.
 */
export function TemplatesWorkspace({ category }: { category: TemplateCategory }) {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canEdit = roles.includes("super_admin") || roles.includes("admin");

  const { data, isLoading } = useQuery(templatesQuery());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>(category);
  const [localOrder, setLocalOrder] = useState<Template[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Header (name/description) editing
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editTplKey, setEditTplKey] = useState("");

  const templates = useMemo(() => data?.templates ?? [], [data]);
  const allItems = data?.items ?? [];
  useEffect(() => {
    setLocalOrder(null);
  }, [templates]);

  // Reset filter/selection when navigating between category routes.
  useEffect(() => {
    setFilter(category);
    setSelectedId(null);
    setEditing(false);
  }, [category]);

  const ordered = localOrder ?? templates;
  const filtered = ordered.filter(
    (t) =>
      (filter === "all" || t.category === filter) &&
      t.name.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedTemplate = templates.find((t) => t.id === selectedId) ?? null;
  const selectedItems = selectedTemplate
    ? allItems
        .filter((i) => i.workflow_template_id === selectedTemplate.id)
        .sort((a, b) => a.sort_order - b.sort_order)
    : [];

  const deleteTpl = useMutation({
    mutationFn: (id: string) => deleteWorkflowTemplate(id),
    onSuccess: (_d, id) => {
      toast.success("Template deleted");
      if (selectedId === id) setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateTpl = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      duplicateWorkflowTemplate(id, `${name} (copy)`),
    onSuccess: (newId) => {
      toast.success("Template duplicated");
      setSelectedId(newId);
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTpl = useMutation({
    mutationFn: (v: {
      id: string;
      name: string;
      description: string | null;
      template: string | null;
    }) => updateWorkflowTemplate(v),
    onSuccess: () => {
      toast.success("Template saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderTemplates = useMutation({
    mutationFn: (updates: { id: string; sort_order: number }[]) =>
      reorderWorkflowTemplates(updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleTemplateDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ordered.findIndex((t) => t.id === active.id);
    const to = ordered.findIndex((t) => t.id === over.id);
    if (from < 0 || to < 0) return;
    const reordered = arrayMove(ordered, from, to);
    setLocalOrder(reordered);
    reorderTemplates.mutate(reordered.map((t, idx) => ({ id: t.id, sort_order: idx * 10 })));
  };

  const startEditing = (t: Template) => {
    setEditName(t.name);
    setEditDesc(t.description ?? "");
    setEditTplKey(t.template ?? "");
    setEditing(true);
  };

  const meta = selectedTemplate
    ? (CATEGORY_META[selectedTemplate.category] ?? CATEGORY_META.workflow)
    : null;
  const FallbackIcon =
    CATEGORY_META[filter === "all" ? category : (filter as TemplateCategory)].icon;

  // ── Left pane ───────────────────────────────────────────────
  const leftPane = (
    <div className="h-full min-h-0 flex flex-col border rounded-lg overflow-hidden bg-background">
      <div className="border-b bg-background/95 backdrop-blur px-3 py-2 shrink-0 space-y-2">
        <div className="flex items-center gap-1.5">
          {canEdit && (
            <Button
              size="sm"
              className="h-8 gap-1 shrink-0 px-2.5"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New</span>
            </Button>
          )}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px] tabular-nums px-2">
            {filtered.length}
          </Badge>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1">
        {isLoading ? (
          <div className="p-6 text-xs text-muted-foreground text-center">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<FallbackIcon className="h-8 w-8" />}
              title="No templates"
              description={
                search
                  ? "No templates match your search."
                  : "Create your first template using the button above."
              }
            />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleTemplateDragEnd}
          >
            <SortableContext
              items={filtered.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {filtered.map((t, idx) => {
                const count = allItems.filter((i) => i.workflow_template_id === t.id).length;
                return (
                  <SortableTemplateRow
                    key={t.id}
                    template={t}
                    slNo={idx + 1}
                    itemCount={count}
                    isSelected={t.id === selectedId}
                    canEdit={canEdit}
                    onSelect={() => {
                      setSelectedId(t.id);
                      setEditing(false);
                    }}
                    onEdit={() => {
                      setSelectedId(t.id);
                      startEditing(t);
                    }}
                    onDuplicate={() => duplicateTpl.mutate({ id: t.id, name: t.name })}
                    onDelete={() => {
                      if (confirm(`Delete "${t.name}"? This removes all its items.`))
                        deleteTpl.mutate(t.id);
                    }}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );

  // ── Right pane ──────────────────────────────────────────────
  const rightPane = (
    <div className="h-full min-h-0 border rounded-lg overflow-hidden bg-background">
      {!selectedTemplate ? (
        <div className="h-full grid place-items-center p-6">
          <EmptyState
            icon={<FallbackIcon className="h-8 w-8" />}
            title="No template selected"
            description="Pick a template from the list to see its details."
          />
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {/* Shared header */}
          <div className="border-b px-4 py-3 shrink-0">
            {editing && canEdit ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">Name *</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                    className="h-8"
                  />
                </div>
                <div
                  className={cn(
                    "grid gap-2",
                    selectedTemplate.category === "workflow" ? "grid-cols-2" : "grid-cols-1",
                  )}
                >
                  <div className="space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Input
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  {selectedTemplate.category === "workflow" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Template key</Label>
                      <Input
                        value={editTplKey}
                        onChange={(e) => setEditTplKey(e.target.value)}
                        placeholder="e.g. form_1065"
                        className="h-8"
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={!editName.trim() || updateTpl.isPending}
                    onClick={() =>
                      updateTpl.mutate({
                        id: selectedTemplate.id,
                        name: editName.trim(),
                        description: editDesc.trim() || null,
                        template:
                          selectedTemplate.category === "workflow"
                            ? editTplKey.trim() || null
                            : null,
                      })
                    }
                  >
                    {updateTpl.isPending ? "Saving…" : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                {meta && (
                  <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                    {meta.short}
                  </Badge>
                )}
                {selectedTemplate.template && (
                  <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                    {selectedTemplate.template}
                  </Badge>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{selectedTemplate.name}</div>
                  {selectedTemplate.description && (
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {selectedTemplate.description}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => startEditing(selectedTemplate)}
                      title="Edit template"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => {
                        if (confirm(`Delete "${selectedTemplate.name}"?`))
                          deleteTpl.mutate(selectedTemplate.id);
                      }}
                      title="Delete template"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Category-specific body */}
          {selectedTemplate.category === "email" ? (
            <EmailDetailPane
              key={selectedTemplate.id}
              template={selectedTemplate}
              canEdit={canEdit}
            />
          ) : selectedTemplate.category === "clarification" ? (
            <ClarificationDetailPane
              key={selectedTemplate.id}
              template={selectedTemplate}
              items={selectedItems}
              canEdit={canEdit}
            />
          ) : (
            <WorkflowDetailPane
              key={selectedTemplate.id}
              template={selectedTemplate}
              items={selectedItems}
              canEdit={canEdit}
            />
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Docked underline tabs (full-bleed) */}
      <div className="shrink-0 border-b bg-background px-4 flex items-center gap-1">
        {FILTER_PILLS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => {
              setFilter(p.value);
              setSelectedId(null);
            }}
            className={cn(
              "h-10 border-b-2 px-4 text-sm font-medium transition-colors",
              filter === p.value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 flex flex-col p-3">
        <ResizableTwoPane
          storageKey="ops-templates"
          defaultLeft={28}
          minLeft={18}
          maxLeft={60}
          hideToolbar
          left={leftPane}
          right={rightPane}
        />
      </div>
      <TemplateCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultCategory={filter === "all" ? category : (filter as TemplateCategory)}
        onCreated={(cat) => setFilter(cat)}
      />
    </div>
  );
}
