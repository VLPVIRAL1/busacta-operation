import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Download,
  ExternalLink,
  Loader2,
  FileText,
  Folder,
  Pin,
  Square,
  FileDown,
} from "lucide-react";
import { toast } from "sonner";
import { exportAnnotatedImage, exportAnnotatedPdf } from "@/lib/ops/export-annotations";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { formatBytes } from "@/lib/format/format-bytes";
import {
  listDocumentAuditEvents,
  type TaskFileRow,
  type DocumentAuditEvent,
} from "@/lib/ops/task-documents.functions";
import {
  listFileAnnotations,
  createFileAnnotation,
  updateFileAnnotation,
  resolveFileAnnotation,
  deleteFileAnnotation,
  replyToFileAnnotation,
  deleteFileAnnotationReply,
  type FileAnnotation,
} from "@/lib/ops/file-annotations.functions";
import { AnnotationToolbar } from "./annotations/annotation-toolbar";
import type { AnnotationTool } from "./annotations/annotation-layer";
import { lazy, Suspense } from "react";
const PdfAnnotatedViewer = lazy(() =>
  import("./annotations/pdf-annotated-viewer").then((m) => ({ default: m.PdfAnnotatedViewer })),
);
import { ImageAnnotatedViewer } from "./annotations/image-annotated-viewer";
import { CategoryChip, CategoryPickerPopover, type CategoryOption } from "./file-meta-controls";
import { cn } from "@/lib/shared/utils";

export type PreviewSheetState = {
  open: boolean;
  file: TaskFileRow | null;
  url: string | null;
};

function isImage(name: string, mime: string | null) {
  if (mime?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
}
function isPdf(name: string, mime: string | null) {
  if (mime === "application/pdf") return true;
  return /\.pdf$/i.test(name);
}

const EVENT_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  created: "Created",
  renamed: "Renamed",
  moved: "Moved",
  visibility_changed: "Visibility changed",
  deleted: "Deleted",
};

function describe(ev: DocumentAuditEvent): string {
  switch (ev.event_type) {
    case "renamed":
      return `${ev.before?.filename ?? ev.before?.path ?? "—"} → ${ev.after?.filename ?? ev.after?.path ?? "—"}`;
    case "moved":
      return `${ev.before?.folder_path ?? "—"} → ${ev.after?.folder_path ?? "—"}`;
    case "visibility_changed":
      return `${ev.before?.is_client_visible ? "Shared" : "Internal"} → ${ev.after?.is_client_visible ? "Shared" : "Internal"}`;
    case "uploaded":
      return ev.after?.filename ?? "";
    default:
      return "";
  }
}

export function DocumentPreviewSheet({
  state,
  onOpenChange,
  onDownload,
  categories,
  categoryById,
  folderLabel,
  onSaveDescription,
  onSetCategory,
  onClearCategory,
  onSetVisibility,
}: {
  state: PreviewSheetState;
  onOpenChange: (open: boolean) => void;
  onDownload: () => void;
  categories: CategoryOption[];
  categoryById: Map<string, CategoryOption>;
  folderLabel: (path: string) => string;
  onSaveDescription: (fileId: string, value: string | null) => void;
  onSetCategory: (fileId: string, categoryId: string) => void;
  onClearCategory: (fileId: string) => void;
  onSetVisibility: (fileId: string, visible: boolean | null) => void;
}) {
  const file = state.file;
  const [tab, setTab] = useState("preview");
  const [desc, setDesc] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [tool, setTool] = useState<AnnotationTool>("pointer");
  const [layerOn, setLayerOn] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const [annPage, setAnnPage] = useState(1);

  useEffect(() => {
    if (file) {
      setDesc(file.description ?? "");
      setTab("preview");
      setSelectedAnnId(null);
      setAnnPage(1);
    }
  }, [file?.id]);

  const listAuditFn = useServerFn(listDocumentAuditEvents);
  const { data: audit, isLoading: auditLoading } = useQuery({
    queryKey: ["doc-audit", file?.task_id, file?.id],
    enabled: !!file && state.open && tab === "audit",
    queryFn: () =>
      listAuditFn({ data: { taskId: file!.task_id, nodeIds: [file!.id], limit: 200 } }),
  });

  const { data: uploader } = useQuery({
    queryKey: ["profile", file?.uploader_id],
    enabled: !!file?.uploader_id && state.open,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("id", file!.uploader_id!)
        .maybeSingle();
      return data as { id: string; full_name: string | null; email: string | null } | null;
    },
  });

  // --- Annotations ---
  const queryClient = useQueryClient();
  const listAnnFn = useServerFn(listFileAnnotations);
  const createAnnFn = useServerFn(createFileAnnotation);
  const updateAnnFn = useServerFn(updateFileAnnotation);
  const resolveAnnFn = useServerFn(resolveFileAnnotation);
  const deleteAnnFn = useServerFn(deleteFileAnnotation);
  const replyAnnFn = useServerFn(replyToFileAnnotation);
  const deleteReplyFn = useServerFn(deleteFileAnnotationReply);

  const annQueryKey = useMemo(() => ["file-annotations", file?.id] as const, [file?.id]);
  const { data: annotations = [] as FileAnnotation[] } = useQuery({
    queryKey: annQueryKey,
    enabled: !!file && state.open,
    queryFn: () => listAnnFn({ data: { fileId: file!.id } }),
  });

  useEffect(() => {
    if (!file || !state.open) return;
    const channel = supabase
      .channel(`file-annotations-${file.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "task_file_annotations",
          filter: `file_id=eq.${file.id}`,
        },
        () => queryClient.invalidateQueries({ queryKey: annQueryKey }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "task_file_annotation_replies" },
        () => queryClient.invalidateQueries({ queryKey: annQueryKey }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [file?.id, state.open, queryClient, annQueryKey]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: annQueryKey });
  const mCreate = useMutation({
    mutationFn: (input: {
      page: number;
      kind: "pin" | "rect";
      geometry: { x: number; y: number; w?: number; h?: number };
    }) => createAnnFn({ data: { fileId: file!.id, taskId: file!.task_id, ...input } }),
    onSuccess: invalidate,
  });
  const mUpdateBody = useMutation({
    mutationFn: (v: { id: string; body: string }) => updateAnnFn({ data: v }),
    onSuccess: invalidate,
  });
  const mToggleVis = useMutation({
    mutationFn: (v: { id: string; isClientVisible: boolean }) => updateAnnFn({ data: v }),
    onSuccess: invalidate,
  });
  const mResolve = useMutation({
    mutationFn: (v: { id: string; resolved: boolean }) => resolveAnnFn({ data: v }),
    onSuccess: invalidate,
  });
  const mDelete = useMutation({
    mutationFn: (id: string) => deleteAnnFn({ data: { id } }),
    onSuccess: () => {
      setSelectedAnnId(null);
      invalidate();
    },
  });
  const mReply = useMutation({
    mutationFn: (v: { annotationId: string; body: string }) => replyAnnFn({ data: v }),
    onSuccess: invalidate,
  });
  const mDeleteReply = useMutation({
    mutationFn: (id: string) => deleteReplyFn({ data: { id } }),
    onSuccess: invalidate,
  });

  const url = state.url;
  const previewKind = useMemo(() => {
    if (!file || !url) return null;
    if (isImage(file.filename, file.mime_type)) return "image" as const;
    if (isPdf(file.filename, file.mime_type)) return "pdf" as const;
    return "other" as const;
  }, [file, url]);

  const supportsAnnotations = previewKind === "image" || previewKind === "pdf";

  const layerProps = useMemo(
    () => ({
      annotations,
      tool,
      showResolved,
      layerOn,
      selectedId: selectedAnnId,
      onSelect: setSelectedAnnId,
      onCreate: (i: {
        page: number;
        kind: "pin" | "rect";
        geometry: { x: number; y: number; w?: number; h?: number };
      }) => mCreate.mutate(i),
      onUpdateBody: (id: string, body: string) => mUpdateBody.mutate({ id, body }),
      onToggleVisibility: (id: string, isClientVisible: boolean) =>
        mToggleVis.mutate({ id, isClientVisible }),
      onResolve: (id: string, resolved: boolean) => mResolve.mutate({ id, resolved }),
      onDelete: (id: string) => mDelete.mutate(id),
      onReply: (id: string, body: string) => mReply.mutate({ annotationId: id, body }),
      onDeleteReply: (id: string) => mDeleteReply.mutate(id),
    }),
    [annotations, tool, showResolved, layerOn, selectedAnnId],
  );

  const descDirty = file ? (file.description ?? "") !== desc : false;

  const jumpToAnnotation = useCallback((a: FileAnnotation) => {
    setTab("preview");
    setAnnPage(a.page);
    setSelectedAnnId(a.id);
    setLayerOn(true);
  }, []);

  return (
    <Sheet open={state.open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[760px]">
        <SheetHeader className="border-b px-5 py-3">
          <SheetTitle className="truncate text-base">{file?.filename ?? "File"}</SheetTitle>
          {file && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Folder className="h-3 w-3" /> {folderLabel(file.folder_path) || "Root"}
              </span>
              <span>·</span>
              <span>{formatBytes(file.size_bytes ?? 0) || "—"}</span>
              {file.mime_type && (
                <>
                  <span>·</span>
                  <span className="truncate">{file.mime_type}</span>
                </>
              )}
            </div>
          )}
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="mx-5 mt-3 w-fit">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="annotations">
              Annotations
              {annotations.length > 0 && (
                <span className="ml-1 text-[10px] opacity-70">({annotations.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent
            value="preview"
            className="m-0 flex flex-1 flex-col gap-2 overflow-hidden p-3"
          >
            {supportsAnnotations && (
              <AnnotationToolbar
                tool={tool}
                onToolChange={setTool}
                showResolved={showResolved}
                onShowResolvedChange={setShowResolved}
                layerOn={layerOn}
                onLayerOnChange={setLayerOn}
                count={annotations.length}
              />
            )}
            <div className="flex-1 overflow-hidden rounded-md border bg-slate-50 dark:bg-slate-900/60">
              {!file || !url ? (
                <div className="flex h-full min-h-[260px] items-center justify-center text-sm text-muted-foreground">
                  {file ? <Loader2 className="h-5 w-5 animate-spin" /> : "Select a file"}
                </div>
              ) : previewKind === "image" ? (
                <ImageAnnotatedViewer url={url} alt={file.filename} {...layerProps} />
              ) : previewKind === "pdf" ? (
                <Suspense
                  fallback={
                    <div className="flex h-full min-h-[260px] items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  }
                >
                  <PdfAnnotatedViewer url={url} initialPage={annPage} {...layerProps} />
                </Suspense>
              ) : (
                <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    In-browser preview isn't available for this file type.
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" /> Open in new tab
                      </a>
                    </Button>
                    <Button size="sm" onClick={onDownload}>
                      <Download className="h-4 w-4" /> Download
                    </Button>
                  </div>
                </div>
              )}
            </div>
            {file && url && previewKind !== "other" && (
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={annotations.length === 0}
                  title={
                    annotations.length === 0
                      ? "No annotations yet"
                      : "Download a flattened copy with annotations drawn on top"
                  }
                  onClick={async () => {
                    try {
                      toast.loading("Building annotated copy…", { id: "ann-export" });
                      if (previewKind === "image") {
                        await exportAnnotatedImage(url, file.filename, annotations);
                      } else {
                        await exportAnnotatedPdf(url, file.filename, annotations);
                      }
                      toast.success("Annotated copy downloaded", { id: "ann-export" });
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Export failed", {
                        id: "ann-export",
                      });
                    }
                  }}
                >
                  <FileDown className="h-4 w-4" /> <span className="sr-only">Export annotated</span>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" /> Open
                  </a>
                </Button>
                <Button size="sm" onClick={onDownload}>
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="annotations" className="m-0 flex-1 overflow-hidden px-5 pb-6 pt-4">
            <ScrollArea className="h-full pr-2">
              {!supportsAnnotations ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Annotations are available for images and PDFs.
                </p>
              ) : annotations.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No annotations yet. Use the Pin or Highlight tool in the preview to add one.
                </p>
              ) : (
                <ul className="space-y-2">
                  {annotations.map((a) => (
                    <li
                      key={a.id}
                      className={cn(
                        "cursor-pointer rounded-lg border border-slate-200/70 bg-white/60 p-3 text-sm transition hover:border-primary/40 dark:border-slate-700/60 dark:bg-slate-900/40",
                        a.resolved_at && "opacity-60",
                      )}
                      onClick={() => jumpToAnnotation(a)}
                    >
                      <div className="flex items-center gap-2">
                        {a.kind === "pin" ? (
                          <Pin className="h-3.5 w-3.5" style={{ color: a.color }} />
                        ) : (
                          <Square className="h-3.5 w-3.5" style={{ color: a.color }} />
                        )}
                        <Badge variant="secondary" className="text-[10px]">
                          Page {a.page}
                        </Badge>
                        {a.is_client_visible && (
                          <Badge variant="outline" className="text-[10px]">
                            Shared
                          </Badge>
                        )}
                        {a.resolved_at && (
                          <Badge className="bg-emerald-100 text-[10px] text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
                            Resolved
                          </Badge>
                        )}
                        <span className="ml-auto text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {a.author_name ?? "User"}
                      </div>
                      {a.body && <p className="mt-1 whitespace-pre-wrap text-sm">{a.body}</p>}
                      {a.replies.length > 0 && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {a.replies.length} repl{a.replies.length === 1 ? "y" : "ies"}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="details" className="m-0 flex-1 overflow-y-auto px-5 pb-6 pt-4">
            {!file ? (
              <p className="text-sm text-muted-foreground">Select a file.</p>
            ) : (
              <div className="space-y-5 text-sm">
                <FieldRow label="Filename" value={file.filename} />
                <FieldRow label="Folder" value={folderLabel(file.folder_path) || "Root"} />
                <FieldRow label="Size" value={formatBytes(file.size_bytes ?? 0) || "—"} />
                <FieldRow label="Type" value={file.mime_type || "—"} />
                <FieldRow
                  label="Uploaded"
                  value={`${new Date(file.created_at).toLocaleString()}${uploader ? ` · ${uploader.full_name ?? uploader.email ?? ""}` : ""}`}
                />

                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Visibility
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={file.is_client_visible}
                      onCheckedChange={(v) => onSetVisibility(file.id, v)}
                    />
                    <span className="text-xs text-muted-foreground">
                      {file.is_client_visible ? "Shared with client" : "Internal only"}
                      {file.client_visible_override !== null && " (override)"}
                    </span>
                    {file.client_visible_override !== null && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => onSetVisibility(file.id, null)}
                      >
                        Reset
                      </Button>
                    )}
                  </div>
                </div>

                {categories.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Category
                    </div>
                    <CategoryPickerPopover
                      open={pickerOpen}
                      onOpenChange={setPickerOpen}
                      categories={categories}
                      currentCategoryId={file.category_id}
                      onPick={(id) => {
                        onSetCategory(file.id, id);
                        setPickerOpen(false);
                      }}
                      onClear={() => {
                        onClearCategory(file.id);
                        setPickerOpen(false);
                      }}
                      trigger={
                        <span>
                          <CategoryChip
                            category={file.category_id ? categoryById.get(file.category_id) : null}
                            onClick={() => setPickerOpen(true)}
                          />
                        </span>
                      }
                    />
                  </div>
                )}

                {file.categorisation_status && file.categorisation_status !== "pending" && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Classification
                    </div>
                    <div className="rounded-md border p-3 space-y-2">
                      {file.categorisation_status === "ocr_failed" ? (
                        <p className="text-xs text-destructive">OCR failed. Retry or classify manually.</p>
                      ) : file.categorisation_status === "processing" ? (
                        <p className="text-xs text-muted-foreground">Processing...</p>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            {file.doc_type && (
                              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                {file.doc_type === "MULTI" ? "Multi-document" : file.doc_type.replace(/_/g, "-")}
                              </span>
                            )}
                            {file.confidence_score != null && (
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {file.confidence_score}% confidence
                              </span>
                            )}
                            {file.detection_method && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                {file.detection_method}
                              </span>
                            )}
                          </div>
                          {file.mapped_category && (
                            <p className="text-xs text-muted-foreground">
                              Category: {file.mapped_category}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Description
                    </span>
                    <span className={cn("text-[10px]", desc.length > 500 && "text-destructive")}>
                      {desc.length} / 500
                    </span>
                  </div>
                  <Textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="Add context that team members and clients can see beside this file."
                    rows={4}
                  />
                  <div className="flex justify-end gap-2">
                    {descDirty && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDesc(file.description ?? "")}
                      >
                        Reset
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={!descDirty || desc.length > 500}
                      onClick={() =>
                        onSaveDescription(file.id, desc.trim().length === 0 ? null : desc.trim())
                      }
                    >
                      Save description
                    </Button>
                  </div>
                </div>

                {/* tags rendering reserved for future once selected in list query */}
              </div>
            )}
          </TabsContent>

          <TabsContent value="audit" className="m-0 flex-1 overflow-hidden px-5 pb-6 pt-4">
            <ScrollArea className="h-full pr-2">
              {auditLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !audit || audit.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No history yet.</p>
              ) : (
                <ol className="space-y-2">
                  {audit.map((ev) => (
                    <li
                      key={ev.id}
                      className="rounded-lg border border-slate-200/70 bg-white/60 p-3 text-sm dark:border-slate-700/60 dark:bg-slate-900/40"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-slate-500" />
                        <Badge variant="secondary" className="text-[10px]">
                          {EVENT_LABEL[ev.event_type] ?? ev.event_type}
                        </Badge>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {new Date(ev.occurred_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        by {ev.actor_name ?? "System"}
                        {describe(ev) && <> · {describe(ev)}</>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-baseline gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="break-words text-sm">{value}</span>
    </div>
  );
}
