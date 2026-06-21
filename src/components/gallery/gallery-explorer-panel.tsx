// Windows Explorer-style right panel for the File Gallery.
// Breadcrumb + navigation have moved to GalleryAddressBar.
// This panel handles: folder grid/list, file grid/list, preview, download, upload drop-zone.
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  CloudUpload,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBytes } from "@/lib/format/format-bytes";
import { getTaskFileSignedUrl } from "@/lib/ops/task-documents.functions";
import { cn } from "@/lib/shared/utils";
import type {
  GalleryFile,
  GalleryFolder,
  GalleryNode,
  GalleryNodeContent,
} from "@/lib/queries/gallery.queries";
import type { GalleryFilters } from "./gallery-toolbar";
import {
  FILE_TYPE_LABEL,
  fileIconFor,
  fileTypeOf,
  isPreviewable,
  type FileTypeKey,
} from "./gallery-utils";

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export type ViewMode = "grid" | "list";

type SortKey = "filename" | "task" | "uploader" | "created_at" | "size_bytes" | "type";
type SortDir = "asc" | "desc";

const TYPE_BADGE_CLASS: Record<string, string> = {
  pdf: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  image: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  document: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  spreadsheet: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  other: "bg-muted text-muted-foreground",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function matchesFilters(file: GalleryFile, f: GalleryFilters): boolean {
  if (f.search && !file.filename.toLowerCase().includes(f.search.toLowerCase())) return false;
  const typeKey = f.type as FileTypeKey | "all";
  if (typeKey !== "all" && fileTypeOf(file.filename, file.mime_type) !== typeKey) return false;
  return true;
}

/**
 * Container nodes that show child containers as folder cards in the right panel.
 * firm_folder  → project folder cards
 * client_folder → project folder cards
 * project_folder → task folder cards
 * These never show a flat file list and never show an upload button.
 */
function isContainerNode(node: GalleryNode | null): boolean {
  if (!node) return false;
  return (
    node.type === "firm_folder" || node.type === "client_folder" || node.type === "project_folder"
  );
}

function isResidualNode(node: GalleryNode | null): boolean {
  if (!node) return false;
  return node.type === "project_residual" || node.type === "client_residual";
}

// ---------------------------------------------------------------------------
// Folder card / row (task_folder only)
// ---------------------------------------------------------------------------

function FolderCard({
  folder,
  selected,
  onOpen,
  onClick,
  itemIdx,
}: {
  folder: GalleryFolder;
  selected: boolean;
  onOpen: () => void;
  onClick: () => void;
  itemIdx: number;
}) {
  return (
    <button
      type="button"
      data-gallery-item={itemIdx}
      onClick={onClick}
      onDoubleClick={onOpen}
      className={cn(
        "group flex w-28 flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-colors hover:bg-muted/70 focus-visible:outline-none",
        selected && "bg-indigo-50 ring-2 ring-indigo-400 dark:bg-indigo-500/15",
      )}
      title={`Double-click to open "${folder.name}"`}
    >
      <FolderOpen
        className={cn(
          "size-12 transition-transform group-hover:scale-105",
          !folder.color && "text-amber-400",
        )}
        style={folder.color ? { color: folder.color } : undefined}
      />
      <span className="line-clamp-2 w-full break-words text-xs font-medium leading-tight">
        {folder.name}
      </span>
    </button>
  );
}

function FolderListRow({
  folder,
  selected,
  onOpen,
  onClick,
  itemIdx,
}: {
  folder: GalleryFolder;
  selected: boolean;
  onOpen: () => void;
  onClick: () => void;
  itemIdx: number;
}) {
  return (
    <TableRow
      data-gallery-item={itemIdx}
      className={cn("cursor-pointer", selected && "bg-indigo-50 dark:bg-indigo-500/15")}
      onClick={onClick}
      onDoubleClick={onOpen}
    >
      <TableCell>
        <div className="flex items-center gap-2">
          <Folder
            className={cn("size-4 shrink-0", !folder.color && "text-amber-400")}
            style={folder.color ? { color: folder.color } : undefined}
          />
          <span className="font-medium">{folder.name}</span>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">Folder</TableCell>
      <TableCell />
      <TableCell />
      <TableCell className="text-right">—</TableCell>
      <TableCell />
      <TableCell />
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// File card (grid, task_folder only)
// ---------------------------------------------------------------------------

function FileCard({
  file,
  busy,
  selected,
  onPreview,
  onDownload,
  onClick,
  itemIdx,
}: {
  file: GalleryFile;
  busy: boolean;
  selected: boolean;
  onPreview: () => void;
  onDownload: () => void;
  onClick: () => void;
  itemIdx: number;
}) {
  const { Icon, className: iconCls } = fileIconFor(file.filename, file.mime_type);
  const previewable = isPreviewable(file.filename, file.mime_type);
  const t = fileTypeOf(file.filename, file.mime_type);

  return (
    <button
      type="button"
      data-gallery-item={itemIdx}
      onClick={onClick}
      onDoubleClick={previewable ? onPreview : onDownload}
      className={cn(
        "group relative flex w-28 flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-colors hover:bg-muted/70 focus-visible:outline-none",
        selected && "bg-indigo-50 ring-2 ring-indigo-400 dark:bg-indigo-500/15",
      )}
      title={file.filename}
    >
      {busy ? (
        <Loader2 className="size-12 animate-spin text-muted-foreground" />
      ) : (
        <Icon className={cn("size-12 transition-transform group-hover:scale-105", iconCls)} />
      )}
      <span className="line-clamp-2 w-full break-words text-xs leading-tight">{file.filename}</span>
      <Badge
        variant="secondary"
        className={cn("px-1 py-0 text-[9px] font-normal", TYPE_BADGE_CLASS[t])}
      >
        {FILE_TYPE_LABEL[t]}
      </Badge>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  content: GalleryNodeContent;
  node: GalleryNode | null;
  filters: GalleryFilters;
  viewMode: ViewMode;
  isLoading: boolean;
  onNavigateInto: (node: GalleryNode) => void;
};

export function GalleryExplorerPanel({
  content,
  node,
  filters,
  viewMode,
  isLoading,
  onNavigateInto,
}: Props) {
  const signUrl = useServerFn(getTaskFileSignedUrl);
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ file: GalleryFile; url: string } | null>(null);
  // Soft selection — index into the flat [folders..., files...] array
  const [focusedIdx, setFocusedIdx] = useState(-1);
  const gridRef = useRef<HTMLDivElement>(null);
  // Type-to-jump: accumulate keypresses to select the first matching item
  const typeBufferRef = useRef("");
  const typeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const container = isContainerNode(node);
  const residual = isResidualNode(node);
  const isTaskFolder = node?.type === "task_folder";
  const effectiveViewMode: ViewMode = residual ? "list" : viewMode;

  // ---- Filter + sort files ----
  const filteredFiles = content.files.filter((f) => matchesFilters(f, filters));
  const dir = sortDir === "asc" ? 1 : -1;
  const sortedFiles = [...filteredFiles].sort((a, b) => {
    switch (sortKey) {
      case "filename":
        return a.filename.localeCompare(b.filename) * dir;
      case "task":
        return (a.source_task?.title ?? "").localeCompare(b.source_task?.title ?? "") * dir;
      case "uploader":
        return (a.uploader_name ?? "").localeCompare(b.uploader_name ?? "") * dir;
      case "size_bytes":
        return ((a.size_bytes ?? 0) - (b.size_bytes ?? 0)) * dir;
      case "type":
        return (
          fileTypeOf(a.filename, a.mime_type).localeCompare(fileTypeOf(b.filename, b.mime_type)) *
          dir
        );
      default: /* created_at */
        return (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0) * dir;
    }
  });

  // ---- Flat item list for keyboard selection ----
  // Items are [folder-0, folder-1, ..., file-0, file-1, ...]
  const totalItems = content.folders.length + sortedFiles.length;

  /** Compute columns count from the grid container width (item = 112px + 8px gap). */
  function getColumns(): number {
    if (effectiveViewMode !== "grid" || !gridRef.current) return 1;
    return Math.max(1, Math.floor(gridRef.current.offsetWidth / 120));
  }

  function handlePanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (totalItems === 0) return;

    if (e.key === "Escape") {
      e.preventDefault();
      setFocusedIdx(-1);
      typeBufferRef.current = "";
      if (typeTimeoutRef.current) clearTimeout(typeTimeoutRef.current);
      return;
    }

    const cols = getColumns();
    let next = focusedIdx;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      next = focusedIdx < 0 ? 0 : Math.min(totalItems - 1, focusedIdx + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      next = focusedIdx <= 0 ? 0 : focusedIdx - 1;
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      next = focusedIdx < 0 ? 0 : Math.min(totalItems - 1, focusedIdx + cols);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      next = focusedIdx < 0 ? 0 : Math.max(0, focusedIdx - cols);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (focusedIdx < 0) return;
      if (focusedIdx < content.folders.length) {
        openFolder(content.folders[focusedIdx]);
      } else {
        const file = sortedFiles[focusedIdx - content.folders.length];
        if (file) {
          if (isPreviewable(file.filename, file.mime_type)) void handlePreview(file);
          else void handleDownload(file);
        }
      }
      return;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      // ── Type-to-jump: Windows Explorer style ──────────────────────────────
      // • Same single char repeated → cycle to the NEXT match (not "aa" search)
      // • Different char appended → refine the prefix search from the list start
      e.preventDefault();
      if (typeTimeoutRef.current) clearTimeout(typeTimeoutRef.current);

      const ch = e.key.toLowerCase();
      // Cycling: buffer is exactly this one char AND same char pressed again
      const isCycling = typeBufferRef.current === ch;
      if (!isCycling) typeBufferRef.current += ch;
      const buf = typeBufferRef.current;

      // Flat ordered name list: folders first, then files
      const names = [
        ...content.folders.map((f) => f.name.toLowerCase()),
        ...sortedFiles.map((f) => f.filename.toLowerCase()),
      ];

      let match: number;
      if (isCycling) {
        // Scan forward from just after the current selection, then wrap
        const after = names.findIndex((n, i) => i > focusedIdx && n.startsWith(ch));
        match = after >= 0 ? after : names.findIndex((n) => n.startsWith(ch));
      } else {
        match = names.findIndex((n) => n.startsWith(buf));
      }
      if (match >= 0) setFocusedIdx(match);

      typeTimeoutRef.current = setTimeout(() => {
        typeBufferRef.current = "";
      }, 600);
      return;
    } else {
      return;
    }

    setFocusedIdx(next);
  }

  // Reset selection when the node changes
  const prevNodeRef = useRef<GalleryNode | null>(null);
  if (prevNodeRef.current !== node) {
    prevNodeRef.current = node;
    if (focusedIdx !== -1) setFocusedIdx(-1);
    typeBufferRef.current = "";
  }

  // Scroll the focused item into view whenever the selection changes
  // (covers arrow-key nav, type-to-jump, and programmatic selection)
  useEffect(() => {
    if (focusedIdx < 0) return;
    document
      .querySelector<HTMLElement>(`[data-gallery-item="${focusedIdx}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusedIdx]);

  // ---- Actions ----
  async function handleDownload(file: GalleryFile) {
    if (file.sharepoint_web_url) {
      window.open(file.sharepoint_web_url, "_blank", "noopener,noreferrer");
      return;
    }
    setBusyId(file.id);
    try {
      const res = await signUrl({ data: { fileId: file.id, download: true } });
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to download");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePreview(file: GalleryFile) {
    if (file.sharepoint_web_url) {
      window.open(file.sharepoint_web_url, "_blank", "noopener,noreferrer");
      return;
    }
    setBusyId(file.id);
    try {
      const res = await signUrl({ data: { fileId: file.id, download: false } });
      setPreview({ file, url: res.url });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to open preview");
    } finally {
      setBusyId(null);
    }
  }

  function openFolder(folder: GalleryFolder) {
    // Container folder cards (projects/tasks shown as folders) carry a navigateTo node.
    if (folder.navigateTo) {
      onNavigateInto(folder.navigateTo);
      return;
    }
    // Standard task sub-folder navigation.
    if (!isTaskFolder) return;
    const tn = node as Extract<GalleryNode, { type: "task_folder" }>;
    onNavigateInto({
      type: "task_folder",
      taskId: tn.taskId,
      folderPath: folder.path,
      taskTitle: tn.taskTitle,
    });
  }

  function SortHead({
    label,
    k,
    className: cls,
  }: {
    label: string;
    k: SortKey;
    className?: string;
  }) {
    const active = sortKey === k;
    return (
      <TableHead className={cls}>
        <button
          type="button"
          onClick={() => {
            if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
            else {
              setSortKey(k);
              setSortDir(k === "created_at" ? "desc" : "asc");
            }
          }}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          {label}
          {active &&
            (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
        </button>
      </TableHead>
    );
  }

  // ---- No selection ----
  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
        <FileText className="size-12 opacity-20" />
        <p>Select a task, folder, client, or project on the left to view its files.</p>
      </div>
    );
  }

  const isEmpty = !isLoading && content.folders.length === 0 && sortedFiles.length === 0;

  return (
    <>
      {/* Content area — focusable so arrow keys reach onKeyDown */}
      <ScrollArea
        className="h-full outline-none"
        tabIndex={0}
        onKeyDown={handlePanelKeyDown}
        onFocus={() => {
          if (focusedIdx < 0 && totalItems > 0) setFocusedIdx(0);
        }}
      >
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
          </div>
        )}

        {!isLoading && isEmpty && !isTaskFolder && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-sm text-muted-foreground">
            <Folder className="size-12 opacity-20" />
            <p>{container ? "No items found." : "No files here."}</p>
          </div>
        )}

        {!isLoading && isEmpty && isTaskFolder && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-sm text-muted-foreground">
            <CloudUpload className="size-12 opacity-20" />
            <p>No files here yet.</p>
            <p className="text-xs">Drop files or use the Upload button to add documents.</p>
          </div>
        )}

        {/* Grid view */}
        {!isLoading && !isEmpty && effectiveViewMode === "grid" && (
          <div className="p-4" ref={gridRef}>
            {content.folders.length > 0 && (
              <div className="mb-4">
                {sortedFiles.length > 0 && (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Folders
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {content.folders.map((f, fi) => (
                    <FolderCard
                      key={f.path}
                      folder={f}
                      selected={focusedIdx === fi}
                      onOpen={() => openFolder(f)}
                      onClick={() => setFocusedIdx(fi)}
                      itemIdx={fi}
                    />
                  ))}
                </div>
              </div>
            )}
            {sortedFiles.length > 0 && (
              <div>
                {content.folders.length > 0 && (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Files
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {sortedFiles.map((file, fi) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      busy={busyId === file.id}
                      selected={focusedIdx === content.folders.length + fi}
                      onPreview={() => handlePreview(file)}
                      onDownload={() => handleDownload(file)}
                      onClick={() => setFocusedIdx(content.folders.length + fi)}
                      itemIdx={content.folders.length + fi}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* List view */}
        {!isLoading && !isEmpty && effectiveViewMode === "list" && (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <SortHead label="Name" k="filename" />
                <TableHead>Kind</TableHead>
                {/* Task column shown for residual views (shared files need source tracing) */}
                {residual && <SortHead label="Task" k="task" />}
                <SortHead label="Uploaded By" k="uploader" />
                <SortHead label="Date" k="created_at" />
                <SortHead label="Size" k="size_bytes" className="text-right" />
                <SortHead label="Type" k="type" />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Folders */}
              {content.folders.map((f, fi) => (
                <FolderListRow
                  key={f.path}
                  folder={f}
                  selected={focusedIdx === fi}
                  onOpen={() => openFolder(f)}
                  onClick={() => setFocusedIdx(fi)}
                  itemIdx={fi}
                />
              ))}

              {/* Files */}
              {sortedFiles.map((file, fi) => {
                const fileIdx = content.folders.length + fi;
                const t = fileTypeOf(file.filename, file.mime_type);
                const { Icon, className: iconCls } = fileIconFor(file.filename, file.mime_type);
                const taskParam = isTaskFolder
                  ? (node as Extract<GalleryNode, { type: "task_folder" }>).taskId
                  : (file.source_task?.slug ?? file.task_id);
                return (
                  <TableRow
                    key={file.id}
                    data-gallery-item={fileIdx}
                    className={cn(
                      "cursor-default",
                      focusedIdx === fileIdx && "bg-indigo-50 dark:bg-indigo-500/15",
                    )}
                    onClick={() => setFocusedIdx(fileIdx)}
                    onDoubleClick={() => {
                      if (isPreviewable(file.filename, file.mime_type)) void handlePreview(file);
                      else void handleDownload(file);
                    }}
                  >
                    <TableCell className="max-w-[240px]">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("size-4 shrink-0", iconCls)} />
                        <span className="truncate font-medium" title={file.filename}>
                          {file.filename}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">File</TableCell>
                    {residual && (
                      <TableCell
                        className="max-w-[180px] truncate text-muted-foreground"
                        title={file.source_task?.title ?? ""}
                      >
                        {file.source_task?.title ?? "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground">
                      {file.uploader_name ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(file.created_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right tabular-nums text-muted-foreground">
                      {formatBytes(file.size_bytes) || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn("font-normal", TYPE_BADGE_CLASS[t])}>
                        {FILE_TYPE_LABEL[t]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        {isPreviewable(file.filename, file.mime_type) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            disabled={busyId === file.id}
                            onClick={() => handlePreview(file)}
                            title="Preview"
                          >
                            <Eye className="size-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          disabled={busyId === file.id}
                          onClick={() => handleDownload(file)}
                          title={file.sharepoint_web_url ? "Open in SharePoint" : "Download"}
                        >
                          {busyId === file.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : file.sharepoint_web_url ? (
                            <ExternalLink className="size-4" />
                          ) : (
                            <Download className="size-4" />
                          )}
                        </Button>
                        <Button
                          asChild
                          size="icon"
                          variant="ghost"
                          className="size-8"
                          title="Go to Task"
                        >
                          <Link
                            to="/ops/tasks/$taskId"
                            params={{ taskId: taskParam }}
                            search={{ tab: "files" }}
                          >
                            <ExternalLink className="size-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ScrollArea>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-6">{preview?.file.filename}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="h-[70vh] w-full overflow-auto rounded border bg-muted/30">
              {fileTypeOf(preview.file.filename, preview.file.mime_type) === "image" ? (
                <img
                  src={preview.url}
                  alt={preview.file.filename}
                  className="mx-auto max-h-full object-contain"
                />
              ) : (
                <iframe src={preview.url} title={preview.file.filename} className="h-full w-full" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
