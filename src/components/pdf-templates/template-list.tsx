import { useState, useMemo } from "react";
import { useQueryClient, useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, Archive, FileText, Copy, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/shared/utils";
import {
  createTemplateFn,
  deleteTemplateFn,
  duplicateTemplateFn,
  updateTemplateFn,
} from "@/lib/pdf-templates/functions";
import { pdfTemplatesQuery } from "@/lib/queries/pdf-templates.queries";
import {
  PDF_DOC_TYPE_LABELS,
  type PdfDocType,
  type PdfTemplate,
  type PdfTemplateStatus,
} from "@/lib/pdf-templates/schemas";

const ALL_DOC_TYPES = Object.keys(PDF_DOC_TYPE_LABELS) as PdfDocType[];

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  draft: { label: "Draft", class: "bg-slate-100 text-slate-600 border-slate-200" },
  published: { label: "Published", class: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  archived: { label: "Archived", class: "bg-amber-50 text-amber-700 border-amber-200" },
};

const STATUS_FILTER_OPTIONS: { value: "all" | PdfTemplateStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
];

export function TemplateList() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"all" | PdfDocType>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PdfTemplateStatus>("all");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDocType, setNewDocType] = useState<PdfDocType>("financial_report");

  const { data: templates } = useSuspenseQuery(pdfTemplatesQuery());

  const createFn = useServerFn(createTemplateFn);
  const deleteFn = useServerFn(deleteTemplateFn);
  const updateFn = useServerFn(updateTemplateFn);
  const dupFn = useServerFn(duplicateTemplateFn);

  // Count per doc type for tab badges
  const countByType = useMemo(
    () =>
      ALL_DOC_TYPES.reduce<Record<string, number>>((acc, dt) => {
        acc[dt] = templates.filter((t) => t.doc_type === dt).length;
        return acc;
      }, {}),
    [templates],
  );

  const filtered = useMemo(() => {
    let list = activeTab === "all" ? templates : templates.filter((t) => t.doc_type === activeTab);
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) => t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [templates, activeTab, statusFilter, search]);

  const createMut = useMutation({
    mutationFn: async () => {
      const { template } = await createFn({
        data: { name: newName.trim(), doc_type: newDocType, is_global: true },
      });
      return template;
    },
    onSuccess: (tpl) => {
      toast.success("Template created");
      qc.invalidateQueries({ queryKey: ["pdf-templates"] });
      setCreating(false);
      setNewName("");
      void navigate({ to: "/admin/template-builder/$templateId", params: { templateId: tpl.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      await deleteFn({ data: { id } });
    },
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["pdf-templates"] });
      setDeletingId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: async (id: string) => updateFn({ data: { id, status: "archived" } }),
    onSuccess: () => {
      toast.success("Template archived");
      qc.invalidateQueries({ queryKey: ["pdf-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicateMut = useMutation({
    mutationFn: async (id: string) => {
      const { template } = await dupFn({ data: { id } });
      return template;
    },
    onSuccess: (tpl) => {
      toast.success("Template duplicated");
      qc.invalidateQueries({ queryKey: ["pdf-templates"] });
      void navigate({ to: "/admin/template-builder/$templateId", params: { templateId: tpl.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hasActiveFilters = search.trim() !== "" || statusFilter !== "all";

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {/* Top controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Doc-type tabs */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="h-8 flex-wrap">
              <TabsTrigger value="all" className="text-xs px-3 h-7">
                All
                <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                  {templates.length}
                </span>
              </TabsTrigger>
              {ALL_DOC_TYPES.map((dt) => (
                <TabsTrigger key={dt} value={dt} className="text-xs px-3 h-7">
                  {PDF_DOC_TYPE_LABELS[dt]}
                  {countByType[dt] > 0 && (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                      {countByType[dt]}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {/* Right: search + status + new */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search templates…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-48 pl-8 text-xs"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5" /> New Template
            </Button>
          </div>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <EmptyState
            hasFilters={hasActiveFilters}
            onClear={() => {
              setSearch("");
              setStatusFilter("all");
            }}
            onCreate={() => setCreating(true)}
          />
        ) : (
          <div className="rounded-md border border-border/60 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs font-medium w-8" />
                  <TableHead className="text-xs font-medium">Name</TableHead>
                  {activeTab === "all" && (
                    <TableHead className="text-xs font-medium w-36">Doc Type</TableHead>
                  )}
                  <TableHead className="text-xs font-medium w-16">Ver.</TableHead>
                  <TableHead className="text-xs font-medium w-28">Status</TableHead>
                  <TableHead className="text-xs font-medium w-36">Updated</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tpl) => (
                  <TemplateRow
                    key={tpl.id}
                    tpl={tpl}
                    showDocType={activeTab === "all"}
                    onEdit={() =>
                      navigate({
                        to: "/admin/template-builder/$templateId",
                        params: { templateId: tpl.id },
                      })
                    }
                    onDuplicate={() => duplicateMut.mutate(tpl.id)}
                    onArchive={() => archiveMut.mutate(tpl.id)}
                    onDelete={() => setDeletingId(tpl.id)}
                    isDuplicating={duplicateMut.isPending && duplicateMut.variables === tpl.id}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Create dialog */}
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">New PDF Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Template name</Label>
                <Input
                  autoFocus
                  placeholder="e.g. Standard Invoice"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newName.trim()) createMut.mutate();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Document type</Label>
                <Select value={newDocType} onValueChange={(v) => setNewDocType(v as PdfDocType)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_DOC_TYPES.map((dt) => (
                      <SelectItem key={dt} value={dt} className="text-sm">
                        {PDF_DOC_TYPE_LABELS[dt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!newName.trim() || createMut.isPending}
                onClick={() => createMut.mutate()}
              >
                {createMut.isPending ? "Creating…" : "Create & Open Builder"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete template?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the template and all its fields. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deletingId && deleteMut.mutate(deletingId)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function ColorSwatch({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <div className="flex gap-0.5 items-center">
      <span
        className="block h-5 w-2 rounded-l-sm"
        style={{ backgroundColor: primary }}
        title={primary}
      />
      <span
        className="block h-5 w-2 rounded-r-sm"
        style={{ backgroundColor: secondary }}
        title={secondary}
      />
    </div>
  );
}

function TemplateRow({
  tpl,
  showDocType,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  isDuplicating,
}: {
  tpl: PdfTemplate;
  showDocType: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  isDuplicating: boolean;
}) {
  const badge = STATUS_BADGE[tpl.status] ?? STATUS_BADGE.draft;
  const updated = new Date(tpl.updated_at).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <TableRow className="text-sm group">
      <TableCell className="pr-0">
        <ColorSwatch primary={tpl.primary_color} secondary={tpl.secondary_color} />
      </TableCell>
      <TableCell>
        <div className="space-y-0.5">
          <span className="font-medium leading-none">{tpl.name}</span>
          {tpl.description && (
            <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs">{tpl.description}</p>
          )}
        </div>
      </TableCell>
      {showDocType && (
        <TableCell>
          <span className="text-xs text-muted-foreground">
            {PDF_DOC_TYPE_LABELS[tpl.doc_type] ?? tpl.doc_type}
          </span>
        </TableCell>
      )}
      <TableCell>
        <span className="text-xs text-muted-foreground">v{tpl.version}</span>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={cn("text-xs font-normal", badge.class)}>
          {badge.label}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{updated}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Edit</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onDuplicate}
                disabled={isDuplicating}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Duplicate</TooltipContent>
          </Tooltip>

          {tpl.status !== "archived" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onArchive}>
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Archive</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Delete</TooltipContent>
          </Tooltip>
        </div>
      </TableCell>
    </TableRow>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({
  hasFilters,
  onClear,
  onCreate,
}: {
  hasFilters: boolean;
  onClear: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
      <FileText className="h-9 w-9 opacity-25" />
      {hasFilters ? (
        <>
          <p className="text-sm font-medium text-foreground">No templates match your filters</p>
          <p className="text-xs">Try adjusting the search or status filter.</p>
          <Button variant="outline" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-foreground">No templates yet</p>
          <p className="text-xs">Create your first PDF template to get started.</p>
          <Button variant="outline" size="sm" onClick={onCreate}>
            <Plus className="h-3.5 w-3.5" /> Create one
          </Button>
        </>
      )}
    </div>
  );
}
