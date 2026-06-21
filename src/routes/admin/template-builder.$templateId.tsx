import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useRef, Suspense } from "react";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, History, BookOpen, CheckCircle2, Clock } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { cn } from "@/lib/shared/utils";
import { publishTemplateFn, updateTemplateFn } from "@/lib/pdf-templates/functions";
import {
  pdfTemplateDetailQuery,
  pdfVersionHistoryQuery,
} from "@/lib/queries/pdf-templates.queries";
import { PDF_DOC_TYPE_LABELS, type PdfTemplateField } from "@/lib/pdf-templates/schemas";
import { PdfFieldPalette } from "@/components/pdf-templates/pdf-field-palette";
import { PdfFieldEditorCard } from "@/components/pdf-templates/pdf-field-editor";
import { BrandingSidebar } from "@/components/pdf-templates/branding-sidebar";
import { PdfPreviewPanel } from "@/components/pdf-templates/pdf-preview-panel";

export const Route = createFileRoute("/admin/template-builder/$templateId")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin"]}>
      <BuilderPage />
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

// ─── Resize handle ─────────────────────────────────────────────────────────────

function PanelResizeHandle({ onResize }: { onResize: (dx: number) => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    lastX.current = e.clientX;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dx = ev.clientX - lastX.current;
      lastX.current = ev.clientX;
      onResize(dx);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
      onMouseDown={onMouseDown}
    />
  );
}

// ─── Builder page ──────────────────────────────────────────────────────────────

function BuilderPage() {
  const { templateId } = Route.useParams();
  const qc = useQueryClient();

  const { data } = useSuspenseQuery(pdfTemplateDetailQuery(templateId));
  const { template, fields } = data;

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Panel widths
  const [paletteW, setPaletteW] = useState(200);
  const [previewW, setPreviewW] = useState(380);

  const updateFn = useServerFn(updateTemplateFn);
  const publishFn = useServerFn(publishTemplateFn);

  const nameSaveMut = useMutation({
    mutationFn: async (name: string) => {
      await updateFn({ data: { id: templateId, name } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pdf-templates", "detail", templateId] });
      setLastSaved(new Date());
    },
  });

  const publishMut = useMutation({
    mutationFn: async () => {
      const { template: t } = await publishFn({ data: { id: templateId } });
      return t;
    },
    onSuccess: (t) => {
      toast.success(
        t.status === "published" ? "Template published!" : `Draft v${t.version} created`,
      );
      qc.invalidateQueries({ queryKey: ["pdf-templates"] });
      setPublishConfirm(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleInserted = useCallback((fieldId: string) => {
    setSelectedFieldId(fieldId);
    setLastSaved(new Date());
  }, []);

  if (!template) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground text-sm">
        Template not found.
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    draft: "bg-slate-100 text-slate-600",
    published: "bg-emerald-50 text-emerald-700",
    archived: "bg-amber-50 text-amber-700",
  };

  // Root fields for inspector
  const rootFields = (fields as PdfTemplateField[])
    .filter((f: PdfTemplateField) => !f.parent_id)
    .sort((a: PdfTemplateField, b: PdfTemplateField) => a.order_index - b.order_index);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-3 py-2 border-b border-border/60 shrink-0 bg-card">
        <Link to="/admin/settings" search={{ tab: "templates" }}>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>

        <div className="h-4 w-px bg-border" />

        {/* Editable name */}
        <Input
          className="h-7 text-sm font-semibold border-transparent bg-transparent px-1 hover:border-input focus:border-input w-56"
          defaultValue={template.name}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== template.name) nameSaveMut.mutate(v);
          }}
        />

        <Badge
          variant="outline"
          className="text-[10px] font-normal text-muted-foreground border-border/50"
        >
          {PDF_DOC_TYPE_LABELS[template.doc_type as keyof typeof PDF_DOC_TYPE_LABELS] ??
            template.doc_type}
        </Badge>

        <span className="text-xs text-muted-foreground">v{template.version}</span>

        <Badge
          className={cn("text-[10px] font-normal", statusColors[template.status] ?? "")}
          variant="outline"
        >
          {template.status.charAt(0).toUpperCase() + template.status.slice(1)}
        </Badge>

        {/* Last saved indicator */}
        {lastSaved && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            Saved {lastSaved.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}

        <div className="flex-1" />

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setHistoryOpen(true)}
        >
          <History className="h-3.5 w-3.5" /> History
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setPreviewOpen((v) => !v)}
        >
          <BookOpen className="h-3.5 w-3.5" />
          {previewOpen ? "Hide Preview" : "Show Preview"}
        </Button>

        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            if (template.status === "published") setPublishConfirm(true);
            else publishMut.mutate();
          }}
          disabled={publishMut.isPending}
        >
          {publishMut.isPending
            ? "Publishing…"
            : template.status === "published"
              ? "Edit (Fork v" + (template.version + 1) + ")"
              : "Publish"}
        </Button>
      </header>

      {/* ── Three-panel body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Palette */}
        <div
          className="flex flex-col border-r border-border/60 bg-card shrink-0 overflow-hidden"
          style={{ width: paletteW }}
        >
          <BrandingSidebar template={template} />
          <div className="flex-1 overflow-hidden">
            <PdfFieldPalette
              templateId={templateId}
              selectedFieldId={selectedFieldId}
              fields={fields}
              docType={template.doc_type}
              onInserted={handleInserted}
            />
          </div>
        </div>

        <PanelResizeHandle
          onResize={(dx) => setPaletteW((w) => Math.max(160, Math.min(320, w + dx)))}
        />

        {/* Inspector */}
        <div className="flex-1 overflow-hidden flex flex-col bg-muted/10">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 shrink-0">
            <span className="text-xs font-medium text-muted-foreground">Fields</span>
            <span className="text-[10px] text-muted-foreground">
              {fields.length} field{fields.length !== 1 ? "s" : ""}
            </span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {rootFields.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <p className="text-xs">No fields yet.</p>
                  <p className="text-[10px]">
                    Click a type in the palette to add your first field.
                  </p>
                </div>
              )}
              {rootFields.map((field: PdfTemplateField) => {
                const children = (fields as PdfTemplateField[])
                  .filter((f: PdfTemplateField) => f.parent_id === field.id)
                  .sort(
                    (a: PdfTemplateField, b: PdfTemplateField) => a.order_index - b.order_index,
                  );
                return (
                  <div key={field.id} className="space-y-1">
                    <PdfFieldEditorCard
                      field={field}
                      templateId={templateId}
                      docType={template.doc_type}
                      isSelected={selectedFieldId === field.id}
                      onSelect={() => setSelectedFieldId(field.id)}
                    />
                    {/* Children (indented) */}
                    {children.length > 0 && (
                      <div className="ml-4 space-y-1">
                        {children.map((child: PdfTemplateField) => (
                          <PdfFieldEditorCard
                            key={child.id}
                            field={child}
                            templateId={templateId}
                            docType={template.doc_type}
                            isSelected={selectedFieldId === child.id}
                            onSelect={() => setSelectedFieldId(child.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Preview */}
        {previewOpen && (
          <>
            <PanelResizeHandle
              onResize={(dx) => setPreviewW((w) => Math.max(280, Math.min(640, w - dx)))}
            />
            <div
              className="border-l border-border/60 shrink-0 overflow-hidden"
              style={{ width: previewW }}
            >
              <PdfPreviewPanel template={template} fields={fields} />
            </div>
          </>
        )}
      </div>

      {/* Version history dialog */}
      <Suspense>
        <VersionHistoryDialog
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          templateId={templateId}
        />
      </Suspense>

      {/* Publish confirm (fork) */}
      <AlertDialog open={publishConfirm} onOpenChange={setPublishConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create new version?</AlertDialogTitle>
            <AlertDialogDescription>
              This template is already published. Editing will create a new draft (v
              {template.version + 1}), keeping v{template.version} live until you publish the new
              version.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => publishMut.mutate()}>
              Create Draft v{template.version + 1}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Version history ──────────────────────────────────────────────────────────

function VersionHistoryDialog({
  open,
  onOpenChange,
  templateId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
}) {
  const { data: versions } = useSuspenseQuery(pdfVersionHistoryQuery(templateId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Version History</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {versions.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">v{v.version}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(v.updated_at).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] font-normal",
                  v.status === "published"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-600",
                )}
              >
                {v.status}
              </Badge>
            </div>
          ))}
          {versions.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No version history yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
