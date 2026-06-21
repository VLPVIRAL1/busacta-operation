import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Asterisk,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  Upload,
  Check,
  LayoutTemplate,
  Rows3,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/shared/utils";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  DndContext,
  PointerSensor,
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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  deleteBlock,
  getTemplateWithBlocks,
  publishTemplate,
  reorderBlocks,
  updateTemplate,
  upsertBlock,
} from "@/lib/organizer/templates.functions";
import {
  type BlockType,
  blockTypeLabel,
  type ConditionalRules,
  type JsonObject,
  type OrganizerBlock,
  type OrganizerTemplate,
} from "@/lib/organizer/schemas";
import { ConditionalRuleBuilder } from "@/components/organizer/conditional-rule-builder";
import { PipingTokenPicker } from "@/components/organizer/piping-token-picker";
import { PreviewDrawer, PreviewPane } from "@/components/organizer/preview-drawer";
import { PublicLinkManagerButton } from "@/components/organizer/public-link-manager";

import { VersionHistoryDialog } from "@/components/organizer/version-history-dialog";
import {
  MatrixConfigEditor,
  SignatureConfigEditor,
  MultiFileConfigEditor,
  CalculatedConfigEditor,
} from "@/components/organizer/block-config-editors";
import { BlockPalette } from "@/components/organizer/block-palette";

// Block types supported by the Phase 1 inspector. The full library lands in Phase 2.
const PHASE1_QUESTION_TYPES: BlockType[] = ["short_text", "long_text", "yes_no", "single_choice"];

const ALL_QUESTION_TYPES: BlockType[] = [
  ...PHASE1_QUESTION_TYPES,
  "multi_choice",
  "number",
  "currency",
  "date",
  "date_range",
  "file_upload",
  "attachment_request",
  "signature",
  "address",
  "rating",
  "matrix",
  "info",
  "divider",
  "subsection",
];

// ── Block type → color token (matches palette group colors) ──────────────────
const BLOCK_COLOR: Partial<Record<BlockType, { dot: string; border: string; ring: string }>> = {
  // Structure — violet
  section: { dot: "bg-violet-400", border: "border-l-violet-400", ring: "ring-violet-300/50" },
  subsection: { dot: "bg-violet-300", border: "border-l-violet-300", ring: "ring-violet-200/50" },
  info: { dot: "bg-violet-200", border: "border-l-violet-200", ring: "ring-violet-200/40" },
  divider: { dot: "bg-slate-300", border: "border-l-slate-300", ring: "ring-slate-200/40" },
  // Text — blue
  short_text: { dot: "bg-blue-400", border: "border-l-blue-400", ring: "ring-blue-300/50" },
  long_text: { dot: "bg-blue-400", border: "border-l-blue-400", ring: "ring-blue-300/50" },
  rich_text: { dot: "bg-blue-400", border: "border-l-blue-400", ring: "ring-blue-300/50" },
  // Numbers — emerald
  number: { dot: "bg-emerald-400", border: "border-l-emerald-400", ring: "ring-emerald-300/50" },
  currency: { dot: "bg-emerald-400", border: "border-l-emerald-400", ring: "ring-emerald-300/50" },
  calculated: {
    dot: "bg-emerald-400",
    border: "border-l-emerald-400",
    ring: "ring-emerald-300/50",
  },
  // Choices — amber
  yes_no: { dot: "bg-amber-400", border: "border-l-amber-400", ring: "ring-amber-300/50" },
  single_choice: { dot: "bg-amber-400", border: "border-l-amber-400", ring: "ring-amber-300/50" },
  multi_choice: { dot: "bg-amber-400", border: "border-l-amber-400", ring: "ring-amber-300/50" },
  rating: { dot: "bg-amber-400", border: "border-l-amber-400", ring: "ring-amber-300/50" },
  matrix: { dot: "bg-amber-400", border: "border-l-amber-400", ring: "ring-amber-300/50" },
  // Date — cyan
  date: { dot: "bg-cyan-400", border: "border-l-cyan-400", ring: "ring-cyan-300/50" },
  date_range: { dot: "bg-cyan-400", border: "border-l-cyan-400", ring: "ring-cyan-300/50" },
  // Files — rose
  file_upload: { dot: "bg-rose-400", border: "border-l-rose-400", ring: "ring-rose-300/50" },
  multi_file: { dot: "bg-rose-400", border: "border-l-rose-400", ring: "ring-rose-300/50" },
  attachment_request: { dot: "bg-rose-400", border: "border-l-rose-400", ring: "ring-rose-300/50" },
  signature: { dot: "bg-rose-400", border: "border-l-rose-400", ring: "ring-rose-300/50" },
  address: { dot: "bg-rose-400", border: "border-l-rose-400", ring: "ring-rose-300/50" },
  table: { dot: "bg-slate-400", border: "border-l-slate-400", ring: "ring-slate-300/50" },
  // New text types — blue family
  phone: { dot: "bg-blue-400", border: "border-l-blue-400", ring: "ring-blue-300/50" },
  email: { dot: "bg-blue-400", border: "border-l-blue-400", ring: "ring-blue-300/50" },
  url: { dot: "bg-blue-400", border: "border-l-blue-400", ring: "ring-blue-300/50" },
  time: { dot: "bg-cyan-400", border: "border-l-cyan-400", ring: "ring-cyan-300/50" },
};
const BC_FALLBACK = {
  dot: "bg-slate-400",
  border: "border-l-slate-400",
  ring: "ring-slate-300/50",
};
const getBC = (type: BlockType) => BLOCK_COLOR[type] ?? BC_FALLBACK;

export const Route = createFileRoute("/organizer/builder/$templateId")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "Organizer", to: "/organizer" }, { label: "Builder" }]} fullBleed>
        <BuilderPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function BuilderPage() {
  const { templateId } = Route.useParams();
  const qc = useQueryClient();
  const fetchTpl = useServerFn(getTemplateWithBlocks);
  const { data, isLoading } = useQuery({
    queryKey: ["organizer", "template", templateId],
    queryFn: () => fetchTpl({ data: { id: templateId } }),
  });

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [paletteW, setPaletteW] = useState(200);
  const [outlineSplitW, setOutlineSplitW] = useState(240); // outline width within combined bubble
  const [previewOpen, setPreviewOpen] = useState(false);
  const [combinedW, setCombinedW] = useState(640); // combined panel width when preview open

  useEffect(() => {
    if (data?.blocks && selectedBlockId === null) {
      // auto-select first non-section block on initial load
      const firstQ = data.blocks.find((b) => b.block_type !== "section");
      if (firstQ) setSelectedBlockId(firstQ.id);
    }
  }, [data, selectedBlockId]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["organizer", "template", templateId] });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!data.template) {
    return (
      <div className="p-12 text-center text-muted-foreground">
        Template not found.{" "}
        <Link to="/organizer" className="underline">
          Back to Organizer hub
        </Link>
      </div>
    );
  }

  const selected = data.blocks.find((b) => b.id === selectedBlockId) ?? null;

  return (
    <div className="flex flex-col h-full bg-muted/20">
      {/* ── Header bubble ─────────────────────── */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <TemplateHeader
          template={data.template}
          blocks={data.blocks}
          onSaved={invalidate}
          previewOpen={previewOpen}
          onPreviewToggle={() => setPreviewOpen((p) => !p)}
        />
      </div>

      {/* ── Two panel bubbles (palette + combined outline/edit) ── */}
      <div className="flex gap-2 px-3 pb-3 flex-1 min-h-0 overflow-hidden">
        {/* Block palette */}
        <div
          style={{ width: paletteW }}
          className="rounded-2xl bg-card border border-border/60 shadow-sm overflow-hidden flex flex-col shrink-0"
        >
          <BlockPalette
            templateId={data.template.id}
            selectedBlock={selected}
            allBlocks={data.blocks}
            onAdded={setSelectedBlockId}
            onChanged={invalidate}
          />
        </div>

        <PanelResizeHandle
          onResize={(d) => setPaletteW((w) => Math.max(160, Math.min(320, w + d)))}
        />

        {/* Combined Outline + Edit bubble */}
        {previewOpen ? (
          <div
            style={{ width: combinedW }}
            className="rounded-2xl bg-card border border-border/60 shadow-sm overflow-hidden flex shrink-0 min-w-0"
          >
            <CombinedPanelContent
              template={data.template}
              blocks={data.blocks}
              selectedBlockId={selectedBlockId}
              setSelectedBlockId={setSelectedBlockId}
              outlineSplitW={outlineSplitW}
              setOutlineSplitW={setOutlineSplitW}
              invalidate={invalidate}
            />
          </div>
        ) : (
          <div className="flex-1 rounded-2xl bg-card border border-border/60 shadow-sm overflow-hidden flex min-w-0">
            <CombinedPanelContent
              template={data.template}
              blocks={data.blocks}
              selectedBlockId={selectedBlockId}
              setSelectedBlockId={setSelectedBlockId}
              outlineSplitW={outlineSplitW}
              setOutlineSplitW={setOutlineSplitW}
              invalidate={invalidate}
            />
          </div>
        )}

        {/* Preview panel */}
        {previewOpen && (
          <>
            <PanelResizeHandle
              onResize={(d) => setCombinedW((w) => Math.max(400, Math.min(900, w + d)))}
            />
            <div className="flex-1 rounded-2xl bg-card border border-border/60 shadow-sm overflow-hidden flex flex-col min-w-0">
              <PreviewPane blocks={data.blocks} templateName={data.template.name} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------- Combined Outline + Edit panel content -------------------

function CombinedPanelContent({
  template,
  blocks,
  selectedBlockId,
  setSelectedBlockId,
  outlineSplitW,
  setOutlineSplitW,
  invalidate,
}: {
  template: OrganizerTemplate;
  blocks: OrganizerBlock[];
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string) => void;
  outlineSplitW: number;
  setOutlineSplitW: (fn: (w: number) => number) => void;
  invalidate: () => void;
}) {
  return (
    <>
      <div
        style={{ width: outlineSplitW }}
        className="shrink-0 flex flex-col overflow-hidden border-r border-border/50"
      >
        <OutlinePane
          template={template}
          blocks={blocks}
          selectedId={selectedBlockId}
          onSelect={setSelectedBlockId}
          onChanged={invalidate}
        />
      </div>
      <InternalResizeHandle
        onResize={(d) => setOutlineSplitW((w) => Math.max(160, Math.min(420, w + d)))}
      />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <InspectorPane
          template={template}
          blocks={blocks}
          selectedId={selectedBlockId}
          onSelect={setSelectedBlockId}
          onChanged={invalidate}
        />
      </div>
    </>
  );
}

// ---------------- Internal panel resize handle (within a bubble) -----------

function InternalResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const lastX = useRef(0);
  const onResizeRef = useRef(onResize);
  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    lastX.current = e.clientX;
    const move = (e: MouseEvent) => {
      const delta = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onResizeRef.current(delta);
    };
    const up = () => {
      setDragging(false);
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }, []);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        "w-px shrink-0 cursor-col-resize select-none transition-all duration-100",
        dragging ? "bg-primary/50 w-0.5" : "bg-border/60 hover:bg-primary/30 hover:w-0.5",
      )}
    />
  );
}

// ---------------- Panel resize handle --------------------------

function PanelResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const [dragging, setDragging] = useState(false);
  const lastX = useRef(0);
  const onResizeRef = useRef(onResize);
  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    lastX.current = e.clientX;
    const move = (e: MouseEvent) => {
      const delta = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onResizeRef.current(delta);
    };
    const up = () => {
      setDragging(false);
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }, []);

  return (
    <div
      onMouseDown={handleMouseDown}
      className={cn(
        "w-2 shrink-0 flex items-center justify-center cursor-col-resize select-none rounded-full group transition-colors",
        dragging ? "bg-primary/10" : "hover:bg-muted/60",
      )}
    >
      <div
        className={cn(
          "w-0.5 h-8 rounded-full transition-all duration-150",
          dragging ? "bg-primary h-12 w-1" : "bg-border/80 group-hover:bg-primary/40",
        )}
      />
    </div>
  );
}

// ---------------- Header ---------------------------------------

function TemplateHeader({
  template,
  blocks,
  onSaved,
  previewOpen,
  onPreviewToggle,
}: {
  template: OrganizerTemplate;
  blocks: OrganizerBlock[];
  onSaved: () => void;
  previewOpen: boolean;
  onPreviewToggle: () => void;
}) {
  const update = useServerFn(updateTemplate);
  const publish = useServerFn(publishTemplate);

  const updateMut = useMutation({
    mutationFn: (patch: Partial<OrganizerTemplate>) =>
      update({ data: { id: template.id, ...patch } }),
    onSuccess: () => {
      onSaved();
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: () => publish({ data: { id: template.id } }),
    onSuccess: (res) => {
      onSaved();
      if (res.template.id === template.id) {
        toast.success("Published");
      } else {
        toast.success(`Forked to v${res.template.version} (draft)`);
        window.location.href = `/organizer/builder/${res.template.id}`;
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-2xl bg-card border border-border/60 shadow-sm">
      <div className="h-12 px-3 flex items-center gap-2">
        {/* ── Back ────────────────────────────────── */}
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Link to="/organizer">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline ml-1.5 text-sm">Back</span>
          </Link>
        </Button>

        <div className="w-px h-5 bg-border shrink-0" />

        {/* ── Editable title ───────────────────────── */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Input
            value={template.name}
            onChange={(e) => updateMut.mutate({ name: e.target.value.slice(0, 200) })}
            className="font-semibold text-sm border-0 px-2 h-8 focus-visible:ring-1 focus-visible:ring-primary/40 hover:bg-muted/50 rounded-md transition-colors max-w-sm shadow-none"
          />
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${
              template.status === "published"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                : template.status === "archived"
                  ? "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
            }`}
          >
            {template.status}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">v{template.version}</span>

          {/* Auto-save indicator */}
          {updateMut.isPending ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </span>
          ) : updateMut.isSuccess ? (
            <span className="flex items-center gap-1 text-xs text-emerald-600 shrink-0">
              <Check className="h-3 w-3" />
              Saved
            </span>
          ) : null}
        </div>

        {/* ── Display mode ─────────────────────────── */}
        <Select
          value={template.display_mode ?? "page"}
          onValueChange={(v) => updateMut.mutate({ display_mode: v as "card" | "page" })}
        >
          <SelectTrigger
            className="h-8 w-[120px] text-xs shrink-0"
            title="How respondents see the form"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="page">
              <span className="flex items-center gap-1.5">
                <Rows3 className="h-3.5 w-3.5" /> Page mode
              </span>
            </SelectItem>
            <SelectItem value="card">
              <span className="flex items-center gap-1.5">
                <LayoutTemplate className="h-3.5 w-3.5" /> Card mode
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {/* ── Secondary actions ────────────────────── */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant={previewOpen ? "default" : "ghost"}
            size="sm"
            className="h-8 text-xs"
            onClick={onPreviewToggle}
            title={previewOpen ? "Close preview pane" : "Open preview pane"}
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            Preview
          </Button>
          {template.status === "published" && (
            <PublicLinkManagerButton
              templateId={template.id}
              templateName={template.name}
              size="sm"
              variant="ghost"
            />
          )}
          <VersionHistoryDialog
            templateId={template.id}
            currentVersion={template.version}
            onRestored={onSaved}
          />
        </div>

        <div className="w-px h-5 bg-border shrink-0" />

        {/* ── Publish CTA ──────────────────────────── */}
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => publishMut.mutate()}
          disabled={publishMut.isPending}
        >
          {publishMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5 mr-1.5" />
          )}
          {template.status === "draft" ? "Publish" : "Fork version"}
        </Button>
      </div>
    </div>
  );
}

// ---------------- Outline pane ---------------------------------

interface OutlineProps {
  template: OrganizerTemplate;
  blocks: OrganizerBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}

function OutlinePane({ template, blocks, selectedId, onSelect, onChanged }: OutlineProps) {
  const upsert = useServerFn(upsertBlock);
  const del = useServerFn(deleteBlock);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Inline rename — called from OutlineRow (no useServerFn needed inside Row)
  const renameBlock = useCallback(
    async (blockId: string, newText: string) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block) return;
      await upsert({
        data: {
          id: blockId,
          template_id: template.id,
          block_type: block.block_type,
          question_text: newText.trim() || null,
        },
      });
      onChanged();
    },
    [blocks, template.id, upsert, onChanged],
  );

  // Group: sections at top level; questions either nested under a section or top-level
  const tree = useMemo(() => {
    const sections = blocks
      .filter((b) => b.block_type === "section" && !b.parent_id)
      .sort((a, b) => a.order_index - b.order_index);
    const orphans = blocks
      .filter((b) => !b.parent_id && b.block_type !== "section")
      .sort((a, b) => a.order_index - b.order_index);
    const childrenBy = new Map<string, OrganizerBlock[]>();
    for (const b of blocks) {
      if (b.parent_id) {
        const arr = childrenBy.get(b.parent_id) ?? [];
        arr.push(b);
        childrenBy.set(b.parent_id, arr);
      }
    }
    childrenBy.forEach((arr) => arr.sort((a, b) => a.order_index - b.order_index));
    return { sections, orphans, childrenBy };
  }, [blocks]);

  const addSection = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          template_id: template.id,
          block_type: "section",
          question_text: "New section",
        },
      }),
    onSuccess: (res) => {
      onChanged();
      onSelect(res.block.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addQuestion = useMutation({
    mutationFn: ({ parentId, type }: { parentId: string | null; type: BlockType }) =>
      upsert({
        data: {
          template_id: template.id,
          parent_id: parentId,
          block_type: type,
          question_text: "New question",
          config_json: type === "single_choice" ? defaultChoiceConfig() : {},
        },
      }),
    onSuccess: (res) => {
      onChanged();
      onSelect(res.block.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      onChanged();
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ----- Drag & drop reorder ------------------------------------------------
  // Each list (top-level sections, per-section children, orphans) is its own
  // SortableContext, keyed by a synthetic group id. Cross-list drops are
  // ignored; the server reorder fn handles re-numbering within a parent.
  const reorder = useServerFn(reorderBlocks);
  const reorderMut = useMutation({
    mutationFn: (moves: { id: string; parent_id: string | null; order_index: number }[]) =>
      reorder({ data: { template_id: template.id, moves } }),
    onSuccess: () => onChanged(),
    onError: (e: Error) => toast.error(`Reorder failed: ${e.message}`),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const reorderList =
    (list: OrganizerBlock[], parentId: string | null) => (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIdx = list.findIndex((b) => b.id === active.id);
      const newIdx = list.findIndex((b) => b.id === over.id);
      if (oldIdx < 0 || newIdx < 0) return;
      const next = arrayMove(list, oldIdx, newIdx);
      reorderMut.mutate(
        next.map((b, i) => ({
          id: b.id,
          parent_id: parentId,
          order_index: i,
        })),
      );
    };

  const toggleCollapse = (id: string) => {
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Serial number map: sectionId → "1", childId → "1.2"
  const serialNumbers = useMemo(() => {
    const map = new Map<string, string>();
    tree.sections.forEach((sec, si) => {
      map.set(sec.id, `${si + 1}`);
      (tree.childrenBy.get(sec.id) ?? []).forEach((kid, ki) => {
        map.set(kid.id, `${si + 1}.${ki + 1}`);
      });
    });
    tree.orphans.forEach((o, oi) => map.set(o.id, `${tree.sections.length + oi + 1}`));
    return map;
  }, [tree]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="h-10 px-3 border-b border-border/50 flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex-1">
          Outline
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => addSection.mutate()}
          disabled={addSection.isPending}
        >
          <Plus className="h-3 w-3 mr-1" />
          Section
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {tree.sections.length === 0 && tree.orphans.length === 0 && (
          <div className="text-xs text-muted-foreground px-3 py-6 text-center leading-relaxed">
            <div className="font-medium mb-1">Empty template</div>
            <div className="opacity-70">
              Add a section to get started, or insert blocks from the palette.
            </div>
          </div>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={reorderList(tree.sections, null)}
        >
          <SortableContext
            items={tree.sections.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            {tree.sections.map((sec) => {
              const isCollapsed = collapsed.has(sec.id);
              const kids = tree.childrenBy.get(sec.id) ?? [];
              return (
                <div key={sec.id}>
                  <OutlineRow
                    block={sec}
                    selected={selectedId === sec.id}
                    onSelect={() => onSelect(sec.id)}
                    onDelete={() => delMut.mutate(sec.id)}
                    onRename={(t) => void renameBlock(sec.id, t)}
                    onToggleCollapse={() => toggleCollapse(sec.id)}
                    collapsed={isCollapsed}
                    hasChildren={kids.length > 0}
                    serialNumber={serialNumbers.get(sec.id)}
                  />
                  {!isCollapsed && (
                    <div className="pl-4 space-y-0.5 mt-0.5 border-l border-border/50 ml-3">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={reorderList(kids, sec.id)}
                      >
                        <SortableContext
                          items={kids.map((k) => k.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {kids.map((b) => (
                            <OutlineRow
                              key={b.id}
                              block={b}
                              selected={selectedId === b.id}
                              onSelect={() => onSelect(b.id)}
                              onDelete={() => delMut.mutate(b.id)}
                              onRename={(t) => void renameBlock(b.id, t)}
                              serialNumber={serialNumbers.get(b.id)}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                      <AddQuestionMenu
                        onAdd={(type) => addQuestion.mutate({ parentId: sec.id, type })}
                        pending={addQuestion.isPending}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </SortableContext>
        </DndContext>

        {tree.orphans.length > 0 && (
          <div className="mt-2 pt-2 border-t border-dashed">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 mb-1 font-medium">
              Unsectioned
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={reorderList(tree.orphans, null)}
            >
              <SortableContext
                items={tree.orphans.map((o) => o.id)}
                strategy={verticalListSortingStrategy}
              >
                {tree.orphans.map((b) => (
                  <OutlineRow
                    key={b.id}
                    block={b}
                    selected={selectedId === b.id}
                    onSelect={() => onSelect(b.id)}
                    onDelete={() => delMut.mutate(b.id)}
                    onRename={(t) => void renameBlock(b.id, t)}
                    serialNumber={serialNumbers.get(b.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}

        {tree.sections.length === 0 && (
          <AddQuestionMenu
            onAdd={(type) => addQuestion.mutate({ parentId: null, type })}
            pending={addQuestion.isPending}
          />
        )}
      </div>
    </div>
  );
}

function OutlineRow({
  block,
  selected,
  onSelect,
  onDelete,
  onRename,
  onToggleCollapse,
  collapsed,
  hasChildren,
  serialNumber,
}: {
  block: OrganizerBlock;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename?: (newText: string) => void;
  onToggleCollapse?: () => void;
  collapsed?: boolean;
  hasChildren?: boolean;
  serialNumber?: string;
}) {
  const isSection = block.block_type === "section";

  // ── Inline title editing ──
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(block.question_text ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) setEditValue(block.question_text ?? "");
  }, [block.question_text, isEditing]);

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const commitEdit = () => {
    setIsEditing(false);
    const trimmed = editValue.trim();
    if (trimmed !== (block.question_text ?? "")) onRename?.(trimmed);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditValue(block.question_text ?? "");
  };
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group flex items-center gap-1.5 rounded-lg cursor-pointer transition-all duration-100 ${
        isSection
          ? `px-2 py-1.5 text-xs font-semibold ${
              selected
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-foreground hover:bg-muted/60 border border-transparent"
            }`
          : `px-2 py-1 text-xs ${
              selected
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`
      } ${isDragging ? "ring-1 ring-primary/40 bg-background shadow-md opacity-70" : ""}`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-40 hover:!opacity-80 transition-opacity"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-3 w-3" />
      </button>

      {/* Collapse toggle (sections only) */}
      {isSection ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse?.();
          }}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          {hasChildren ? (
            collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )
          ) : (
            <span className="inline-block w-3.5" />
          )}
        </button>
      ) : (
        <span className="inline-block w-3.5 shrink-0" />
      )}

      {/* Serial number */}
      {serialNumber && (
        <span className="text-[9px] font-mono text-muted-foreground/50 w-5 text-right shrink-0 select-none leading-none">
          {serialNumber}
        </span>
      )}
      {/* Color dot */}
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", getBC(block.block_type).dot)} />

      {/* Label — double-click to edit inline */}
      {isEditing ? (
        <input
          ref={inputRef}
          className="flex-1 text-xs bg-transparent border-b border-primary/60 outline-none min-w-0 py-0"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => void commitEdit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitEdit();
            if (e.key === "Escape") cancelEdit();
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          maxLength={200}
        />
      ) : (
        <span
          className="flex-1 truncate leading-snug"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setIsEditing(true);
          }}
          title="Double-click to rename"
        >
          {block.question_text || <span className="italic opacity-50">Untitled</span>}
        </span>
      )}

      {/* Type pill (questions only, hidden on hover to show delete) */}
      {!isSection && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted/80 text-muted-foreground group-hover:opacity-0 transition-opacity shrink-0">
          {blockTypeLabel[block.block_type]}
        </span>
      )}

      {/* Delete — appears on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm("Delete this block?")) onDelete();
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 rounded p-0.5 hover:bg-destructive/10"
        aria-label="Delete"
      >
        <Trash2 className="h-3 w-3 text-destructive" />
      </button>
    </div>
  );
}

function AddQuestionMenu({
  onAdd,
  pending,
}: {
  onAdd: (type: BlockType) => void;
  pending: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start text-[11px] h-7 text-muted-foreground hover:text-foreground hover:bg-muted/50"
          disabled={pending}
        >
          <Plus className="h-3 w-3 mr-1.5" />
          Add question
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="text-xs">Phase 1 (fully editable)</DropdownMenuLabel>
        {PHASE1_QUESTION_TYPES.map((t) => (
          <DropdownMenuItem key={t} onClick={() => onAdd(t)}>
            {blockTypeLabel[t]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">More types (basic config)</DropdownMenuLabel>
        {ALL_QUESTION_TYPES.filter((t) => !PHASE1_QUESTION_TYPES.includes(t)).map((t) => (
          <DropdownMenuItem key={t} onClick={() => onAdd(t)}>
            {blockTypeLabel[t]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------- Inspector ------------------------------------

function InspectorPane({
  template,
  blocks,
  selectedId,
  onSelect,
  onChanged,
}: {
  template: OrganizerTemplate;
  blocks: OrganizerBlock[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const upsert = useServerFn(upsertBlock);
  const reorderFn = useServerFn(reorderBlocks);

  // Independent expand/collapse set — decoupled from selectedId
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // When outline selects a block: expand it AND scroll to it
  useEffect(() => {
    if (!selectedId) return;
    setExpandedIds((prev) => {
      if (prev.has(selectedId)) return prev;
      const next = new Set(prev);
      next.add(selectedId);
      return next;
    });
    requestAnimationFrame(() => {
      document.getElementById(`block-edit-${selectedId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  }, [selectedId]);

  // Flat document order
  const orderedBlocks = useMemo(
    () =>
      buildDocumentOrder(blocks)
        .map((id) => blocks.find((b) => b.id === id))
        .filter((b): b is OrganizerBlock => !!b),
    [blocks],
  );

  // Palette drag → drop at position
  const handlePaletteDrop = useCallback(
    async (type: BlockType, dropIndex: number) => {
      let parentId: string | null = null;
      let insertBeforeId: string | null = null;

      if (dropIndex < orderedBlocks.length) {
        const ref = orderedBlocks[dropIndex];
        parentId = ref.parent_id;
        insertBeforeId = ref.id;
      } else if (orderedBlocks.length > 0) {
        parentId = orderedBlocks[orderedBlocks.length - 1].parent_id;
      }

      const siblings = blocks
        .filter((b) => b.parent_id === parentId)
        .sort((a, b) => a.order_index - b.order_index);

      const defaultText =
        type === "section"
          ? "New section"
          : type === "subsection"
            ? "New subsection"
            : type === "divider" || type === "info"
              ? ""
              : "New question";

      const res = await upsert({
        data: {
          template_id: template.id,
          parent_id: parentId,
          block_type: type,
          order_index: siblings.length,
          question_text: defaultText,
          config_json: {},
        },
      });

      // Move to the right position in siblings if not appending
      const insertIdx = insertBeforeId
        ? siblings.findIndex((b) => b.id === insertBeforeId)
        : siblings.length;

      if (insertIdx !== -1 && insertIdx < siblings.length) {
        const newOrder = [...siblings.slice(0, insertIdx), res.block, ...siblings.slice(insertIdx)];
        await reorderFn({
          data: {
            template_id: template.id,
            moves: newOrder.map((b, i) => ({
              id: b.id,
              parent_id: parentId,
              order_index: i,
            })),
          },
        });
      }

      onChanged();
      onSelect(res.block.id);
    },
    [blocks, orderedBlocks, template.id, upsert, reorderFn, onChanged, onSelect],
  );

  return (
    <div className="flex flex-col h-full">
      <div className="h-10 border-b border-border/50 px-3 flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Edit
        </span>
        <span className="text-[10px] text-muted-foreground flex-1">
          {orderedBlocks.length} block{orderedBlocks.length !== 1 ? "s" : ""}
        </span>
        <button
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
          onClick={() => setExpandedIds(new Set(orderedBlocks.map((b) => b.id)))}
          title="Expand all blocks"
        >
          Expand all
        </button>
        <span className="text-muted-foreground/40 text-[10px]">·</span>
        <button
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
          onClick={() => setExpandedIds(new Set())}
          title="Collapse all blocks"
        >
          Collapse all
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain scroll-smooth">
        <div className="px-3 py-3 pb-24">
          {orderedBlocks.length === 0 ? (
            <EditDropZone onDrop={(t) => void handlePaletteDrop(t, 0)} isEmpty />
          ) : (
            <>
              <EditDropZone onDrop={(t) => void handlePaletteDrop(t, 0)} />
              {orderedBlocks.map((block, index) => (
                <div key={block.id}>
                  <BlockEditorCard
                    block={block}
                    template={template}
                    allBlocks={blocks}
                    isSelected={block.id === selectedId}
                    isExpanded={expandedIds.has(block.id)}
                    onClick={() => {
                      onSelect(block.id);
                      setExpandedIds((prev) => {
                        const next = new Set(prev);
                        next.add(block.id);
                        return next;
                      });
                    }}
                    onCollapse={() =>
                      setExpandedIds((prev) => {
                        const next = new Set(prev);
                        next.delete(block.id);
                        return next;
                      })
                    }
                    onChanged={onChanged}
                  />
                  <EditDropZone onDrop={(t) => void handlePaletteDrop(t, index + 1)} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Drop zone ─────────────────────────────────────────────────────────────────
function EditDropZone({
  onDrop,
  isEmpty,
}: {
  onDrop: (type: BlockType) => void;
  isEmpty?: boolean;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={cn(
        "rounded-xl my-0.5 flex items-center justify-center transition-all duration-150",
        over
          ? "h-10 border-2 border-dashed border-primary/50 bg-primary/5"
          : isEmpty
            ? "h-16 border-2 border-dashed border-border/40 bg-muted/20"
            : "h-px my-0.5 hover:h-2 hover:bg-muted/30",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData("application/x-block-type") as BlockType;
        if (type) onDrop(type);
        setOver(false);
      }}
    >
      {(over || isEmpty) && (
        <span className="text-xs text-muted-foreground select-none">
          {over ? "Drop block here" : "Drag blocks from the palette"}
        </span>
      )}
    </div>
  );
}

// ── Block card (compact or expanded) ─────────────────────────────────────────
function BlockEditorCard({
  block,
  template,
  allBlocks,
  isSelected,
  isExpanded,
  onClick,
  onCollapse,
  onChanged,
}: {
  block: OrganizerBlock;
  template: OrganizerTemplate;
  allBlocks: OrganizerBlock[];
  isSelected: boolean;
  isExpanded: boolean;
  onClick: () => void;
  onCollapse: () => void;
  onChanged: () => void;
}) {
  const quickSave = useServerFn(upsertBlock);
  const isSection = block.block_type === "section";
  const isSubsection = block.block_type === "subsection";
  const indent = block.parent_id ? "ml-4" : "";
  const color = getBC(block.block_type);
  const isHidden = (block.config_json as Record<string, unknown>)?.hidden === true;
  const hasConditions =
    block.conditional_rules_json !== null && block.conditional_rules_json !== undefined;

  const toggleRequired = (e: React.MouseEvent) => {
    e.stopPropagation();
    void quickSave({
      data: {
        id: block.id,
        template_id: block.template_id,
        block_type: block.block_type,
        is_required: !block.is_required,
      },
    }).then(() => onChanged());
  };

  const toggleHidden = (e: React.MouseEvent) => {
    e.stopPropagation();
    void quickSave({
      data: {
        id: block.id,
        template_id: block.template_id,
        block_type: block.block_type,
        config_json: { ...(block.config_json as Record<string, unknown>), hidden: !isHidden },
      },
    }).then(() => onChanged());
  };

  // Header action buttons — shown on all block types (per user request)
  const HeaderControls = () => (
    <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
      {hasConditions && (
        <span title="Has conditional visibility rules" className="flex items-center">
          <Zap className="h-3 w-3 text-blue-500" />
        </span>
      )}
      <button
        onClick={toggleRequired}
        title={
          block.is_required
            ? "Required — click to make optional"
            : "Optional — click to make required"
        }
        className="p-0.5 rounded hover:bg-muted/60 transition-colors"
      >
        <Asterisk
          className={cn(
            "h-3 w-3",
            block.is_required ? "text-destructive" : "text-muted-foreground/30",
          )}
        />
      </button>
      <button
        onClick={toggleHidden}
        title={isHidden ? "Hidden from respondents — click to show" : "Visible — click to hide"}
        className="p-0.5 rounded hover:bg-muted/60 transition-colors"
      >
        {isHidden ? (
          <EyeOff className="h-3 w-3 text-amber-500" />
        ) : (
          <Eye className="h-3 w-3 text-muted-foreground/30" />
        )}
      </button>
    </div>
  );

  if (isSection || isSubsection) {
    return (
      <div
        id={`block-edit-${block.id}`}
        className={cn(
          "rounded-lg border border-l-4 transition-all mb-0.5 overflow-hidden",
          color.border,
          indent,
          isExpanded
            ? cn("bg-card shadow-sm", isSelected && cn("ring-1", color.ring))
            : cn(
                "border-t-transparent border-r-transparent border-b-transparent cursor-pointer",
                isSelected ? "bg-muted/40" : "bg-transparent hover:bg-muted/25",
              ),
          isHidden && "opacity-50 border-dashed",
        )}
        onClick={onClick}
      >
        {/* Header — always visible */}
        <div
          className="flex items-center gap-1.5 px-2 py-1"
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (isExpanded) onCollapse();
          }}
        >
          <span className={cn("h-1.5 w-1.5 rounded-sm shrink-0", color.dot)} />
          <span
            className={cn(
              "flex-1 truncate font-semibold leading-snug",
              isSection ? "text-xs" : "text-[11px]",
            )}
          >
            {block.question_text || (
              <span className="italic opacity-40">
                {isSection ? "Section title" : "Subsection title"}
              </span>
            )}
          </span>
          <HeaderControls />
          {isExpanded ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCollapse();
              }}
              className="shrink-0 text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted/60 transition-colors"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          ) : (
            <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
          )}
        </div>
        {isExpanded && (
          <div className="px-3 pb-3 pt-0 border-t border-border/40">
            <BlockEditor
              block={block}
              template={template}
              allBlocks={allBlocks}
              onSaved={onChanged}
            />
          </div>
        )}
      </div>
    );
  }

  // Question / other blocks
  return (
    <div
      id={`block-edit-${block.id}`}
      className={cn(
        "rounded-lg border-l-4 border border-t border-r border-b bg-card transition-all mb-0.5 overflow-hidden",
        color.border,
        indent,
        isExpanded
          ? cn("shadow-sm", isSelected ? cn("ring-1", color.ring) : "border-border/40")
          : cn(
              "border-t-border/40 border-r-border/40 border-b-border/40 cursor-pointer",
              isSelected ? "bg-muted/25" : "hover:border-border/60 hover:shadow-sm",
            ),
        isHidden && "opacity-50 border-dashed",
      )}
      onClick={onClick}
    >
      {/* Header row — always visible */}
      <div
        className={cn("flex items-center gap-2 px-2 py-1", isExpanded && "cursor-default")}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (isExpanded) onCollapse();
        }}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", color.dot)} />
        <span className="text-xs flex-1 truncate leading-snug">
          {block.question_text || <span className="italic opacity-40">Untitled</span>}
        </span>
        {block.is_required && <span className="text-destructive text-[10px] shrink-0">*</span>}
        <HeaderControls />
        <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0 leading-none">
          {blockTypeLabel[block.block_type]}
        </span>
        {isExpanded ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCollapse();
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted/60 transition-colors"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
        ) : (
          <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />
        )}
      </div>
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-border/40">
          <BlockEditor
            block={block}
            template={template}
            allBlocks={allBlocks}
            onSaved={onChanged}
          />
        </div>
      )}
    </div>
  );
}

function hasConfiguration(type: BlockType): boolean {
  return [
    "single_choice",
    "multi_choice",
    "short_text",
    "long_text",
    "number",
    "currency",
    "date",
    "date_range",
    "file_upload",
    "address",
    "rating",
    "matrix",
    "signature",
    "multi_file",
    "attachment_request",
    "calculated",
    "info",
  ].includes(type);
}

function BlockEditor({
  template,
  block,
  allBlocks,
  onSaved,
}: {
  template: OrganizerTemplate;
  block: OrganizerBlock;
  allBlocks: OrganizerBlock[];
  onSaved: () => void;
}) {
  const upsert = useServerFn(upsertBlock);
  const [draft, setDraft] = useState({
    question_text: block.question_text ?? "",
    help_text: block.help_text ?? "",
    is_required: block.is_required,
    config_json: block.config_json,
    conditional_rules_json: (block.conditional_rules_json as unknown as ConditionalRules) ?? null,
    scoring_json: (block.scoring_json as JsonObject | null) ?? null,
  });

  useEffect(() => {
    setDraft({
      question_text: block.question_text ?? "",
      help_text: block.help_text ?? "",
      is_required: block.is_required,
      config_json: block.config_json,
      conditional_rules_json: (block.conditional_rules_json as unknown as ConditionalRules) ?? null,
      scoring_json: (block.scoring_json as JsonObject | null) ?? null,
    });
  }, [
    block.id,
    block.question_text,
    block.help_text,
    block.is_required,
    block.config_json,
    block.conditional_rules_json,
    block.scoring_json,
  ]);

  const save = useMutation({
    mutationFn: (patch: Partial<typeof draft>) =>
      upsert({
        data: {
          id: block.id,
          template_id: template.id,
          block_type: block.block_type,
          ...patch,
        },
      }),
    onSuccess: () => onSaved(),
    onError: (e: Error) => toast.error(e.message),
  });

  const commit = (patch: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    save.mutate(patch);
  };

  // Splice a piping token into either question_text or help_text at the
  // current selection of the matching <input>/<textarea>. Falls back to
  // append when the field isn't focused.
  const insertToken = (field: "question_text" | "help_text", token: string) => {
    const el = document.getElementById(field === "question_text" ? "qtext" : "help") as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
    const current = draft[field] ?? "";
    let next: string;
    let nextCaret: number;
    if (el && document.activeElement === el) {
      const start = el.selectionStart ?? current.length;
      const end = el.selectionEnd ?? start;
      next = current.slice(0, start) + token + current.slice(end);
      nextCaret = start + token.length;
    } else {
      next = current ? `${current} ${token}` : token;
      nextCaret = next.length;
    }
    commit({ [field]: next } as Partial<typeof draft>);
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        try {
          el.setSelectionRange(nextCaret, nextCaret);
        } catch {
          // ignore — some browsers reject on detached nodes
        }
      });
    }
  };

  // Blocks referenceable by conditional rules. To prevent cycles we enforce
  // strict document order: only blocks that appear *before* the current block
  // in the rendered outline (parents → children, order_index ascending) are
  // valid sources. Sections + subsections are valid sources too (cascade).
  // Info blocks and the current block itself are always excluded.
  const documentOrder = buildDocumentOrder(allBlocks);
  const myPos = documentOrder.indexOf(block.id);
  const candidateRefs = allBlocks.filter((b) => {
    if (b.id === block.id) return false;
    if (b.block_type === "info" || b.block_type === "divider") return false;
    const pos = documentOrder.indexOf(b.id);
    return pos !== -1 && pos < myPos;
  });

  const cfg = draft.config_json;
  const setCfg = (patch: JsonObject) => commit({ config_json: { ...cfg, ...patch } });

  return (
    <div className="space-y-0">
      {/* ══ Content ══════════════════════════════════════════ */}
      <InspectorSection label="Content">
        <div className="space-y-2">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs font-medium" htmlFor="qtext">
                {block.block_type === "section" ? "Section title" : "Question text"}
              </Label>
              {block.block_type !== "section" && (
                <PipingTokenPicker
                  candidates={candidateRefs}
                  onInsert={(token) => insertToken("question_text", token)}
                  size="icon"
                  label="Insert answer from a previous question"
                />
              )}
            </div>
            <Input
              id="qtext"
              value={draft.question_text}
              onChange={(e) => setDraft((d) => ({ ...d, question_text: e.target.value }))}
              onBlur={() => commit({ question_text: draft.question_text })}
              maxLength={2000}
              className="text-sm"
            />
          </div>

          {block.block_type !== "section" && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs font-medium" htmlFor="help">
                    Help text
                  </Label>
                  <PipingTokenPicker
                    candidates={candidateRefs}
                    onInsert={(token) => insertToken("help_text", token)}
                    size="icon"
                    label="Insert answer from a previous question"
                  />
                </div>
                <Textarea
                  id="help"
                  value={draft.help_text}
                  onChange={(e) => setDraft((d) => ({ ...d, help_text: e.target.value }))}
                  onBlur={() => commit({ help_text: draft.help_text })}
                  rows={2}
                  maxLength={2000}
                  className="text-sm resize-none"
                  placeholder="Optional — shown below the question as guidance"
                />
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer group">
                <Checkbox
                  checked={draft.is_required}
                  onCheckedChange={(c) => commit({ is_required: c === true })}
                  className="rounded-md"
                />
                <div>
                  <span className="text-sm font-medium">Required</span>
                  <p className="text-xs text-muted-foreground">
                    Respondent must answer before submitting
                  </p>
                </div>
              </label>
            </>
          )}
        </div>
      </InspectorSection>

      {/* ══ Configuration ═══════════════════════════════════════════ */}
      {hasConfiguration(block.block_type) && (
        <InspectorSection label="Configuration">
          <div className="space-y-2">
            {(block.block_type === "single_choice" || block.block_type === "multi_choice") && (
              <ChoiceOptionsEditor
                config={draft.config_json}
                onCommit={(c) => commit({ config_json: c })}
              />
            )}

            {(block.block_type === "short_text" || block.block_type === "long_text") && (
              <div>
                <Label htmlFor="placeholder">Placeholder</Label>
                <Input
                  id="placeholder"
                  value={typeof cfg.placeholder === "string" ? cfg.placeholder : ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      config_json: { ...d.config_json, placeholder: e.target.value },
                    }))
                  }
                  onBlur={() => commit({ config_json: draft.config_json })}
                />
              </div>
            )}

            {(block.block_type === "number" || block.block_type === "currency") && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label>Min</Label>
                  <Input
                    type="number"
                    value={typeof cfg.min === "number" ? cfg.min : ""}
                    onChange={(e) =>
                      setCfg({
                        min: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Max</Label>
                  <Input
                    type="number"
                    value={typeof cfg.max === "number" ? cfg.max : ""}
                    onChange={(e) =>
                      setCfg({
                        max: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                {block.block_type === "currency" && (
                  <div>
                    <Label>Currency</Label>
                    <Input
                      value={typeof cfg.currencyCode === "string" ? cfg.currencyCode : "USD"}
                      maxLength={3}
                      onChange={(e) => setCfg({ currencyCode: e.target.value.toUpperCase() })}
                    />
                  </div>
                )}
              </div>
            )}

            {(block.block_type === "date" || block.block_type === "date_range") && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Earliest date</Label>
                  <Input
                    type="date"
                    value={typeof cfg.minDate === "string" ? cfg.minDate : ""}
                    onChange={(e) => setCfg({ minDate: e.target.value || null })}
                  />
                </div>
                <div>
                  <Label>Latest date</Label>
                  <Input
                    type="date"
                    value={typeof cfg.maxDate === "string" ? cfg.maxDate : ""}
                    onChange={(e) => setCfg({ maxDate: e.target.value || null })}
                  />
                </div>
              </div>
            )}

            {block.block_type === "file_upload" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Max files</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={typeof cfg.maxFiles === "number" ? cfg.maxFiles : 5}
                    onChange={(e) => setCfg({ maxFiles: Math.max(1, Number(e.target.value || 1)) })}
                  />
                </div>
                <div>
                  <Label>Max size (MB)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={typeof cfg.maxSizeMb === "number" ? cfg.maxSizeMb : 25}
                    onChange={(e) =>
                      setCfg({ maxSizeMb: Math.max(1, Number(e.target.value || 1)) })
                    }
                  />
                </div>
                <div className="col-span-2">
                  <Label>Accepted types (comma-separated, e.g. .pdf,.jpg)</Label>
                  <Input
                    value={Array.isArray(cfg.accept) ? (cfg.accept as string[]).join(",") : ""}
                    onChange={(e) =>
                      setCfg({
                        accept: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean) as never,
                      })
                    }
                  />
                </div>
              </div>
            )}

            {block.block_type === "signature" && (
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={cfg.requireTypedName === true}
                  onCheckedChange={(c) => setCfg({ requireTypedName: c === true })}
                />
                <span className="text-sm">Require typed full name</span>
              </label>
            )}

            {block.block_type === "address" && (
              <div>
                <Label>Country preset</Label>
                <Select
                  value={typeof cfg.country === "string" ? cfg.country : "any"}
                  onValueChange={(v) => setCfg({ country: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="US">United States</SelectItem>
                    <SelectItem value="IN">India</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {block.block_type === "rating" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Scale max</Label>
                  <Input
                    type="number"
                    min={2}
                    max={10}
                    value={typeof cfg.max === "number" ? cfg.max : 5}
                    onChange={(e) =>
                      setCfg({ max: Math.min(10, Math.max(2, Number(e.target.value) || 5)) })
                    }
                  />
                </div>
                <div>
                  <Label>Icon</Label>
                  <Select
                    value={typeof cfg.icon === "string" ? cfg.icon : "star"}
                    onValueChange={(v) => setCfg({ icon: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="star">Stars</SelectItem>
                      <SelectItem value="number">Numbers</SelectItem>
                      <SelectItem value="heart">Hearts</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {block.block_type === "attachment_request" && (
              <div className="space-y-2">
                <Label>Documents requested (comma-separated)</Label>
                <Input
                  value={typeof cfg.documents === "string" ? cfg.documents : ""}
                  onChange={(e) => setCfg({ documents: e.target.value })}
                  placeholder="W-2, 1099-INT, Last year's return"
                />
                <p className="text-xs text-muted-foreground">
                  Reviewers see this as a checklist; the respondent uploads each item into the
                  deployment file thread.
                </p>
              </div>
            )}

            {block.block_type === "matrix" && (
              <MatrixConfigEditor config={cfg} onCommit={(next) => commit({ config_json: next })} />
            )}

            {block.block_type === "signature" && (
              <SignatureConfigEditor
                config={cfg}
                onCommit={(next) => commit({ config_json: next })}
              />
            )}

            {block.block_type === "multi_file" && (
              <MultiFileConfigEditor
                config={cfg}
                onCommit={(next) => commit({ config_json: next })}
              />
            )}

            {block.block_type === "calculated" && (
              <CalculatedConfigEditor
                config={cfg}
                candidateBlocks={candidateRefs
                  .filter((b) =>
                    ["number", "currency", "calculated", "rating"].includes(b.block_type),
                  )
                  .map((b) => ({
                    id: b.id,
                    label: b.question_text ?? blockTypeLabel[b.block_type],
                  }))}
                onCommit={(next) => commit({ config_json: next })}
              />
            )}

            {block.block_type === "divider" && (
              <p className="text-xs italic text-muted-foreground">
                Renders a horizontal divider in the wizard. No respondent input.
              </p>
            )}

            {block.block_type === "info" && (
              <div>
                <Label className="text-xs font-medium">Info content (markdown allowed)</Label>
                <Textarea
                  rows={4}
                  className="mt-1.5 text-sm resize-none"
                  value={typeof cfg.body === "string" ? cfg.body : ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      config_json: { ...d.config_json, body: e.target.value },
                    }))
                  }
                  onBlur={() => commit({ config_json: draft.config_json })}
                />
              </div>
            )}
          </div>
        </InspectorSection>
      )}

      {/* ══ Conditional Logic ════════════════════════════════════════ */}
      {block.block_type !== "info" && (
        <InspectorSection label={`Show when…`}>
          {candidateRefs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No earlier questions exist yet. Add more questions to enable conditional visibility.
            </p>
          ) : (
            <ConditionalRuleBuilder
              value={draft.conditional_rules_json}
              onChange={(next) => commit({ conditional_rules_json: next })}
              candidateBlocks={candidateRefs}
            />
          )}
        </InspectorSection>
      )}

      {/* ══ Scoring (exam) ═══════════════════════════════════════════ */}
      {template.is_exam && block.block_type !== "section" && block.block_type !== "info" && (
        <InspectorSection label="Scoring">
          <ScoringEditor
            block={block}
            value={draft.scoring_json}
            onCommit={(s) => commit({ scoring_json: s })}
          />
        </InspectorSection>
      )}
    </div>
  );
}

function ScoringEditor({
  block,
  value,
  onCommit,
}: {
  block: OrganizerBlock;
  value: JsonObject | null;
  onCommit: (next: JsonObject | null) => void;
}) {
  const v = value ?? {};
  const points = typeof v.points === "number" ? v.points : 1;
  const correct = v.correctAnswer;

  const opts = Array.isArray((block.config_json as JsonObject).options)
    ? ((block.config_json as JsonObject).options as unknown as Array<{
        id: string;
        label: string;
      }>)
    : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Points</Label>
          <Input
            type="number"
            min={0}
            value={points}
            onChange={(e) => onCommit({ ...v, points: Math.max(0, Number(e.target.value || 0)) })}
          />
        </div>
        <div>
          <Label>Correct answer</Label>
          {block.block_type === "yes_no" ? (
            <Select
              value={correct === true ? "true" : correct === false ? "false" : ""}
              onValueChange={(s) => onCommit({ ...v, correctAnswer: s === "true" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          ) : block.block_type === "single_choice" ? (
            <Select
              value={typeof correct === "string" ? correct : ""}
              onValueChange={(s) => onCommit({ ...v, correctAnswer: s })}
            >
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {opts.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : block.block_type === "multi_choice" ? (
            <div className="text-xs text-muted-foreground">
              Set per-option points below; total = sum of selected.
            </div>
          ) : block.block_type === "number" || block.block_type === "currency" ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Min</Label>
                <Input
                  type="number"
                  value={typeof v.min === "number" ? v.min : ""}
                  onChange={(e) =>
                    onCommit({
                      ...v,
                      min: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Max</Label>
                <Input
                  type="number"
                  value={typeof v.max === "number" ? v.max : ""}
                  onChange={(e) =>
                    onCommit({
                      ...v,
                      max: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          ) : (
            <Input
              value={typeof correct === "string" ? correct : ""}
              onChange={(e) => onCommit({ ...v, correctAnswer: e.target.value })}
              placeholder="Expected text/value"
            />
          )}
        </div>
      </div>

      {block.block_type === "multi_choice" && opts.length > 0 && (
        <div className="border-t pt-3 space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Per-option points
          </Label>
          {opts.map((o) => {
            const pts = (v.optionPoints as Record<string, number> | undefined) ?? {};
            return (
              <div key={o.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm truncate">{o.label}</span>
                <Input
                  type="number"
                  className="w-20 h-7"
                  value={pts[o.id] ?? 0}
                  onChange={(e) =>
                    onCommit({
                      ...v,
                      optionPoints: {
                        ...pts,
                        [o.id]: Number(e.target.value) || 0,
                      },
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      {value !== null && (
        <button className="text-xs text-muted-foreground underline" onClick={() => onCommit(null)}>
          Clear scoring for this question
        </button>
      )}
    </div>
  );
}

/**
 * Build a flat document-order list of block IDs by walking the outline:
 * top-level sections (sorted by order_index), each followed by its children
 * (recursively); then top-level orphans (non-section blocks without a parent).
 * Used by the conditional-rule builder to enforce "earlier-only" references.
 */
function buildDocumentOrder(blocks: OrganizerBlock[]): string[] {
  const childrenBy = new Map<string, OrganizerBlock[]>();
  for (const b of blocks) {
    if (b.parent_id) {
      const arr = childrenBy.get(b.parent_id) ?? [];
      arr.push(b);
      childrenBy.set(b.parent_id, arr);
    }
  }
  childrenBy.forEach((arr) => arr.sort((a, b) => a.order_index - b.order_index));

  const order: string[] = [];
  const visit = (b: OrganizerBlock) => {
    order.push(b.id);
    for (const child of childrenBy.get(b.id) ?? []) visit(child);
  };

  const topLevel = blocks.filter((b) => !b.parent_id).sort((a, b) => a.order_index - b.order_index);
  for (const b of topLevel) visit(b);
  return order;
}

// ── Shared inspector section wrapper ─────────────────────────────────────────
function InspectorSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pt-3 first:pt-0">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
          {label}
        </span>
        <div className="flex-1 h-px bg-border/60" />
      </div>
      {children}
    </div>
  );
}

function defaultChoiceConfig(): JsonObject {
  return {
    options: [
      { id: crypto.randomUUID(), label: "Option 1", value: "1" },
      { id: crypto.randomUUID(), label: "Option 2", value: "2" },
    ],
    layout: "radio",
  };
}

interface ChoiceOption {
  id: string;
  label: string;
  value: string;
}

function ChoiceOptionsEditor({
  config,
  onCommit,
}: {
  config: JsonObject;
  onCommit: (cfg: JsonObject) => void;
}) {
  const opts: ChoiceOption[] = Array.isArray(config.options)
    ? (config.options as unknown as ChoiceOption[])
    : [];
  const layout = typeof config.layout === "string" ? config.layout : "radio";

  const writeOpts = (next: ChoiceOption[]) => onCommit({ ...config, options: next as never });

  return (
    <div className="space-y-2">
      <Label>Options</Label>
      <div className="space-y-2">
        {opts.map((o, i) => (
          <div key={o.id} className="flex items-center gap-2">
            <Input
              value={o.label}
              onChange={(e) => {
                const next = [...opts];
                next[i] = { ...o, label: e.target.value, value: e.target.value };
                writeOpts(next);
              }}
              placeholder={`Option ${i + 1}`}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => writeOpts(opts.filter((_, j) => j !== i))}
              aria-label="Remove"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            writeOpts([
              ...opts,
              {
                id: crypto.randomUUID(),
                label: `Option ${opts.length + 1}`,
                value: String(opts.length + 1),
              },
            ])
          }
        >
          <Plus className="h-3 w-3 mr-1" />
          Add option
        </Button>
        <Select value={layout} onValueChange={(v) => onCommit({ ...config, layout: v })}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="radio">Radio</SelectItem>
            <SelectItem value="dropdown">Dropdown</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
