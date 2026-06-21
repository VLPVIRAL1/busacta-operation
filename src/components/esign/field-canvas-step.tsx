import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceAround,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalSpaceAround,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Calendar,
  CheckSquare,
  Loader2,
  Mail,
  MoveHorizontal,
  MoveVertical,
  PenLine,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { supabase } from "@/integrations/supabase/client";
import { getEnvelopeOverview, upsertPageLayout } from "@/lib/esign/envelopes.functions";
import { deleteField, listFields, upsertField } from "@/lib/esign/builder.functions";
import type {
  ConditionalOperator,
  FieldChoice,
  FieldConditional,
  FieldOptions,
  FieldType,
} from "@/lib/esign/schemas";
import { conditionalOperators } from "@/lib/esign/schemas";
import {
  computeAutoLayout,
  inferOrigin,
  inferSequence,
  type Orientation,
} from "@/lib/esign/auto-arrange";
import { type PageSize } from "./pdf-page";
import { LazyPdfPage } from "./lazy-pdf-page";
import {
  useEsignPdfViewer,
  EsignPdfViewerToolbar,
  PDF_VIEWER_SHORTCUTS,
  PageThumbnailRail,
  ThumbnailToggleButton,
} from "./pdf-viewer-controls";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Keyboard } from "lucide-react";

type PlacedField = {
  id?: string;
  envelope_id: string;
  document_id: string;
  recipient_id: string;
  field_type: FieldType;
  page_index: number;
  x_pt: number;
  y_pt: number;
  width_pt: number;
  height_pt: number;
  is_required: boolean;
  default_value: string | null;
  options_json: FieldOptions | null;
  conditional_json: FieldConditional | null;
  tab_order: number | null;
};

const PALETTE: Array<{
  type: FieldType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  w: number;
  h: number;
}> = [
  { type: "signature", label: "Signature", icon: PenLine, w: 0.18, h: 0.05 },
  { type: "initials", label: "Initials", icon: PenLine, w: 0.08, h: 0.04 },
  { type: "date_signed", label: "Date", icon: Calendar, w: 0.12, h: 0.03 },
  { type: "name", label: "Name", icon: User, w: 0.18, h: 0.03 },
  { type: "email", label: "Email", icon: Mail, w: 0.2, h: 0.03 },
  { type: "text", label: "Text", icon: TypeIcon, w: 0.15, h: 0.03 },
  { type: "checkbox", label: "Checkbox", icon: CheckSquare, w: 0.025, h: 0.025 },
  { type: "radio", label: "Choice", icon: CheckSquare, w: 0.15, h: 0.03 },
  { type: "signer_id_document", label: "ID Upload", icon: BadgeCheck, w: 0.22, h: 0.06 },
];

export function FieldCanvasStep({
  envelopeId,
  onBack,
  onNext,
}: {
  envelopeId: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const qc = useQueryClient();
  const overview = useServerFn(getEnvelopeOverview);
  const listFn = useServerFn(listFields);
  const upsertFn = useServerFn(upsertField);
  const deleteFn = useServerFn(deleteField);

  const ovQ = useQuery({
    queryKey: ["esign", "envelope", envelopeId],
    queryFn: () => overview({ data: { envelope_id: envelopeId } }),
  });
  const fieldsQ = useQuery({
    queryKey: ["esign", "fields", envelopeId],
    queryFn: () => listFn({ data: { envelope_id: envelopeId } }),
  });

  const documents = ovQ.data?.documents ?? [];
  const recipients = ovQ.data?.recipients ?? [];

  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [activeRecipientId, setActiveRecipientId] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // Per-page sizes for the currently active doc. Keyed by page index.
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [firstPageReady, setFirstPageReady] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [thumbsOpen, setThumbsOpen] = useState(true);
  // Marquee selection — page-local rect (normalized 0..1) while drawing.
  const [marquee, setMarquee] = useState<{
    pageIndex: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    additive: boolean;
  } | null>(null);

  const selectField = useCallback((id: string, mods: { shift: boolean; meta: boolean }) => {
    setSelectedIds((prev) => {
      if (mods.shift || mods.meta) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      if (prev.size === 1 && prev.has(id)) return prev;
      return new Set([id]);
    });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // initialize active doc and recipient
  useEffect(() => {
    if (!activeDocId && documents.length > 0) setActiveDocId(documents[0].id);
  }, [documents, activeDocId]);
  useEffect(() => {
    if (!activeRecipientId && recipients.length > 0) {
      const firstSigner = recipients.find((r) => r.role === "signer") ?? recipients[0];
      setActiveRecipientId(firstSigner.id);
    }
  }, [recipients, activeRecipientId]);

  // sign URL for active doc — reset per-doc state.
  useEffect(() => {
    if (!activeDocId) return;
    const doc = documents.find((d) => d.id === activeDocId);
    if (!doc) return;
    setPdfUrl(null);
    setPageSizes({});
    setTotalPages(1);
    setFirstPageReady(false);
    (async () => {
      const { data, error } = await supabase.storage
        .from("esign-source")
        .createSignedUrl(doc.source_path, 3600);
      if (error) {
        toast.error(`Could not load document: ${error.message}`);
        return;
      }
      setPdfUrl(data.signedUrl);
    })();
  }, [activeDocId, documents]);

  const pageReady = firstPageReady;

  const fields = (fieldsQ.data?.fields ?? []) as PlacedField[];
  const fieldsByPage = useMemo(() => {
    const m = new Map<number, PlacedField[]>();
    for (const f of fields) {
      if (f.document_id !== activeDocId) continue;
      const list = m.get(f.page_index) ?? [];
      list.push(f);
      m.set(f.page_index, list);
    }
    return m;
  }, [fields, activeDocId]);

  const recipientById = useMemo(() => {
    const map = new Map<string, { color_hex: string; full_name: string }>();
    for (const r of recipients) map.set(r.id, { color_hex: r.color_hex, full_name: r.full_name });
    return map;
  }, [recipients]);

  const upsertMut = useMutation({
    mutationFn: (f: PlacedField) => upsertFn({ data: f }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["esign", "fields", envelopeId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { field_id: id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["esign", "fields", envelopeId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // ---------- Auto-Arrange engine ----------
  const upsertLayoutFn = useServerFn(upsertPageLayout);
  const [autoOrientation, setAutoOrientation] = useState<Orientation>("horizontal");
  const autoArrangeMut = useMutation({
    mutationFn: async (args: { pageIndex: number; orientation: Orientation }) => {
      if (!activeDocId || !activeRecipientId) {
        throw new Error("Pick a recipient and document first");
      }
      const block = fields.filter(
        (f) =>
          f.document_id === activeDocId &&
          f.recipient_id === activeRecipientId &&
          f.page_index === args.pageIndex,
      );
      if (block.length === 0) {
        throw new Error("No fields for this recipient on this page");
      }
      const sequence = inferSequence(block, args.orientation);
      const origin = inferOrigin(block);
      const computed = computeAutoLayout(sequence, {
        orientation: args.orientation,
        origin,
      });
      // Persist new coordinates for every field in the block.
      await Promise.all(
        sequence.map((f, i) =>
          upsertFn({
            data: {
              ...f,
              x_pt: computed[i].x_pt,
              y_pt: computed[i].y_pt,
              width_pt: computed[i].width_pt,
              height_pt: computed[i].height_pt,
            },
          }),
        ),
      );
      // Persist the per-(page × recipient) layout block so reloads remember
      // the auto state and reading order.
      await upsertLayoutFn({
        data: {
          envelope_id: envelopeId,
          document_id: activeDocId,
          page_index: args.pageIndex,
          recipient_id: activeRecipientId,
          mode: "auto",
          orientation: args.orientation,
          sequence: sequence.map((f) => f.id).filter((id): id is string => !!id),
          origin_x_pt: origin.x,
          origin_y_pt: origin.y,
          spacing_pt: 12,
        },
      });
      return { count: block.length };
    },
    onSuccess: (r) => {
      toast.success(
        `Aligned ${r.count} field${r.count === 1 ? "" : "s"} (${autoOrientation === "horizontal" ? "horizontal" : "vertical"})`,
      );
      qc.invalidateQueries({ queryKey: ["esign", "fields", envelopeId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Per-page DOM refs so drops / drags use the exact page rect.
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const setPageRef = (idx: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(idx, el);
    else pageRefs.current.delete(idx);
  };

  // PDF Reader-style controls (zoom, page nav, keyboard shortcuts).
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const firstSizeForAspect = pageSizes[0];
  const pageAspect =
    firstSizeForAspect && firstSizeForAspect.width > 0
      ? firstSizeForAspect.height / firstSizeForAspect.width
      : 1.294;
  const viewer = useEsignPdfViewer({
    scrollRef,
    pageRefs: pageRefs as { current: Map<number, HTMLElement | null> },
    pageCount: totalPages,
    pageAspect,
    enabled: !!pdfUrl,
  });

  // Snap to a 4-unit grid (in PDF pt). Width here is normalized 0..1, so
  // 4pt over a ~612pt-wide page is ~0.0065 — gives just enough alignment
  // without feeling sticky.
  const SNAP = 4 / 612;
  const snap = (v: number) => (snapEnabled ? Math.round(v / SNAP) * SNAP : v);

  function placeField(
    type: FieldType,
    palette: (typeof PALETTE)[number],
    pageIndex: number,
    clientX: number,
    clientY: number,
  ) {
    const pageEl = pageRefs.current.get(pageIndex);
    if (!pageEl || !activeDocId || !activeRecipientId || !pageReady) return;
    const rect = pageEl.getBoundingClientRect();
    // Drop anchored at top-left of cursor (matches DocuSign/Adobe Sign), so
    // the box lands EXACTLY where the user releases — no center offset.
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    upsertMut.mutate({
      envelope_id: envelopeId,
      document_id: activeDocId,
      recipient_id: activeRecipientId,
      field_type: type,
      page_index: pageIndex,
      x_pt: snap(Math.max(0, Math.min(1 - palette.w, x))),
      y_pt: snap(Math.max(0, Math.min(1 - palette.h, y))),
      width_pt: palette.w,
      height_pt: palette.h,
      is_required: true,
      default_value: null,
      options_json: null,
      conditional_json: null,
      tab_order: null,
    });
  }

  function onPageDrop(pageIndex: number, e: React.DragEvent) {
    e.preventDefault();
    if (!pageReady) return;
    const type = e.dataTransfer.getData("text/x-esign-field-type") as FieldType;
    if (!type) return;
    const pdef = PALETTE.find((p) => p.type === type);
    if (!pdef) return;
    placeField(type, pdef, pageIndex, e.clientX, e.clientY);
  }

  function moveField(field: PlacedField, dx: number, dy: number) {
    const pageEl = pageRefs.current.get(field.page_index);
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    const rawX = field.x_pt + dx / rect.width;
    const rawY = field.y_pt + dy / rect.height;
    const newX = snap(Math.max(0, Math.min(1 - field.width_pt, rawX)));
    const newY = snap(Math.max(0, Math.min(1 - field.height_pt, rawY)));
    if (newX === field.x_pt && newY === field.y_pt) return;
    upsertMut.mutate({ ...field, x_pt: newX, y_pt: newY });
  }

  function resizeField(field: PlacedField, dw: number, dh: number) {
    const pageEl = pageRefs.current.get(field.page_index);
    if (!pageEl) return;
    const rect = pageEl.getBoundingClientRect();
    // Convert px delta to normalized.
    const rawW = field.width_pt + dw / rect.width;
    const rawH = field.height_pt + dh / rect.height;
    // Minimum 24px footprint so the box stays usable.
    const minW = 24 / rect.width;
    const minH = 18 / rect.height;
    const newW = snap(Math.max(minW, Math.min(1 - field.x_pt, rawW)));
    const newH = snap(Math.max(minH, Math.min(1 - field.y_pt, rawH)));
    if (newW === field.width_pt && newH === field.height_pt) return;
    upsertMut.mutate({ ...field, width_pt: newW, height_pt: newH });
  }

  const selectedFields = useMemo(
    () => fields.filter((f) => f.id && selectedIds.has(f.id)),
    [fields, selectedIds],
  );
  const selectedField = selectedFields.length === 1 ? selectedFields[0] : null;
  const selectionMode: "empty" | "single" | "multi" =
    selectedFields.length === 0 ? "empty" : selectedFields.length === 1 ? "single" : "multi";

  // keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tgt = e.target as HTMLElement | null;
      const tag = tgt?.tagName;
      const editable =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tgt?.isContentEditable;
      if (e.key === "?" && !editable) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if ((e.key === "t" || e.key === "T") && !editable && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setThumbsOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && !editable) {
        clearSelection();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A") && !editable) {
        e.preventDefault();
        setSelectedIds(
          new Set(fields.filter((f) => f.document_id === activeDocId && f.id).map((f) => f.id!)),
        );
        return;
      }
      if (selectedFields.length === 0) return;
      if ((e.key === "Delete" || e.key === "Backspace") && !editable) {
        e.preventDefault();
        for (const f of selectedFields) if (f.id) deleteMut.mutate(f.id);
        clearSelection();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedFields, deleteMut, fields, activeDocId, clearSelection]);

  if (ovQ.isLoading) return <Skeleton className="h-[500px] w-full" />;
  if (documents.length === 0) {
    return <div className="text-sm text-muted-foreground">Add a document first.</div>;
  }
  if (recipients.length === 0) {
    return <div className="text-sm text-muted-foreground">Add recipients first.</div>;
  }

  const activeRecipientColor =
    recipients.find((r) => r.id === activeRecipientId)?.color_hex ?? "#4f46e5";
  const firstSize = pageSizes[0];
  const fallbackSize: PageSize = firstSize ?? { width: 800, height: 800 * 1.294 };

  return (
    <div className="flex flex-col h-full min-h-0">
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0 border rounded-md">
        {/* Palette */}
        <ResizablePanel defaultSize={18} minSize={14}>
          <div className="h-full overflow-y-auto p-3 space-y-3 bg-muted/20">
            <div>
              <Label className="text-xs">Assign to</Label>
              <Select value={activeRecipientId} onValueChange={setActiveRecipientId}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {recipients.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: r.color_hex }}
                        />
                        {r.full_name || r.email}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={pageReady ? "" : "esign-canvas-locked"}>
              <div className="text-xs font-medium text-muted-foreground uppercase mb-2">Fields</div>
              <ul className="grid grid-cols-2 gap-1.5" aria-disabled={!pageReady}>
                {PALETTE.map((p) => {
                  const Icon = p.icon;
                  return (
                    <li
                      key={p.type}
                      draggable={pageReady}
                      onDragStart={(e) => {
                        if (!pageReady) {
                          e.preventDefault();
                          return;
                        }
                        e.dataTransfer.setData("text/x-esign-field-type", p.type);
                      }}
                      className="border rounded-md p-2 flex flex-col items-center gap-1 cursor-grab active:cursor-grabbing hover:bg-accent text-xs"
                      title={
                        pageReady
                          ? `Drag ${p.label} onto the page`
                          : "Wait for the page to finish loading…"
                      }
                    >
                      <Icon className="h-4 w-4" />
                      <span>{p.label}</span>
                    </li>
                  );
                })}
              </ul>
              {!pageReady && (
                <p className="mt-2 text-[10px] text-muted-foreground">Preparing page…</p>
              )}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />

        {/* Canvas */}
        <ResizablePanel defaultSize={58}>
          <div className="h-full flex flex-col">
            {/* Doc tabs */}
            {documents.length > 1 && (
              <div className="border-b px-2 flex flex-wrap gap-1 bg-muted/30">
                {documents.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setActiveDocId(d.id)}
                    className={
                      "px-3 py-1.5 text-xs border-b-2 -mb-px " +
                      (activeDocId === d.id
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground")
                    }
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            )}
            {/* Toolbar */}
            <div className="px-3 py-1.5 border-b flex items-center gap-3 bg-background flex-wrap">
              <ThumbnailToggleButton open={thumbsOpen} onToggle={() => setThumbsOpen((v) => !v)} />
              <EsignPdfViewerToolbar viewer={viewer} pageCount={totalPages} />
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <Switch
                  checked={snapEnabled}
                  onCheckedChange={setSnapEnabled}
                  aria-label="Snap to grid"
                />
                <span>Snap {snapEnabled ? "4pt" : "off"}</span>
              </label>
              <div className="h-5 w-px bg-border" />
              {/* Auto-Arrange: snaps the active recipient's fields on the
                  current page into a clean H/V row, persists the per-page
                  layout block so reloads stay aligned. */}
              <div className="flex items-center gap-1">
                <div className="inline-flex rounded-md border bg-background overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAutoOrientation("horizontal")}
                    title="Horizontal row"
                    aria-label="Horizontal row"
                    aria-pressed={autoOrientation === "horizontal"}
                    className={
                      "h-7 px-2 text-xs flex items-center gap-1 " +
                      (autoOrientation === "horizontal"
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/40")
                    }
                  >
                    <AlignHorizontalSpaceAround className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoOrientation("vertical")}
                    title="Vertical stack"
                    aria-label="Vertical stack"
                    aria-pressed={autoOrientation === "vertical"}
                    className={
                      "h-7 px-2 text-xs flex items-center gap-1 border-l " +
                      (autoOrientation === "vertical"
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/40")
                    }
                  >
                    <AlignVerticalSpaceAround className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7"
                  disabled={autoArrangeMut.isPending || !activeRecipientId || !activeDocId}
                  onClick={() =>
                    autoArrangeMut.mutate({
                      pageIndex: viewer.currentPage,
                      orientation: autoOrientation,
                    })
                  }
                  title={`Auto-arrange this recipient's fields on page ${viewer.currentPage + 1}`}
                >
                  {autoArrangeMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Auto-arrange
                </Button>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 ml-auto"
                onClick={() => setHelpOpen(true)}
                title="Keyboard shortcuts (?)"
                aria-label="Keyboard shortcuts"
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 flex min-h-0">
              {thumbsOpen && (
                <PageThumbnailRail
                  url={pdfUrl}
                  pageCount={totalPages}
                  pageSizes={pageSizes}
                  viewer={viewer}
                />
              )}
              {/* PDF — continuous scroll */}
              <div ref={scrollRef} className="flex-1 overflow-auto bg-muted/30 p-4">
                {pdfUrl ? (
                  <div className="flex flex-col items-center gap-4">
                    {Array.from({ length: totalPages }).map((_, pageIndex) => {
                      const thisPageSize: PageSize = pageSizes[pageIndex] ?? fallbackSize;
                      const pageFields = fieldsByPage.get(pageIndex) ?? [];
                      return (
                        <div
                          key={`${activeDocId}-${pageIndex}`}
                          ref={(el) => setPageRef(pageIndex, el)}
                          className="relative shadow-md bg-white select-none"
                          style={{ width: thisPageSize.width, maxWidth: "100%" }}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => onPageDrop(pageIndex, e)}
                          onMouseDown={(e) => {
                            // Only start marquee on bare-page mousedown (not on a field chip).
                            if ((e.target as HTMLElement).closest("[data-field-chip]")) return;
                            if (e.button !== 0) return;
                            const pageEl = pageRefs.current.get(pageIndex);
                            if (!pageEl) return;
                            const rect = pageEl.getBoundingClientRect();
                            const x = (e.clientX - rect.left) / rect.width;
                            const y = (e.clientY - rect.top) / rect.height;
                            setMarquee({
                              pageIndex,
                              x0: x,
                              y0: y,
                              x1: x,
                              y1: y,
                              additive: e.shiftKey || e.metaKey || e.ctrlKey,
                            });
                            if (!(e.shiftKey || e.metaKey || e.ctrlKey)) clearSelection();
                          }}
                          onMouseMove={(e) => {
                            if (!marquee || marquee.pageIndex !== pageIndex) return;
                            const pageEl = pageRefs.current.get(pageIndex);
                            if (!pageEl) return;
                            const rect = pageEl.getBoundingClientRect();
                            const x = Math.max(
                              0,
                              Math.min(1, (e.clientX - rect.left) / rect.width),
                            );
                            const y = Math.max(
                              0,
                              Math.min(1, (e.clientY - rect.top) / rect.height),
                            );
                            setMarquee((m) => (m ? { ...m, x1: x, y1: y } : m));
                          }}
                          onMouseUp={() => {
                            if (!marquee || marquee.pageIndex !== pageIndex) return;
                            const x0 = Math.min(marquee.x0, marquee.x1);
                            const x1 = Math.max(marquee.x0, marquee.x1);
                            const y0 = Math.min(marquee.y0, marquee.y1);
                            const y1 = Math.max(marquee.y0, marquee.y1);
                            const dragged = Math.abs(x1 - x0) > 0.005 || Math.abs(y1 - y0) > 0.005;
                            if (dragged) {
                              const hit = pageFields
                                .filter((f) => {
                                  const fx0 = f.x_pt;
                                  const fy0 = f.y_pt;
                                  const fx1 = f.x_pt + f.width_pt;
                                  const fy1 = f.y_pt + f.height_pt;
                                  return fx0 < x1 && fx1 > x0 && fy0 < y1 && fy1 > y0;
                                })
                                .map((f) => f.id)
                                .filter((id): id is string => !!id);
                              setSelectedIds((prev) => {
                                const next = marquee.additive ? new Set(prev) : new Set<string>();
                                for (const id of hit) next.add(id);
                                return next;
                              });
                            }
                            setMarquee(null);
                          }}
                        >
                          <LazyPdfPage
                            url={pdfUrl}
                            pageIndex={pageIndex}
                            eager={pageIndex === 0}
                            renderWidth={viewer.renderWidth}
                            reservedSize={thisPageSize}
                            onReady={(pages, size) => {
                              if (pageIndex === 0) {
                                setTotalPages(pages);
                                setFirstPageReady(true);
                              }
                              setPageSizes((prev) =>
                                prev[pageIndex]?.width === size.width &&
                                prev[pageIndex]?.height === size.height
                                  ? prev
                                  : { ...prev, [pageIndex]: size },
                              );
                            }}
                          />
                          <div
                            className="absolute top-1 left-2 text-[10px] text-muted-foreground/70 pointer-events-none select-none"
                            aria-hidden
                          >
                            Page {pageIndex + 1}
                          </div>
                          {pageFields.map((f) => {
                            const rcp = f.recipient_id
                              ? recipientById.get(f.recipient_id)
                              : undefined;
                            const color = rcp?.color_hex ?? "#4f46e5";
                            const selected = !!f.id && selectedIds.has(f.id);
                            return (
                              <FieldChip
                                key={f.id}
                                field={f}
                                pageSize={thisPageSize}
                                color={color}
                                selected={selected}
                                onSelect={(mods) => {
                                  if (f.id) selectField(f.id, mods);
                                }}
                                onMove={(dx, dy) => moveField(f, dx, dy)}
                                onResize={(dw, dh) => resizeField(f, dw, dh)}
                              />
                            );
                          })}
                          {marquee && marquee.pageIndex === pageIndex && (
                            <div
                              className="absolute pointer-events-none border border-primary/70 bg-primary/10"
                              style={{
                                left: Math.min(marquee.x0, marquee.x1) * thisPageSize.width,
                                top: Math.min(marquee.y0, marquee.y1) * thisPageSize.height,
                                width: Math.abs(marquee.x1 - marquee.x0) * thisPageSize.width,
                                height: Math.abs(marquee.y1 - marquee.y0) * thisPageSize.height,
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Loading document…
                  </div>
                )}
              </div>
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />

        {/* Inspector */}
        <ResizablePanel defaultSize={24} minSize={18}>
          <div className="h-full overflow-y-auto p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-muted-foreground uppercase">Inspector</div>
              {selectionMode === "multi" && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                  {selectedFields.length} selected
                </span>
              )}
            </div>
            {selectionMode === "multi" ? (
              <MultiInspector
                selected={selectedFields}
                recipients={recipients}
                onAssign={(rid) => {
                  for (const f of selectedFields) {
                    upsertMut.mutate({ ...f, recipient_id: rid });
                  }
                }}
                onAlign={(axis, edge) => {
                  if (selectedFields.length < 2) return;
                  // axis: 'h' aligns vertical position (top/middle/bottom)
                  //       'v' aligns horizontal position (left/center/right)
                  const xs = selectedFields.map((f) => f.x_pt);
                  const ys = selectedFields.map((f) => f.y_pt);
                  const xes = selectedFields.map((f) => f.x_pt + f.width_pt);
                  const yes = selectedFields.map((f) => f.y_pt + f.height_pt);
                  const minX = Math.min(...xs);
                  const maxX = Math.max(...xes);
                  const minY = Math.min(...ys);
                  const maxY = Math.max(...yes);
                  const cx = (minX + maxX) / 2;
                  const cy = (minY + maxY) / 2;
                  for (const f of selectedFields) {
                    let nx = f.x_pt;
                    let ny = f.y_pt;
                    if (axis === "v") {
                      if (edge === "start") nx = minX;
                      else if (edge === "center") nx = cx - f.width_pt / 2;
                      else nx = maxX - f.width_pt;
                    } else {
                      if (edge === "start") ny = minY;
                      else if (edge === "center") ny = cy - f.height_pt / 2;
                      else ny = maxY - f.height_pt;
                    }
                    upsertMut.mutate({
                      ...f,
                      x_pt: Math.max(0, Math.min(1 - f.width_pt, nx)),
                      y_pt: Math.max(0, Math.min(1 - f.height_pt, ny)),
                    });
                  }
                }}
                onMatchSize={(dim) => {
                  if (selectedFields.length < 2) return;
                  const ref = selectedFields[0];
                  for (const f of selectedFields.slice(1)) {
                    upsertMut.mutate({
                      ...f,
                      width_pt: dim === "w" || dim === "both" ? ref.width_pt : f.width_pt,
                      height_pt: dim === "h" || dim === "both" ? ref.height_pt : f.height_pt,
                    });
                  }
                }}
                onDistribute={(axis) => {
                  if (selectedFields.length < 3) return;
                  const sorted = [...selectedFields].sort((a, b) =>
                    axis === "h" ? a.x_pt - b.x_pt : a.y_pt - b.y_pt,
                  );
                  const first = sorted[0];
                  const last = sorted[sorted.length - 1];
                  const startPt = axis === "h" ? first.x_pt : first.y_pt;
                  const endPt =
                    axis === "h" ? last.x_pt + last.width_pt : last.y_pt + last.height_pt;
                  const usableSpan = endPt - startPt;
                  const totalSize = sorted.reduce(
                    (s, f) => s + (axis === "h" ? f.width_pt : f.height_pt),
                    0,
                  );
                  const gap = (usableSpan - totalSize) / (sorted.length - 1);
                  let cursor = startPt;
                  for (const f of sorted) {
                    if (axis === "h") {
                      upsertMut.mutate({ ...f, x_pt: cursor });
                      cursor += f.width_pt + gap;
                    } else {
                      upsertMut.mutate({ ...f, y_pt: cursor });
                      cursor += f.height_pt + gap;
                    }
                  }
                }}
                onDelete={() => {
                  for (const f of selectedFields) if (f.id) deleteMut.mutate(f.id);
                  clearSelection();
                }}
              />
            ) : selectedField ? (
              <Card>
                <CardContent className="p-3 space-y-3 text-sm">
                  <div>
                    <Label className="text-xs">Type</Label>
                    <div className="font-medium capitalize">
                      {selectedField.field_type.replace("_", " ")}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Recipient</Label>
                    <Select
                      value={selectedField.recipient_id}
                      onValueChange={(v) => upsertMut.mutate({ ...selectedField, recipient_id: v })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {recipients.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            <span className="flex items-center gap-2">
                              <span
                                className="inline-block h-3 w-3 rounded-full"
                                style={{ backgroundColor: r.color_hex }}
                              />
                              {r.full_name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Required</Label>
                    <Switch
                      checked={selectedField.is_required}
                      onCheckedChange={(v) =>
                        upsertMut.mutate({ ...selectedField, is_required: v })
                      }
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Tooltip</Label>
                    <Input
                      className="mt-1 h-8"
                      maxLength={280}
                      value={selectedField.options_json?.tooltip ?? ""}
                      onChange={(e) =>
                        upsertMut.mutate({
                          ...selectedField,
                          options_json: {
                            ...(selectedField.options_json ?? {}),
                            tooltip: e.target.value || undefined,
                          },
                        })
                      }
                      placeholder="Help text shown on hover"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Tab order</Label>
                    <Input
                      type="number"
                      className="mt-1 h-8"
                      min={0}
                      max={9999}
                      value={selectedField.tab_order ?? ""}
                      onChange={(e) =>
                        upsertMut.mutate({
                          ...selectedField,
                          tab_order: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                      placeholder="Auto"
                    />
                  </div>

                  {(selectedField.field_type === "text" ||
                    selectedField.field_type === "name" ||
                    selectedField.field_type === "company" ||
                    selectedField.field_type === "title" ||
                    selectedField.field_type === "email") && (
                    <ValidationEditor
                      field={selectedField}
                      onChange={(v) => upsertMut.mutate({ ...selectedField, options_json: v })}
                    />
                  )}

                  {selectedField.field_type === "radio" && (
                    <ChoicesEditor
                      field={selectedField}
                      onChange={(v) => upsertMut.mutate({ ...selectedField, options_json: v })}
                    />
                  )}

                  <ConditionalEditor
                    field={selectedField}
                    allFields={fields}
                    onChange={(c) => upsertMut.mutate({ ...selectedField, conditional_json: c })}
                  />

                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      if (selectedField.id) {
                        deleteMut.mutate(selectedField.id);
                        clearSelection();
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Delete field
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="text-xs text-muted-foreground space-y-1.5">
                <p>Drop a field onto the page, then click it to configure.</p>
                <p className="text-[11px]">
                  Tip: drag across the page to marquee-select. Hold Shift or ⌘ to add to the
                  selection.
                </p>
              </div>
            )}

            <div className="border-t pt-3">
              <div className="text-xs font-medium mb-1.5">Active assignee</div>
              <div
                className="text-xs flex items-center gap-2 p-2 rounded-md"
                style={{ backgroundColor: `${activeRecipientColor}1a` }}
              >
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: activeRecipientColor }}
                />
                {recipients.find((r) => r.id === activeRecipientId)?.full_name}
              </div>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <div className="flex justify-center items-center gap-3 pt-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back
        </Button>
        <Button onClick={onNext}>
          Review & send
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-1.5">
            {PDF_VIEWER_SHORTCUTS.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3">
                <div className="flex gap-1 flex-wrap">
                  {r.keys.map((k) => (
                    <kbd
                      key={k}
                      className="px-2 py-0.5 rounded border bg-muted text-[11px] font-mono"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
                <span className="text-muted-foreground">{r.label}</span>
              </div>
            ))}
            <div className="border-t pt-2 mt-2 text-[11px] text-muted-foreground">
              Builder extras: <kbd className="px-1 rounded border bg-muted">Delete</kbd> removes the
              selected field. <kbd className="px-1 rounded border bg-muted">?</kbd> opens this help.
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldChip({
  field,
  pageSize,
  color,
  selected,
  onSelect,
  onMove,
  onResize,
}: {
  field: PlacedField;
  pageSize: PageSize;
  color: string;
  selected: boolean;
  onSelect: (mods: { shift: boolean; meta: boolean }) => void;
  onMove: (dx: number, dy: number) => void;
  onResize: (dw: number, dh: number) => void;
}) {
  const startRef = useRef<{ x: number; y: number; mode: "move" | "resize" } | null>(null);
  const accumRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  // Live offset (transform/size only — no React state update per mousemove).
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const baseW = field.width_pt * pageSize.width;
  const baseH = field.height_pt * pageSize.height;

  function applyMove() {
    if (elRef.current) {
      const { x, y } = dragOffsetRef.current;
      elRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }
  function applyResize() {
    if (elRef.current) {
      const { x, y } = dragOffsetRef.current;
      elRef.current.style.width = `${Math.max(24, baseW + x)}px`;
      elRef.current.style.height = `${Math.max(18, baseH + y)}px`;
    }
  }

  function startGesture(e: React.PointerEvent, mode: "move" | "resize") {
    e.stopPropagation();
    e.preventDefault();
    onSelect({ shift: e.shiftKey, meta: e.metaKey || e.ctrlKey });
    startRef.current = { x: e.clientX, y: e.clientY, mode };
    accumRef.current = { x: 0, y: 0 };
    dragOffsetRef.current = { x: 0, y: 0 };
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current) return;
    accumRef.current = {
      x: e.clientX - startRef.current.x,
      y: e.clientY - startRef.current.y,
    };
    dragOffsetRef.current = accumRef.current;
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (startRef.current?.mode === "resize") applyResize();
        else applyMove();
      });
    }
  }

  function onPointerUp() {
    if (!startRef.current) return;
    const { x, y } = accumRef.current;
    const mode = startRef.current.mode;
    startRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Reset visual offsets; parent re-renders at the new persisted size/pos.
    dragOffsetRef.current = { x: 0, y: 0 };
    if (elRef.current) {
      elRef.current.style.transform = "";
      elRef.current.style.width = `${baseW}px`;
      elRef.current.style.height = `${baseH}px`;
    }
    if (mode === "resize") {
      if (Math.abs(x) > 2 || Math.abs(y) > 2) onResize(x, y);
    } else {
      if (Math.abs(x) > 2 || Math.abs(y) > 2) onMove(x, y);
    }
  }

  const style = {
    left: field.x_pt * pageSize.width,
    top: field.y_pt * pageSize.height,
    width: baseW,
    height: baseH,
    backgroundColor: `${color}26`,
    borderColor: color,
    color,
  };

  return (
    <div
      ref={elRef}
      role="button"
      tabIndex={0}
      data-field-chip
      onPointerDown={(e) => startGesture(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={(e) => {
        e.stopPropagation();
        onSelect({ shift: e.shiftKey, meta: e.metaKey || e.ctrlKey });
      }}
      className={
        "absolute border-2 rounded-sm text-[10px] flex items-center justify-center px-1 select-none cursor-move will-change-transform " +
        (selected ? "ring-2 ring-offset-1 ring-primary" : "")
      }
      style={style}
    >
      <span className="truncate font-medium capitalize">{field.field_type.replace("_", " ")}</span>
      {/* SE resize handle — appears for selected fields. */}
      {selected && (
        <span
          onPointerDown={(e) => startGesture(e, "resize")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onClick={(e) => e.stopPropagation()}
          title="Drag to resize"
          aria-label="Resize field"
          className="absolute -right-1 -bottom-1 h-3 w-3 rounded-sm border-2 bg-white cursor-se-resize"
          style={{ borderColor: color }}
        />
      )}
    </div>
  );
}

function ValidationEditor({
  field,
  onChange,
}: {
  field: PlacedField;
  onChange: (opts: FieldOptions) => void;
}) {
  const opts = field.options_json ?? {};
  const v = opts.validation ?? {};
  function update(patch: Partial<FieldOptions["validation"]>) {
    onChange({
      ...opts,
      validation: { ...v, ...patch },
    });
  }
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="text-xs font-medium">Validation</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Min length
          </Label>
          <Input
            type="number"
            min={0}
            max={10000}
            className="mt-1 h-8"
            value={v.min_length ?? ""}
            onChange={(e) =>
              update({
                min_length: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Max length
          </Label>
          <Input
            type="number"
            min={1}
            max={10000}
            className="mt-1 h-8"
            value={v.max_length ?? ""}
            onChange={(e) =>
              update({
                max_length: e.target.value === "" ? undefined : Number(e.target.value),
              })
            }
          />
        </div>
      </div>
      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Regex pattern
        </Label>
        <Input
          className="mt-1 h-8 font-mono text-xs"
          value={v.regex ?? ""}
          onChange={(e) => update({ regex: e.target.value || undefined })}
          placeholder="^[A-Z]{2}\\d{6}$"
        />
      </div>
      <div>
        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Error message
        </Label>
        <Input
          className="mt-1 h-8"
          maxLength={200}
          value={v.regex_message ?? ""}
          onChange={(e) => update({ regex_message: e.target.value || undefined })}
          placeholder="Must match expected format"
        />
      </div>
    </div>
  );
}

function ChoicesEditor({
  field,
  onChange,
}: {
  field: PlacedField;
  onChange: (opts: FieldOptions) => void;
}) {
  const opts = field.options_json ?? {};
  const choices: FieldChoice[] = opts.choices ?? [];
  function setChoices(next: FieldChoice[]) {
    onChange({ ...opts, choices: next });
  }
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="text-xs font-medium">Choices</div>
      {choices.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Add at least one option to make this a working choice field.
        </p>
      )}
      <div className="space-y-1.5">
        {choices.map((c, i) => (
          <div key={i} className="flex gap-1.5">
            <Input
              className="h-8 text-xs"
              value={c.label}
              placeholder="Label"
              onChange={(e) => {
                const next = [...choices];
                next[i] = { ...c, label: e.target.value, value: c.value || e.target.value };
                setChoices(next);
              }}
            />
            <Input
              className="h-8 text-xs font-mono w-24"
              value={c.value}
              placeholder="value"
              onChange={(e) => {
                const next = [...choices];
                next[i] = { ...c, value: e.target.value };
                setChoices(next);
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => setChoices(choices.filter((_, j) => j !== i))}
              aria-label="Remove choice"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="w-full h-7 text-xs"
        onClick={() =>
          setChoices([
            ...choices,
            { label: `Option ${choices.length + 1}`, value: `opt${choices.length + 1}` },
          ])
        }
      >
        Add option
      </Button>
    </div>
  );
}

function ConditionalEditor({
  field,
  allFields,
  onChange,
}: {
  field: PlacedField;
  allFields: PlacedField[];
  onChange: (c: FieldConditional | null) => void;
}) {
  const candidates = allFields.filter(
    (f) =>
      f.id &&
      f.id !== field.id &&
      f.recipient_id === field.recipient_id &&
      (f.field_type === "checkbox" ||
        f.field_type === "radio" ||
        f.field_type === "text" ||
        f.field_type === "email"),
  );
  const cond = field.conditional_json ?? null;
  const enabled = !!cond;
  const sourceField = cond ? (allFields.find((f) => f.id === cond.source_field_id) ?? null) : null;
  return (
    <div className="space-y-2 border-t pt-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium">Conditional</div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => {
            if (!v) {
              onChange(null);
              return;
            }
            const first = candidates[0];
            if (!first?.id) return;
            onChange({
              source_field_id: first.id,
              operator: first.field_type === "checkbox" ? "checked" : "equals",
              value: "",
            });
          }}
        />
      </div>
      {!enabled ? (
        <p className="text-[11px] text-muted-foreground">
          Show this field only when another field matches a rule.
        </p>
      ) : candidates.length === 0 ? (
        <p className="text-[11px] text-amber-600">
          No eligible source fields for the same recipient yet.
        </p>
      ) : cond ? (
        <div className="space-y-1.5">
          <Select
            value={cond.source_field_id}
            onValueChange={(v) => onChange({ ...cond, source_field_id: v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Source field" />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.id} value={c.id!}>
                  {c.field_type} · p{c.page_index + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={cond.operator}
            onValueChange={(v) => onChange({ ...cond, operator: v as ConditionalOperator })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {conditionalOperators.map((op) => (
                <SelectItem key={op} value={op}>
                  {op.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(cond.operator === "equals" || cond.operator === "not_equals") && (
            <>
              {sourceField?.field_type === "radio" && sourceField.options_json?.choices?.length ? (
                <Select
                  value={cond.value ?? ""}
                  onValueChange={(v) => onChange({ ...cond, value: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Pick a value" />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceField.options_json.choices.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Textarea
                  className="text-xs"
                  rows={2}
                  placeholder="Value"
                  value={cond.value ?? ""}
                  onChange={(e) => onChange({ ...cond, value: e.target.value })}
                />
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ---------- Multi-select inspector ----------
type AlignAxis = "h" | "v";
type AlignEdge = "start" | "center" | "end";

function MultiInspector({
  selected,
  recipients,
  onAssign,
  onAlign,
  onMatchSize,
  onDistribute,
  onDelete,
}: {
  selected: PlacedField[];
  recipients: Array<{ id: string; full_name: string; email: string; color_hex: string }>;
  onAssign: (recipientId: string) => void;
  onAlign: (axis: AlignAxis, edge: AlignEdge) => void;
  onMatchSize: (dim: "w" | "h" | "both") => void;
  onDistribute: (axis: AlignAxis) => void;
  onDelete: () => void;
}) {
  const canDistribute = selected.length >= 3;
  const canAlign = selected.length >= 2;
  return (
    <Card>
      <CardContent className="p-3 space-y-4 text-sm">
        <div>
          <Label className="text-xs">Reassign all to</Label>
          <Select onValueChange={onAssign}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Pick a recipient" />
            </SelectTrigger>
            <SelectContent>
              {recipients.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: r.color_hex }}
                    />
                    {r.full_name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
            Align ({selected.length})
          </div>
          <div className="grid grid-cols-6 gap-1">
            <AlignBtn
              icon={AlignHorizontalJustifyStart}
              title="Align left"
              disabled={!canAlign}
              onClick={() => onAlign("v", "start")}
            />
            <AlignBtn
              icon={AlignHorizontalJustifyCenter}
              title="Align horizontal center"
              disabled={!canAlign}
              onClick={() => onAlign("v", "center")}
            />
            <AlignBtn
              icon={AlignHorizontalJustifyEnd}
              title="Align right"
              disabled={!canAlign}
              onClick={() => onAlign("v", "end")}
            />
            <AlignBtn
              icon={AlignVerticalJustifyStart}
              title="Align top"
              disabled={!canAlign}
              onClick={() => onAlign("h", "start")}
            />
            <AlignBtn
              icon={AlignVerticalJustifyCenter}
              title="Align vertical center"
              disabled={!canAlign}
              onClick={() => onAlign("h", "center")}
            />
            <AlignBtn
              icon={AlignVerticalJustifyEnd}
              title="Align bottom"
              disabled={!canAlign}
              onClick={() => onAlign("h", "end")}
            />
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
            Match size (to first)
          </div>
          <div className="grid grid-cols-3 gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!canAlign}
              onClick={() => onMatchSize("w")}
            >
              <MoveHorizontal className="h-3.5 w-3.5 mr-1" /> Width
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!canAlign}
              onClick={() => onMatchSize("h")}
            >
              <MoveVertical className="h-3.5 w-3.5 mr-1" /> Height
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!canAlign}
              onClick={() => onMatchSize("both")}
            >
              Both
            </Button>
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
            Distribute
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!canDistribute}
              onClick={() => onDistribute("h")}
            >
              <AlignHorizontalSpaceAround className="h-3.5 w-3.5 mr-1" /> Horizontal
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={!canDistribute}
              onClick={() => onDistribute("v")}
            >
              <AlignVerticalSpaceAround className="h-3.5 w-3.5 mr-1" /> Vertical
            </Button>
          </div>
          {!canDistribute && (
            <p className="text-[10px] text-muted-foreground mt-1">Need 3+ fields to distribute.</p>
          )}
        </div>

        <Button variant="destructive" size="sm" className="w-full" onClick={onDelete}>
          <Trash2 className="h-4 w-4 mr-1.5" />
          Delete {selected.length} field{selected.length === 1 ? "" : "s"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AlignBtn({
  icon: Icon,
  title,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      className="h-7 w-full"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );
}
