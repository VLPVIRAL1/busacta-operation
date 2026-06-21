import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  ChevronDown,
  CloudUpload,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/shared/utils";
import { formatBytes } from "@/lib/format/format-bytes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  listTaskDocuments,
  createTaskFolder,
  recordUploadedFile,
  renameTaskFile,
  renameTaskFolder,
  moveTaskFiles,
  moveTaskFolder,
  setTaskFileVisibility,
  setTaskFileShared,
  setTaskFolderVisibility,
  setTaskFolderColor,
  deleteTaskFiles,
  deleteTaskFolder,
  getTaskFileSignedUrl,
  renameTaskFilesBulk,
  listProjectFileCategories,
  createProjectFileCategory,
  renameProjectFileCategory,
  deleteProjectFileCategory,
  createAndAssignProjectFileCategory,
  setTaskFileCategory,
  setTaskFileDescription,
  listArchivedTaskDocuments,
  archiveTaskFiles,
  restoreTaskFiles,
  type TaskFileRow,
  type TaskFolderRow,
} from "@/lib/ops/task-documents.functions";
import { DocumentPreviewSheet, type PreviewSheetState } from "./document-preview-sheet";
import { DocumentMoveDialog } from "./document-move-dialog";
import { DocumentBulkRenameDialog } from "./document-bulk-rename-dialog";
import { DocumentAuditDialog } from "./document-audit-dialog";
import { NewFolderDialog } from "./new-folder-dialog";
import { FileRequestDialog } from "./file-request-dialog";
import {
  History,
  Filter,
  Tag,
  Bookmark,
  Users,
  Lock,
  Link2,
  Archive,
  ArchiveRestore,
  Info,
  SlidersHorizontal,
} from "lucide-react";
import { toneChip, type ToneColor } from "@/lib/ui/tone";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CategoryChip,
  CategoryChips,
  CategoryPickerPopover,
  DescriptionDialog,
  type CategoryOption,
} from "./file-meta-controls";
import { CategoryDeleteDialog, type CategoryDeleteResult } from "./category-delete-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmt(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${MONTHS[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

function fileIconFor(name: string) {
  const e = extOf(name);
  if (e === "pdf") return { Icon: FileText, className: "text-red-500" };
  if (["xls", "xlsx", "csv"].includes(e))
    return { Icon: FileSpreadsheet, className: "text-emerald-600" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(e))
    return { Icon: FileImage, className: "text-blue-500" };
  if (["doc", "docx"].includes(e)) return { Icon: FileText, className: "text-sky-600" };
  return { Icon: FileIcon, className: "text-slate-500" };
}

type ContentTag = "PDF" | "Image" | "Spreadsheet" | "Document" | "Archive" | "Other";
const CONTENT_TAG_TONE: Record<ContentTag, ToneColor> = {
  PDF: "rose",
  Image: "sky",
  Spreadsheet: "emerald",
  Document: "indigo",
  Archive: "amber",
  Other: "slate",
};
function contentTypeTag(mime: string | null | undefined, filename: string): ContentTag {
  const e = extOf(filename);
  if (mime === "application/pdf" || e === "pdf") return "PDF";
  if (
    (mime ?? "").startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(e)
  )
    return "Image";
  if (["xls", "xlsx", "csv", "ods", "numbers"].includes(e) || (mime ?? "").includes("spreadsheet"))
    return "Spreadsheet";
  if (
    ["doc", "docx", "rtf", "odt", "txt", "md", "pages"].includes(e) ||
    (mime ?? "").includes("word") ||
    (mime ?? "").includes("document")
  )
    return "Document";
  if (["zip", "rar", "7z", "tar", "gz"].includes(e)) return "Archive";
  return "Other";
}

const CAT_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  auto: { label: "Auto", className: "bg-blue-100 text-blue-800" },
  confirmed: { label: "Confirmed", className: "bg-green-100 text-green-800" },
  overridden: { label: "Overridden", className: "bg-amber-100 text-amber-800" },
  needs_review: { label: "Review", className: "bg-red-100 text-red-800" },
};

function CategorisationBadge({ file }: { file: any }) {
  if (!file.categorisation_status || file.categorisation_status === "pending") {
    return null;
  }
  if (file.categorisation_status === "processing") {
    return <span className="text-[10px] text-muted-foreground">Processing...</span>;
  }
  if (file.categorisation_status === "ocr_failed") {
    return (
      <Badge variant="destructive" className="text-[10px]">
        OCR Failed
      </Badge>
    );
  }
  if (file.categorisation_status === "unsupported") {
    return (
      <Badge variant="outline" className="text-[10px]">
        Unsupported
      </Badge>
    );
  }

  const docType = file.doc_type;
  if (!docType) return null;

  const isMulti = docType === "MULTI";

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge
        variant="secondary"
        className={cn("text-[10px]", isMulti ? "bg-purple-100 text-purple-800" : "")}
      >
        {isMulti ? "Multi-doc" : docType.replace(/_/g, "-")}
      </Badge>
      {file.confidence_score != null && (
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {file.confidence_score}%
        </span>
      )}
    </div>
  );
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Derive folder tree from explicit folder paths + folder_paths on files
type TreeNode = { name: string; path: string; children: Map<string, TreeNode> };

function buildFolderTree(folderPaths: string[], rootLabel: string): TreeNode {
  const root: TreeNode = { name: rootLabel, path: "", children: new Map() };
  const all = new Set<string>(folderPaths.filter(Boolean));
  for (const p of [...all]) {
    const segs = p.split("/");
    for (let i = 1; i <= segs.length; i++) all.add(segs.slice(0, i).join("/"));
  }
  for (const p of [...all].sort()) {
    const segs = p.split("/");
    let cursor = root;
    for (let i = 0; i < segs.length; i++) {
      const sub = segs.slice(0, i + 1).join("/");
      if (!cursor.children.has(segs[i])) {
        cursor.children.set(segs[i], { name: segs[i], path: sub, children: new Map() });
      }
      cursor = cursor.children.get(segs[i])!;
    }
  }
  return root;
}

export type DocumentManagerProps = {
  taskId: string;
  firmName?: string;
};

export function DocumentManager({ taskId, firmName = "Task Documents" }: DocumentManagerProps) {
  const qc = useQueryClient();
  const queryKey = ["task-documents", taskId];

  const listFn = useServerFn(listTaskDocuments);
  const listArchivedFn = useServerFn(listArchivedTaskDocuments);
  const createFolderFn = useServerFn(createTaskFolder);
  const recordFileFn = useServerFn(recordUploadedFile);
  const renameFileFn = useServerFn(renameTaskFile);
  const renameFolderFn = useServerFn(renameTaskFolder);
  const moveFilesFn = useServerFn(moveTaskFiles);
  const moveFolderFn = useServerFn(moveTaskFolder);
  const setVisFn = useServerFn(setTaskFileVisibility);
  const setSharedFn = useServerFn(setTaskFileShared);
  const setFolderVisFn = useServerFn(setTaskFolderVisibility);
  const deleteFilesFn = useServerFn(deleteTaskFiles);
  const deleteFolderFn = useServerFn(deleteTaskFolder);
  const signedUrlFn = useServerFn(getTaskFileSignedUrl);
  const bulkRenameFn = useServerFn(renameTaskFilesBulk);
  const listCategoriesFn = useServerFn(listProjectFileCategories);
  const setCategoryFn = useServerFn(setTaskFileCategory);
  const createCategoryFn = useServerFn(createProjectFileCategory);
  const renameCategoryFn = useServerFn(renameProjectFileCategory);
  const deleteCategoryFn = useServerFn(deleteProjectFileCategory);
  const createAndAssignFn = useServerFn(createAndAssignProjectFileCategory);
  const setDescriptionFn = useServerFn(setTaskFileDescription);
  const archiveFn = useServerFn(archiveTaskFiles);
  const restoreFn = useServerFn(restoreTaskFiles);

  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ["project-file-categories", "by-task", taskId],
    queryFn: () => listCategoriesFn({ data: { taskId } }),
    placeholderData: (prev) => prev,
  });
  const categories: CategoryOption[] = (categoriesData ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
  }));
  const categoryById = useMemo(() => {
    const m = new Map<string, CategoryOption>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);
  const [viewArchive, setViewArchive] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { taskId } }),
  });
  const { data: archivedData } = useQuery({
    queryKey: ["task-documents-archived", taskId],
    queryFn: () => listArchivedFn({ data: { taskId } }),
  });
  const archivedFiles: TaskFileRow[] = (archivedData ?? []) as TaskFileRow[];
  const activeFiles: TaskFileRow[] = data?.files ?? [];
  const files: TaskFileRow[] = viewArchive ? archivedFiles : activeFiles;
  const folders: TaskFolderRow[] = data?.folders ?? [];
  const folderVisMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const f of folders) m.set(f.path, f.is_client_visible);
    return m;
  }, [folders]);
  const folderColorMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const f of folders) m.set(f.path, f.color ?? null);
    return m;
  }, [folders]);

  const allFolderPaths = useMemo(() => {
    const set = new Set<string>(folders.map((f) => f.path));
    for (const f of files) if (f.folder_path) set.add(f.folder_path);
    return [...set];
  }, [folders, files]);

  const tree = useMemo(() => buildFolderTree(allFolderPaths, firmName), [allFolderPaths, firmName]);
  // Folder color filter. Values are hex colors from FOLDER_COLOR_SWATCHES, plus
  // a special sentinel "__none__" for uncolored folders. Declared here (early)
  // so the visibleTreePaths memo below can read it.
  const [colorFilter, setColorFilter] = useState<Set<string>>(new Set());

  // When color filter is active, compute the set of folder paths that should
  // remain visible in the tree: matching folders + all of their ancestors so
  // the tree remains navigable. Root ("") is always visible.
  const visibleTreePaths = useMemo<Set<string> | null>(() => {
    if (colorFilter.size === 0) return null;
    const matches = new Set<string>([""]);
    for (const p of allFolderPaths) {
      if (!p) continue;
      const color = folderColorMap.get(p) ?? null;
      const key = color ?? "__none__";
      if (colorFilter.has(key)) {
        matches.add(p);
        const segs = p.split("/");
        for (let i = 1; i < segs.length; i++) matches.add(segs.slice(0, i).join("/"));
      }
    }
    return matches;
  }, [colorFilter, allFolderPaths, folderColorMap]);

  const [selectedPath, setSelectedPath] = useState<string>("");
  const expandedStorageKey = `wi-files-expanded:${taskId}`;
  // Default: expand root + all top-level folders (depth ≤ 1 in the tree, i.e.
  // folder paths with no "/" — which still expands two visual layers because
  // the root node and its direct children are shown).
  const defaultExpanded = useMemo(() => {
    const s = new Set<string>([""]);
    for (const p of allFolderPaths) {
      if (p && !p.includes("/")) s.add(p);
    }
    return s;
  }, [allFolderPaths]);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set([""]);
    try {
      const raw = window.localStorage.getItem(expandedStorageKey);
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr)) return new Set(arr);
      }
    } catch {
      /* ignore */
    }
    return new Set([""]);
  });
  // Seed defaults once folder list is known (only if user hasn't customised yet).
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (allFolderPaths.length === 0) return;
    try {
      const raw = window.localStorage.getItem(expandedStorageKey);
      if (!raw) {
        setExpanded(defaultExpanded);
      }
    } catch {
      /* ignore */
    }
    seededRef.current = true;
  }, [allFolderPaths, defaultExpanded, expandedStorageKey]);
  useEffect(() => {
    try {
      window.localStorage.setItem(expandedStorageKey, JSON.stringify([...expanded]));
    } catch {
      /* ignore */
    }
  }, [expanded, expandedStorageKey]);
  const [dragDepth, setDragDepth] = useState(0);
  const [internalDrag, setInternalDrag] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [preview, setPreview] = useState<PreviewSheetState>({ open: false, file: null, url: null });
  const [moveDialog, setMoveDialog] = useState<{
    open: boolean;
    kind: "files" | "folder";
    ids?: string[];
    folderPath?: string;
  }>({ open: false, kind: "files" });
  const [bulkRename, setBulkRename] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    open: boolean;
    folderPath?: string;
    fileIds?: string[];
    label: string;
  }>({ open: false, label: "" });
  const [auditDialog, setAuditDialog] = useState<{
    open: boolean;
    nodeIds?: string[];
    title: string;
  }>({ open: false, title: "" });
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [fileRequestOpen, setFileRequestOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  type FilesColKey = "category" | "visibility" | "modified" | "size";
  const VIS_COLS_LS = `task-files:${taskId}:cols`;
  const [visibleCols, setVisibleCols] = useState<Record<FilesColKey, boolean>>(() => {
    const defaults: Record<FilesColKey, boolean> = {
      category: true,
      visibility: true,
      modified: true,
      size: true,
    };
    if (typeof window === "undefined") return defaults;
    try {
      const raw = window.localStorage.getItem(VIS_COLS_LS);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<Record<FilesColKey, boolean>>;
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(VIS_COLS_LS, JSON.stringify(visibleCols));
    } catch {
      /* ignore */
    }
  }, [visibleCols, VIS_COLS_LS]);

  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [rowCategoryOpenId, setRowCategoryOpenId] = useState<string | null>(null);
  const [deleteCategoryState, setDeleteCategoryState] = useState<{
    open: boolean;
    target: { id: string; name: string } | null;
  }>({ open: false, target: null });
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [descriptionDialog, setDescriptionDialog] = useState<{
    open: boolean;
    fileId: string;
    filename: string;
    initial: string;
  }>({ open: false, fileId: "", filename: "", initial: "" });
  const [sortKey, setSortKey] = useState<"name" | "category" | "modified" | "size">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const toggleSort = (k: "name" | "category" | "modified" | "size") => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resizable folder-tree column width (md+ only). Persisted per task.
  const treeWidthKey = `wi-files-tree-w:${taskId}`;
  const TREE_W_DEFAULT = 240;
  const [treeColPx, setTreeColPx] = useState<number>(() => {
    if (typeof window === "undefined") return TREE_W_DEFAULT;
    const n = Number(window.localStorage.getItem(treeWidthKey));
    return Number.isFinite(n) && n >= 180 && n <= 560 ? n : TREE_W_DEFAULT;
  });
  const treeDragRef = useRef(false);
  useEffect(() => {
    try {
      window.localStorage.setItem(treeWidthKey, String(Math.round(treeColPx)));
    } catch {
      /* ignore */
    }
  }, [treeColPx, treeWidthKey]);
  const startTreeDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    treeDragRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const moveTreeDrag = (e: React.PointerEvent) => {
    if (!treeDragRef.current) return;
    const container = (e.currentTarget as HTMLElement).closest(
      "[data-files-grid]",
    ) as HTMLElement | null;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const next = Math.max(180, Math.min(560, e.clientX - rect.left));
    setTreeColPx(next);
  };
  const endTreeDrag = (e: React.PointerEvent) => {
    if (!treeDragRef.current) return;
    treeDragRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  const breadcrumb = useMemo(() => {
    const segs = selectedPath ? selectedPath.split("/") : [];
    const arr = [{ name: firmName, path: "" }];
    for (let i = 0; i < segs.length; i++) {
      arr.push({ name: segs[i], path: segs.slice(0, i + 1).join("/") });
    }
    return arr;
  }, [selectedPath, firmName]);

  // Rows in current folder: subfolders (immediate) + files in current path.
  // When `search` is set, switch to a flat global view filtered by name.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const catSet = categoryFilter;
    const fileMatchesCat = (f: TaskFileRow) => {
      if (catSet.size === 0) return true;
      const ids =
        f.category_ids && f.category_ids.length > 0
          ? f.category_ids
          : f.category_id
            ? [f.category_id]
            : [];
      return ids.some((id) => catSet.has(id));
    };
    const catLabel = (f: TaskFileRow) => {
      const first = (f.category_ids && f.category_ids[0]) ?? f.category_id ?? null;
      return first ? (categoryById.get(first)?.name ?? "") : "";
    };
    const cmpFiles = (a: TaskFileRow, b: TaskFileRow) => {
      let r = 0;
      if (sortKey === "name") r = a.filename.localeCompare(b.filename);
      else if (sortKey === "category") {
        const la = catLabel(a),
          lb = catLabel(b);
        r =
          la === lb
            ? a.filename.localeCompare(b.filename)
            : !la
              ? 1
              : !lb
                ? -1
                : la.localeCompare(lb);
      } else if (sortKey === "modified") {
        r = (a.created_at ?? "").localeCompare(b.created_at ?? "");
      } else if (sortKey === "size") {
        r = (a.size_bytes ?? 0) - (b.size_bytes ?? 0);
      }
      return sortDir === "asc" ? r : -r;
    };
    const sortFiles = (arr: TaskFileRow[]) =>
      [...arr]
        .sort(cmpFiles)
        .map((f) => ({ kind: "file" as const, id: f.id, name: f.filename, file: f }));
    const cmpFolders = (a: { name: string }, b: { name: string }) =>
      sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);

    if (viewArchive) {
      const filtered = files.filter(
        (f) =>
          fileMatchesCat(f) &&
          (!q ||
            f.filename.toLowerCase().includes(q) ||
            (f.description ?? "").toLowerCase().includes(q)),
      );
      return sortFiles(filtered);
    }
    if (q) {
      const matchedFolders =
        catSet.size === 0
          ? allFolderPaths
              .filter((p) => p && p.toLowerCase().includes(q))
              .map((p) => ({
                kind: "folder" as const,
                id: `f:${p}`,
                name: p.split("/").pop() ?? p,
                path: p,
              }))
          : [];
      const matchedFiles = files.filter(
        (f) =>
          fileMatchesCat(f) &&
          (f.filename.toLowerCase().includes(q) || (f.description ?? "").toLowerCase().includes(q)),
      );
      return [...matchedFolders.sort(cmpFolders), ...sortFiles(matchedFiles)];
    }
    const cursor = walk(tree, selectedPath);
    const subFolders =
      catSet.size === 0 && cursor
        ? [...cursor.children.values()].map((c) => ({
            kind: "folder" as const,
            id: `f:${c.path}`,
            name: c.name,
            path: c.path,
          }))
        : [];
    // When a category filter is active, expand to include files in all
    // descendant folders of the selected folder (not just direct children).
    const prefix = selectedPath ? selectedPath + "/" : "";
    const fileRows = files.filter((f) => {
      if (!fileMatchesCat(f)) return false;
      const fp = f.folder_path ?? "";
      if (catSet.size > 0) {
        return fp === selectedPath || (prefix === "" ? true : fp.startsWith(prefix));
      }
      return fp === selectedPath;
    });
    return [...subFolders.sort(cmpFolders), ...sortFiles(fileRows)];
  }, [
    tree,
    selectedPath,
    files,
    search,
    allFolderPaths,
    categoryFilter,
    viewArchive,
    sortKey,
    sortDir,
    categoryById,
  ]);

  // Compute folder size by summing all files inside
  const folderSize = (path: string) => {
    const prefix = path + "/";
    return files
      .filter((f) => f.folder_path === path || (f.folder_path ?? "").startsWith(prefix))
      .reduce((acc, f) => acc + (f.size_bytes ?? 0), 0);
  };
  const folderModified = (path: string) => {
    const prefix = path + "/";
    const candidates = files.filter(
      (f) => f.folder_path === path || (f.folder_path ?? "").startsWith(prefix),
    );
    if (!candidates.length) return null;
    return candidates.reduce(
      (max, f) => (f.created_at > max ? f.created_at : max),
      candidates[0].created_at,
    );
  };

  // Clear selection on folder change
  useEffect(() => {
    setSelectedFileIds(new Set());
    setEditingId(null);
  }, [selectedPath]);

  // ----- Mutations -----
  const invalidate = () => qc.invalidateQueries({ queryKey });

  const mNewFolder = useMutation({
    mutationFn: (name: string) => createFolderFn({ data: { taskId, parent: selectedPath, name } }),
    onSuccess: () => {
      invalidate();
      toast.success("Folder created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mRenameFile = useMutation({
    mutationFn: (v: { fileId: string; name: string }) => renameFileFn({ data: v }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const mRenameFolder = useMutation({
    mutationFn: (v: { oldPath: string; newPath: string }) =>
      renameFolderFn({ data: { taskId, ...v } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const mMoveFiles = useMutation({
    mutationFn: (v: { fileIds: string[]; toFolder: string }) => moveFilesFn({ data: v }),
    onSuccess: () => {
      invalidate();
      toast.success("Moved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mMoveFolder = useMutation({
    mutationFn: (v: { fromPath: string; toParent: string }) =>
      moveFolderFn({ data: { taskId, ...v } }),
    onSuccess: () => {
      invalidate();
      toast.success("Folder moved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mSetVisibility = useMutation({
    mutationFn: (v: { fileIds: string[]; visible: boolean | null }) => setVisFn({ data: v }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const mSetFolderVisibility = useMutation({
    mutationFn: (v: { path: string; visible: boolean }) =>
      setFolderVisFn({ data: { taskId, path: v.path, visible: v.visible } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  // Flag/unflag a file as "shared" so it surfaces in the project/client Residual
  // (Shared Resources) folder of the File Gallery. The file stays in this task.
  const mSetShared = useMutation({
    mutationFn: (v: { fileId: string; isShared: boolean }) => setSharedFn({ data: v }),
    onSuccess: (r: { isShared: boolean }) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["gallery-tree"] });
      qc.invalidateQueries({ queryKey: ["gallery-node-files"] });
      toast.success(r.isShared ? "Added to Residual (Shared Resources)" : "Removed from Residual");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setFolderColorFn = useServerFn(setTaskFolderColor);
  const mSetFolderColor = useMutation({
    mutationFn: (v: { path: string; color: string | null }) =>
      setFolderColorFn({ data: { taskId, path: v.path, color: v.color } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<typeof data>(queryKey);
      if (previous && previous.folders) {
        qc.setQueryData(queryKey, {
          ...previous,
          folders: previous.folders.map((f) => (f.path === v.path ? { ...f, color: v.color } : f)),
        });
      }
      return { previous };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous);
      toast.error(e.message);
    },
    onSettled: () => invalidate(),
  });

  const mDeleteFiles = useMutation({
    mutationFn: (fileIds: string[]) => deleteFilesFn({ data: { fileIds } }),
    onSuccess: () => {
      invalidate();
      setSelectedFileIds(new Set());
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mDeleteFolder = useMutation({
    mutationFn: (path: string) => deleteFolderFn({ data: { taskId, path } }),
    onSuccess: () => {
      invalidate();
      toast.success("Folder deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mBulkRename = useMutation({
    mutationFn: (renames: Array<{ fileId: string; name: string }>) =>
      bulkRenameFn({ data: { renames } }),
    onSuccess: (res) => {
      invalidate();
      setBulkRename(false);
      setSelectedFileIds(new Set());
      toast.success(`Renamed ${res.count} files`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mSetCategory = useMutation({
    mutationFn: (v: { fileIds: string[]; categoryId?: string | null; categoryIds?: string[] }) =>
      setCategoryFn({
        data: { ...v, taskId } as { fileIds: string[]; categoryId: string | null; taskId: string },
      }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["task-audit", taskId] });
      toast.success("Category updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const categoriesQueryKey = ["project-file-categories", "by-task", taskId];
  const mCreateCategory = useMutation({
    mutationFn: (v: { name: string }) => createCategoryFn({ data: { taskId, name: v.name } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoriesQueryKey });
      qc.invalidateQueries({ queryKey: ["task-audit", taskId] });
      toast.success("Category created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mRenameCategory = useMutation({
    mutationFn: (v: { categoryId: string; name: string }) =>
      renameCategoryFn({ data: { ...v, taskId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoriesQueryKey });
      qc.invalidateQueries({ queryKey: ["task-audit", taskId] });
      invalidate();
      toast.success("Category renamed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mDeleteCategory = useMutation({
    mutationFn: (v: {
      categoryId: string;
      mode: "untag" | "reassign";
      reassignToCategoryId?: string;
    }) =>
      deleteCategoryFn({
        data: {
          categoryId: v.categoryId,
          mode: v.mode,
          reassignToCategoryId: v.reassignToCategoryId ?? null,
          taskId,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: categoriesQueryKey });
      qc.invalidateQueries({ queryKey: ["task-audit", taskId] });
      invalidate();
      setDeleteCategoryState({ open: false, target: null });
      const n = res?.affectedFiles ?? 0;
      if (res?.mode === "reassign") {
        toast.success(
          n > 0
            ? `Category deleted, ${n} file${n === 1 ? "" : "s"} reassigned`
            : "Category deleted",
        );
      } else {
        toast.success(
          n > 0 ? `Category deleted, ${n} file${n === 1 ? "" : "s"} untagged` : "Category deleted",
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mCreateAndAssign = useMutation({
    mutationFn: (v: {
      name: string;
      fileIds: string[];
      existingCategoryIds?: string[];
      mode?: "add" | "replace";
    }) => createAndAssignFn({ data: { taskId, ...v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: categoriesQueryKey });
      qc.invalidateQueries({ queryKey: ["task-audit", taskId] });
      invalidate();
      toast.success("Category created and applied");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mSetDescription = useMutation({
    mutationFn: (v: { fileId: string; description: string | null }) =>
      setDescriptionFn({ data: v }),
    onSuccess: () => {
      invalidate();
      toast.success("Description saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mArchive = useMutation({
    mutationFn: (fileIds: string[]) => archiveFn({ data: { fileIds } }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["task-documents-archived", taskId] });
      setSelectedFileIds(new Set());
      toast.success("Archived");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mRestore = useMutation({
    mutationFn: (fileIds: string[]) => restoreFn({ data: { fileIds } }),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["task-documents-archived", taskId] });
      setSelectedFileIds(new Set());
      toast.success("Restored");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [uploading, setUploading] = useState(false);
  async function uploadFiles(fileList: FileList | File[]) {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    setUploading(true);
    try {
      for (const f of arr) {
        const cleanName = f.name.replace(/[\/\\]/g, "_");
        const storagePath = `${taskId}/${selectedPath ? selectedPath + "/" : ""}${uuid()}-${cleanName}`;
        const { error } = await supabase.storage.from("task-attachments").upload(storagePath, f);
        if (error) throw new Error(error.message);
        await recordFileFn({
          data: {
            taskId,
            folderPath: selectedPath,
            storagePath,
            filename: cleanName,
            sizeBytes: f.size,
            mimeType: f.type || null,
            isClientVisible: false,
          },
        });
      }
      toast.success(`Uploaded ${arr.length} file${arr.length === 1 ? "" : "s"}`);
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  // ----- Actions -----
  async function openPreview(file: TaskFileRow) {
    setPreview({ open: true, file, url: null });
    try {
      const res = await signedUrlFn({ data: { fileId: file.id, download: false } });
      setPreview((p) => (p.file?.id === file.id ? { ...p, url: res.url } : p));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load preview");
      setPreview({ open: false, file: null, url: null });
    }
  }

  async function downloadFile(file: TaskFileRow) {
    try {
      const res = await signedUrlFn({ data: { fileId: file.id, download: true } });
      const a = document.createElement("a");
      a.href = res.url;
      a.download = file.filename;
      a.rel = "noreferrer";
      a.click();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  }

  async function downloadCurrentPreview() {
    if (preview.file) await downloadFile(preview.file);
  }

  function startEdit(id: string, name: string) {
    setEditingId(id);
    setEditingValue(name);
  }

  async function commitEdit(
    row:
      | { kind: "file"; id: string; name: string }
      | { kind: "folder"; path: string; name: string },
  ) {
    const name = editingValue.trim();
    setEditingId(null);
    if (!name || name === row.name) return;
    if (row.kind === "file") {
      mRenameFile.mutate({ fileId: row.id, name });
    } else {
      const parent = row.path.includes("/") ? row.path.split("/").slice(0, -1).join("/") : "";
      const newPath = parent ? `${parent}/${name}` : name;
      mRenameFolder.mutate({ oldPath: row.path, newPath });
    }
  }

  // ----- Drag and drop between folders -----
  function onRowDragStart(
    e: React.DragEvent,
    ids: string[],
    kind: "file" | "folder",
    path?: string,
  ) {
    e.dataTransfer.setData(
      "application/x-doc-node",
      JSON.stringify({ kind, ids, folderPath: path }),
    );
    e.dataTransfer.effectAllowed = "move";
    setInternalDrag(true);
  }

  function onFolderDrop(e: React.DragEvent, targetPath: string) {
    setInternalDrag(false);
    const raw = e.dataTransfer.getData("application/x-doc-node");
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const payload = JSON.parse(raw) as {
        kind: "file" | "folder";
        ids: string[];
        folderPath?: string;
      };
      if (payload.kind === "file") {
        mMoveFiles.mutate({ fileIds: payload.ids, toFolder: targetPath });
      } else if (payload.kind === "folder" && payload.folderPath) {
        if (payload.folderPath === targetPath) return;
        if (targetPath.startsWith(payload.folderPath + "/") || targetPath === payload.folderPath) {
          toast.error("Cannot move a folder into itself");
          return;
        }
        mMoveFolder.mutate({ fromPath: payload.folderPath, toParent: targetPath });
      }
    } catch {
      // ignore
    }
  }

  // ----- Selection helpers -----
  const fileRowsInView = rows.filter((r) => r.kind === "file") as Array<{
    kind: "file";
    id: string;
    name: string;
    file: TaskFileRow;
  }>;
  const allSelected =
    fileRowsInView.length > 0 && fileRowsInView.every((r) => selectedFileIds.has(r.id));
  function toggleAll() {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (allSelected) fileRowsInView.forEach((r) => next.delete(r.id));
      else fileRowsInView.forEach((r) => next.add(r.id));
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectedFiles = files.filter((f) => selectedFileIds.has(f.id));
  const allSelectedVisible =
    selectedFiles.length > 0 && selectedFiles.every((f) => f.is_client_visible);

  // ----- Render -----
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white/70 backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/60">
      <div
        data-files-grid
        className="grid grid-cols-1 md:grid-flow-col"
        style={{ gridTemplateColumns: `minmax(0, ${treeColPx}px) 6px minmax(0, 1fr)` }}
      >
        {/* Left: tree */}
        <aside className="flex flex-col border-b border-slate-200/60 p-2 md:border-b-0 dark:border-slate-700/60">
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Folders
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExpanded(new Set(["", ...allFolderPaths]))}
                className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Expand all"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={() => setExpanded(new Set([""]))}
                className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Collapse all"
              >
                Collapse all
              </button>
              <button
                type="button"
                onClick={() => setTreeColPx(TREE_W_DEFAULT)}
                className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Reset width"
              >
                Reset
              </button>
            </div>
          </div>
          {/* Color filter chips removed per redesign — color UI is hidden. */}

          <div className="flex-1 min-h-0 overflow-y-auto">
            <TreeRow
              visiblePaths={visibleTreePaths}
              node={tree}
              depth={0}
              selectedPath={viewArchive ? "__archive__" : selectedPath}
              expanded={expanded}
              visibilityMap={folderVisMap}
              colorMap={folderColorMap}
              onSetColor={(path, color) => mSetFolderColor.mutate({ path, color })}
              onToggle={(p) =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  next.has(p) ? next.delete(p) : next.add(p);
                  return next;
                })
              }
              onSelect={(p) => {
                setViewArchive(false);
                setSelectedPath(p);
              }}
              onDrop={onFolderDrop}
            />
          </div>
          {/* Archive — sticky bottom-left of folder pane */}
          <button
            type="button"
            onClick={() => {
              setViewArchive(true);
              setSelectedFileIds(new Set());
            }}
            className={cn(
              "mt-2 flex w-full shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors border-t border-slate-200/60 pt-2 dark:border-slate-700/60",
              viewArchive
                ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                : "text-slate-600 hover:bg-slate-100/70 dark:text-slate-400 dark:hover:bg-slate-800/50",
            )}
          >
            <Archive className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate font-medium">Archive</span>
            {archivedFiles.length > 0 && (
              <span className="text-[10px] tabular-nums opacity-70">{archivedFiles.length}</span>
            )}
          </button>
        </aside>

        {/* Resizer (md+) */}
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={startTreeDrag}
          onPointerMove={moveTreeDrag}
          onPointerUp={endTreeDrag}
          onPointerCancel={endTreeDrag}
          onDoubleClick={() => setTreeColPx(TREE_W_DEFAULT)}
          className="hidden md:flex cursor-col-resize items-center justify-center border-r border-slate-200/60 hover:bg-indigo-100/40 dark:border-slate-700/60 dark:hover:bg-indigo-500/10"
          title="Drag to resize · double-click to reset"
        >
          <span className="h-8 w-px bg-slate-300/70 dark:bg-slate-600/70" />
        </div>

        {/* Right: explorer */}
        <section
          className="relative flex min-h-[460px] flex-col"
          onDragEnter={(e) => {
            if (e.dataTransfer?.types?.includes("Files")) {
              e.preventDefault();
              setDragDepth((d) => d + 1);
            }
          }}
          onDragOver={(e) => {
            if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
          }}
          onDragLeave={() => setDragDepth((d) => Math.max(0, d - 1))}
          onDrop={(e) => {
            if (e.dataTransfer?.files?.length) {
              e.preventDefault();
              setDragDepth(0);
              uploadFiles(e.dataTransfer.files);
            }
          }}
        >
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 p-3 dark:border-slate-700/60">
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumb.map((p, i) => (
                  <span key={p.path || "root"} className="contents">
                    <BreadcrumbItem>
                      {i === breadcrumb.length - 1 ? (
                        <BreadcrumbPage>{p.name}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink asChild>
                          <button type="button" onClick={() => setSelectedPath(p.path)}>
                            {p.name}
                          </button>
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                    {i < breadcrumb.length - 1 && <BreadcrumbSeparator />}
                  </span>
                ))}
              </BreadcrumbList>
            </Breadcrumb>

            {/* Folder color picker removed per redesign — color UI is hidden. */}
            {categoryFilter.size > 0 && !viewArchive && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Including subfolders
              </span>
            )}

            <div className="ml-auto flex items-center gap-1">
              {/* Collapsible search — icon-only until expanded or with a value */}
              {searchOpen || search ? (
                <div className="relative w-48 sm:w-56">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onBlur={() => {
                      if (!search) setSearchOpen(false);
                    }}
                    placeholder="Search files & folders…"
                    className="h-8 pl-7 pr-7 text-xs"
                  />
                  {search && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => {
                        setSearch("");
                        setSearchOpen(false);
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setSearchOpen(true)}
                  title="Search files & folders"
                  aria-label="Search files & folders"
                >
                  <Search className="h-4 w-4" />
                </Button>
              )}

              {categories.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="relative h-8 w-8"
                      title="Filter by category"
                      aria-label="Filter by category"
                    >
                      <Filter className="h-4 w-4" />
                      {categoryFilter.size > 0 && (
                        <span className="absolute -right-0.5 -top-0.5 min-w-[14px] rounded-full bg-indigo-600 px-1 text-[9px] font-medium leading-[14px] text-white">
                          {categoryFilter.size}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-2">
                    <div className="mb-1 flex items-center justify-between px-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Filter by category
                      </span>
                      {categoryFilter.size > 0 && (
                        <button
                          type="button"
                          onClick={() => setCategoryFilter(new Set())}
                          className="text-[10px] text-indigo-600 hover:underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="max-h-64 space-y-0.5 overflow-y-auto">
                      {categories.map((c) => {
                        const active = categoryFilter.has(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              setCategoryFilter((prev) => {
                                const next = new Set(prev);
                                next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                                return next;
                              })
                            }
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent",
                              active && "bg-accent",
                            )}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: c.color }}
                              />
                              <span className="truncate">{c.name}</span>
                            </span>
                            {active && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              )}

              {/* Column show/hide menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Show / hide columns"
                    aria-label="Show / hide columns"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Columns
                  </div>
                  {(
                    [
                      ["category", "Category"],
                      ["visibility", "Visibility"],
                      ["modified", "Date Modified"],
                      ["size", "Size"],
                    ] as const
                  ).map(([key, label]) => (
                    <DropdownMenuItem
                      key={key}
                      onSelect={(e) => {
                        e.preventDefault();
                        setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }));
                      }}
                      className="flex items-center justify-between text-xs"
                    >
                      <span>{label}</span>
                      {visibleCols[key] && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Header actions — icon-only */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setFileRequestOpen(true)}
                title="Request file — generate a shareable upload link for clients"
                aria-label="Request file"
              >
                <Link2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setNewFolderOpen(true)}
                title="New folder"
                aria-label="New folder"
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                disabled={uploading}
                className="h-8 w-8 bg-indigo-600 text-white hover:bg-indigo-700"
                onClick={() => fileInputRef.current?.click()}
                title="Upload file"
                aria-label="Upload file"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudUpload className="h-4 w-4" />
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-200/60 bg-indigo-50/70 px-3 py-2 text-sm dark:border-indigo-500/30 dark:bg-indigo-500/10">
              <div className="flex items-center gap-3">
                <span className="font-medium">{selectedFiles.length} selected</span>
                <label className="flex items-center gap-2">
                  <Switch
                    checked={allSelectedVisible}
                    onCheckedChange={(v) =>
                      mSetVisibility.mutate({ fileIds: [...selectedFileIds], visible: v })
                    }
                  />
                  <span className="text-xs text-muted-foreground">Share with client</span>
                </label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    mSetVisibility.mutate({ fileIds: [...selectedFileIds], visible: null })
                  }
                >
                  Reset to folder default
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setAuditDialog({
                      open: true,
                      nodeIds: [...selectedFileIds],
                      title: `${selectedFiles.length} files`,
                    })
                  }
                >
                  <History className="h-4 w-4" /> History
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setMoveDialog({ open: true, kind: "files", ids: [...selectedFileIds] })
                  }
                >
                  Move…
                </Button>
                {viewArchive ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => mRestore.mutate([...selectedFileIds])}
                  >
                    <ArchiveRestore className="h-4 w-4" /> Restore
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => mArchive.mutate([...selectedFileIds])}
                  >
                    <Archive className="h-4 w-4" /> Archive
                  </Button>
                )}
                {(() => {
                  const selectedFiles = files.filter((f) => selectedFileIds.has(f.id));
                  const unionIds = Array.from(
                    new Set(
                      selectedFiles.flatMap((f) =>
                        f.category_ids && f.category_ids.length > 0
                          ? f.category_ids
                          : f.category_id
                            ? [f.category_id]
                            : [],
                      ),
                    ),
                  );
                  return (
                    <CategoryPickerPopover
                      open={bulkCategoryOpen}
                      onOpenChange={setBulkCategoryOpen}
                      categories={categories}
                      currentCategoryIds={unionIds}
                      multi
                      onToggle={(categoryId) => {
                        const next = unionIds.includes(categoryId)
                          ? unionIds.filter((id) => id !== categoryId)
                          : [...unionIds, categoryId];
                        mSetCategory.mutate({ fileIds: [...selectedFileIds], categoryIds: next });
                      }}
                      onClear={() => {
                        mSetCategory.mutate({ fileIds: [...selectedFileIds], categoryIds: [] });
                      }}
                      onCreate={async (name) => {
                        await mCreateAndAssign.mutateAsync({
                          name,
                          fileIds: [...selectedFileIds],
                          existingCategoryIds: unionIds,
                          mode: "add",
                        });
                      }}
                      onRename={async (categoryId, name) => {
                        await mRenameCategory.mutateAsync({ categoryId, name });
                      }}
                      onRequestDelete={(req) =>
                        setDeleteCategoryState({
                          open: true,
                          target: { id: req.categoryId, name: req.name },
                        })
                      }
                      creating={mCreateAndAssign.isPending}
                      loading={categoriesLoading}
                      trigger={
                        <Button size="sm" variant="outline">
                          <Tag className="h-4 w-4" /> Categories…
                        </Button>
                      }
                    />
                  );
                })()}
                <Button size="sm" variant="outline" onClick={() => setBulkRename(true)}>
                  <Pencil className="h-4 w-4" /> Rename…
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    setConfirmDelete({
                      open: true,
                      fileIds: [...selectedFileIds],
                      label: `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"}`,
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 p-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() => toggleAll()}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="w-[36%]">
                    <SortHeader
                      label="Name"
                      k="name"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onToggle={toggleSort}
                    />
                  </TableHead>
                  {visibleCols.category && (
                    <TableHead className="w-28">
                      <SortHeader
                        label="Category"
                        k="category"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onToggle={toggleSort}
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-36">Classification</TableHead>
                  {visibleCols.visibility && <TableHead>Visibility</TableHead>}
                  {visibleCols.modified && (
                    <TableHead>
                      <SortHeader
                        label="Date Modified"
                        k="modified"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onToggle={toggleSort}
                      />
                    </TableHead>
                  )}
                  {visibleCols.size && (
                    <TableHead className="text-right">
                      <SortHeader
                        label="Size"
                        k="size"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onToggle={toggleSort}
                        align="right"
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {viewArchive
                        ? "No archived files."
                        : "This folder is empty. Drop files here or click Upload File."}
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => {
                  if (r.kind === "folder") {
                    const isEditing = editingId === `f:${r.path}`;
                    return (
                      <ContextMenu key={r.id}>
                        <ContextMenuTrigger asChild>
                          <TableRow
                            draggable={!isEditing}
                            onDragStart={(e) => onRowDragStart(e, [r.path], "folder", r.path)}
                            onDragEnd={() => setInternalDrag(false)}
                            onDragOver={(e) => {
                              if (internalDrag) e.preventDefault();
                            }}
                            onDrop={(e) => onFolderDrop(e, r.path)}
                            className="cursor-pointer transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                            onDoubleClick={() => {
                              if (!isEditing) {
                                setSelectedPath(r.path);
                                setExpanded((prev) => new Set(prev).add(r.path));
                              }
                            }}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()} />
                            <TableCell>
                              {(() => {
                                const fColor = folderColorMap.get(r.path) ?? null;
                                return (
                                  <div className="flex items-center gap-2">
                                    <Folder
                                      className={cn(
                                        "h-4 w-4 shrink-0",
                                        !fColor && "text-amber-500",
                                      )}
                                      style={fColor ? { color: fColor } : undefined}
                                    />
                                    {isEditing ? (
                                      <Input
                                        autoFocus
                                        value={editingValue}
                                        onChange={(e) => setEditingValue(e.target.value)}
                                        onClick={(e) => e.stopPropagation()}
                                        onBlur={() =>
                                          commitEdit({ kind: "folder", path: r.path, name: r.name })
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter")
                                            commitEdit({
                                              kind: "folder",
                                              path: r.path,
                                              name: r.name,
                                            });
                                          if (e.key === "Escape") setEditingId(null);
                                        }}
                                        className="h-7"
                                      />
                                    ) : (
                                      <>
                                        <span
                                          className="truncate font-medium"
                                          style={fColor ? { color: fColor } : undefined}
                                        >
                                          {r.name}
                                        </span>
                                        {fColor && (
                                          <span
                                            className="h-2 w-2 rounded-full shrink-0"
                                            style={{ background: fColor }}
                                          />
                                        )}
                                      </>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>
                            {visibleCols.category && <TableCell />}
                            {visibleCols.visibility && (
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <label className="flex items-center gap-2">
                                  <Switch
                                    checked={!!folderVisMap.get(r.path)}
                                    onCheckedChange={(v) =>
                                      mSetFolderVisibility.mutate({ path: r.path, visible: v })
                                    }
                                  />
                                  <span className="text-xs text-muted-foreground">
                                    {folderVisMap.get(r.path) ? "Shared" : "Internal"}
                                  </span>
                                </label>
                              </TableCell>
                            )}
                            {visibleCols.modified && (
                              <TableCell className="text-sm text-muted-foreground">
                                {fmt(folderModified(r.path))}
                              </TableCell>
                            )}
                            {visibleCols.size && (
                              <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                                {formatBytes(folderSize(r.path)) || "—"}
                              </TableCell>
                            )}
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu
                                open={openRowMenuId === `f:${r.path}`}
                                onOpenChange={(o) => setOpenRowMenuId(o ? `f:${r.path}` : null)}
                              >
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setSelectedPath(r.path);
                                      setExpanded((prev) => new Set(prev).add(r.path));
                                    }}
                                  >
                                    <FolderOpen className="h-4 w-4" /> Open folder
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => startEdit(`f:${r.path}`, r.name)}
                                  >
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      setMoveDialog({
                                        open: true,
                                        kind: "folder",
                                        folderPath: r.path,
                                      })
                                    }
                                  >
                                    Move…
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      mSetFolderVisibility.mutate({
                                        path: r.path,
                                        visible: !folderVisMap.get(r.path),
                                      })
                                    }
                                  >
                                    {folderVisMap.get(r.path)
                                      ? "Stop sharing with client"
                                      : "Share with client"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => {
                                      const folderRow = folders.find((f) => f.path === r.path);
                                      if (folderRow) {
                                        setAuditDialog({
                                          open: true,
                                          nodeIds: [folderRow.id],
                                          title: r.name,
                                        });
                                      }
                                    }}
                                  >
                                    <History className="h-4 w-4" /> View audit
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() =>
                                      setConfirmDelete({
                                        open: true,
                                        folderPath: r.path,
                                        label: r.name,
                                      })
                                    }
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onSelect={() => {
                              setSelectedPath(r.path);
                              setExpanded((prev) => new Set(prev).add(r.path));
                            }}
                          >
                            <FolderOpen className="h-4 w-4" /> Open folder
                          </ContextMenuItem>
                          <ContextMenuItem onSelect={() => startEdit(`f:${r.path}`, r.name)}>
                            Rename
                          </ContextMenuItem>
                          <ContextMenuItem
                            onSelect={() =>
                              setMoveDialog({ open: true, kind: "folder", folderPath: r.path })
                            }
                          >
                            Move…
                          </ContextMenuItem>
                          <ContextMenuSub>
                            <ContextMenuSubTrigger>Change color</ContextMenuSubTrigger>
                            <ContextMenuSubContent className="p-2">
                              <div className="flex flex-wrap gap-1.5 max-w-[180px]">
                                {FOLDER_COLOR_SWATCHES.map((c) => {
                                  const current = folderColorMap.get(r.path) ?? null;
                                  return (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() =>
                                        mSetFolderColor.mutate({ path: r.path, color: c })
                                      }
                                      className={cn(
                                        "h-5 w-5 rounded-full border-2 transition",
                                        current === c
                                          ? "border-slate-900 dark:border-white"
                                          : "border-white dark:border-slate-700 hover:scale-110",
                                      )}
                                      style={{ background: c }}
                                      aria-label={`Set color ${c}`}
                                    />
                                  );
                                })}
                                <button
                                  type="button"
                                  onClick={() =>
                                    mSetFolderColor.mutate({ path: r.path, color: null })
                                  }
                                  className="h-5 w-5 rounded-full border-2 border-slate-300 bg-white text-[10px] text-slate-500 hover:scale-110"
                                  aria-label="Clear color"
                                  title="Reset to default"
                                >
                                  ×
                                </button>
                              </div>
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                          <ContextMenuItem
                            onSelect={() =>
                              mSetFolderVisibility.mutate({
                                path: r.path,
                                visible: !folderVisMap.get(r.path),
                              })
                            }
                          >
                            {folderVisMap.get(r.path)
                              ? "Stop sharing with client"
                              : "Share with client"}
                          </ContextMenuItem>
                          <ContextMenuItem
                            onSelect={() => {
                              const folderRow = folders.find((f) => f.path === r.path);
                              if (folderRow)
                                setAuditDialog({
                                  open: true,
                                  nodeIds: [folderRow.id],
                                  title: r.name,
                                });
                            }}
                          >
                            <History className="h-4 w-4" /> View audit
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            className="text-destructive focus:text-destructive"
                            onSelect={() =>
                              setConfirmDelete({ open: true, folderPath: r.path, label: r.name })
                            }
                          >
                            Delete
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  }

                  const file = r.file;
                  const isEditing = editingId === file.id;
                  const { Icon, className } = fileIconFor(file.filename);
                  return (
                    <ContextMenu key={file.id}>
                      <ContextMenuTrigger asChild>
                        <TableRow
                          draggable={!isEditing}
                          onDragStart={(e) => {
                            const ids =
                              selectedFileIds.has(file.id) && selectedFileIds.size > 1
                                ? [...selectedFileIds]
                                : [file.id];
                            onRowDragStart(e, ids, "file");
                          }}
                          onDragEnd={() => setInternalDrag(false)}
                          className="cursor-pointer transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                          onDoubleClick={() => {
                            if (!isEditing) openPreview(file);
                          }}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedFileIds.has(file.id)}
                              onCheckedChange={() => toggleOne(file.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex min-w-0 items-center gap-2">
                              <Icon className={cn("h-4 w-4 shrink-0", className)} />
                              {isEditing ? (
                                <Input
                                  autoFocus
                                  value={editingValue}
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  onBlur={() =>
                                    commitEdit({ kind: "file", id: file.id, name: file.filename })
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      commitEdit({
                                        kind: "file",
                                        id: file.id,
                                        name: file.filename,
                                      });
                                    if (e.key === "Escape") setEditingId(null);
                                  }}
                                  className="h-7"
                                />
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="truncate text-left font-medium hover:text-indigo-600 hover:underline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openPreview(file);
                                    }}
                                    title={
                                      file.description ??
                                      "Click to preview, right-click for more actions"
                                    }
                                  >
                                    {file.filename}
                                  </button>
                                  {file.is_shared && (
                                    <Bookmark
                                      className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500"
                                      aria-label="Shared to Residual"
                                    />
                                  )}
                                  {/* category chips moved to Category column for clarity */}
                                  {file.description && (
                                    <span
                                      className="truncate text-[10px] text-muted-foreground"
                                      title={file.description}
                                    >
                                      · {file.description}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                          {visibleCols.category && (
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              {(() => {
                                const currentIds =
                                  file.category_ids && file.category_ids.length > 0
                                    ? file.category_ids
                                    : file.category_id
                                      ? [file.category_id]
                                      : [];
                                return (
                                  <CategoryPickerPopover
                                    open={rowCategoryOpenId === file.id}
                                    onOpenChange={(o) => setRowCategoryOpenId(o ? file.id : null)}
                                    categories={categories}
                                    currentCategoryIds={currentIds}
                                    multi
                                    onToggle={(categoryId) => {
                                      const next = currentIds.includes(categoryId)
                                        ? currentIds.filter((id) => id !== categoryId)
                                        : [...currentIds, categoryId];
                                      mSetCategory.mutate({
                                        fileIds: [file.id],
                                        categoryIds: next,
                                      });
                                    }}
                                    onClear={() => {
                                      mSetCategory.mutate({ fileIds: [file.id], categoryIds: [] });
                                      setRowCategoryOpenId(null);
                                    }}
                                    onCreate={async (name) => {
                                      await mCreateAndAssign.mutateAsync({
                                        name,
                                        fileIds: [file.id],
                                        existingCategoryIds: currentIds,
                                        mode: "add",
                                      });
                                    }}
                                    onRename={async (categoryId, name) => {
                                      await mRenameCategory.mutateAsync({ categoryId, name });
                                    }}
                                    onRequestDelete={(req) => {
                                      setRowCategoryOpenId(null);
                                      setDeleteCategoryState({
                                        open: true,
                                        target: { id: req.categoryId, name: req.name },
                                      });
                                    }}
                                    creating={mCreateAndAssign.isPending}
                                    loading={categoriesLoading}
                                    trigger={
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setRowCategoryOpenId(file.id);
                                        }}
                                        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent"
                                        title="Click to assign categories"
                                      >
                                        <CategoryChips
                                          categoryIds={currentIds}
                                          categoryMap={categoryById}
                                        />
                                        {currentIds.length === 0 && (
                                          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-indigo-300 px-2 py-0.5 text-[10px] font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-500/60 dark:text-indigo-300 dark:hover:bg-indigo-500/10">
                                            + Add
                                          </span>
                                        )}
                                      </button>
                                    }
                                  />
                                );
                              })()}
                            </TableCell>
                          )}
                          <TableCell>
                            <CategorisationBadge file={file} />
                          </TableCell>
                          {visibleCols.visibility && (
                            <TableCell>
                              {(() => {
                                const inherited = folderVisMap.get(file.folder_path) ?? false;
                                const overridden =
                                  file.client_visible_override !== null &&
                                  typeof file.client_visible_override !== "undefined";
                                const label = overridden
                                  ? file.client_visible_override
                                    ? "Shared (override)"
                                    : "Internal (override)"
                                  : inherited
                                    ? "Shared (inherited)"
                                    : "Internal (inherited)";
                                return (
                                  <label className="flex items-center gap-2">
                                    <Switch
                                      checked={file.is_client_visible}
                                      onCheckedChange={(v) =>
                                        mSetVisibility.mutate({ fileIds: [file.id], visible: v })
                                      }
                                    />
                                    <span
                                      className={cn(
                                        "text-xs",
                                        overridden
                                          ? "text-indigo-600 dark:text-indigo-300"
                                          : "text-muted-foreground",
                                      )}
                                    >
                                      {label}
                                    </span>
                                  </label>
                                );
                              })()}
                            </TableCell>
                          )}
                          {visibleCols.modified && (
                            <TableCell className="text-sm text-muted-foreground">
                              {fmt(file.created_at)}
                            </TableCell>
                          )}
                          {visibleCols.size && (
                            <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                              {formatBytes(file.size_bytes ?? 0) || "—"}
                            </TableCell>
                          )}
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu
                              open={openRowMenuId === file.id}
                              onOpenChange={(o) => setOpenRowMenuId(o ? file.id : null)}
                            >
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openPreview(file)}>
                                  Preview
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => downloadFile(file)}>
                                  Download
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => startEdit(file.id, file.filename)}>
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    setMoveDialog({ open: true, kind: "files", ids: [file.id] })
                                  }
                                >
                                  Move…
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    setAuditDialog({
                                      open: true,
                                      nodeIds: [file.id],
                                      title: file.filename,
                                    })
                                  }
                                >
                                  <History className="h-4 w-4" /> View audit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    mSetVisibility.mutate({
                                      fileIds: [file.id],
                                      visible: file.client_visible_override === true ? false : true,
                                    })
                                  }
                                >
                                  {file.is_client_visible
                                    ? "Make Internal (override)"
                                    : "Share with Client (override)"}
                                </DropdownMenuItem>
                                {file.client_visible_override !== null && (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      mSetVisibility.mutate({ fileIds: [file.id], visible: null })
                                    }
                                  >
                                    Reset to folder default
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() =>
                                    mSetShared.mutate({
                                      fileId: file.id,
                                      isShared: !file.is_shared,
                                    })
                                  }
                                >
                                  <Bookmark className="h-4 w-4" />
                                  {file.is_shared
                                    ? "Remove from Residual"
                                    : "Share to Residual (Shared Resources)"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {categories.length > 0 && (
                                  <DropdownMenuItem onClick={() => setRowCategoryOpenId(file.id)}>
                                    <Tag className="h-4 w-4" /> Manage categories…
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() =>
                                    setDescriptionDialog({
                                      open: true,
                                      fileId: file.id,
                                      filename: file.filename,
                                      initial: file.description ?? "",
                                    })
                                  }
                                >
                                  <Pencil className="h-4 w-4" /> Edit description…
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    setAuditDialog({
                                      open: true,
                                      nodeIds: [file.id],
                                      title: file.filename,
                                    })
                                  }
                                >
                                  <History className="h-4 w-4" /> History
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {viewArchive ? (
                                  <DropdownMenuItem onClick={() => mRestore.mutate([file.id])}>
                                    <ArchiveRestore className="h-4 w-4" /> Restore
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => mArchive.mutate([file.id])}>
                                    <Archive className="h-4 w-4" /> Archive
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() =>
                                    setConfirmDelete({
                                      open: true,
                                      fileIds: [file.id],
                                      label: file.filename,
                                    })
                                  }
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onSelect={() => openPreview(file)}>
                          Preview
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => downloadFile(file)}>
                          Download
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={() => startEdit(file.id, file.filename)}>
                          Rename
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() =>
                            setMoveDialog({ open: true, kind: "files", ids: [file.id] })
                          }
                        >
                          Move…
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() =>
                            setAuditDialog({ open: true, nodeIds: [file.id], title: file.filename })
                          }
                        >
                          <History className="h-4 w-4" /> View audit
                        </ContextMenuItem>
                        <ContextMenuItem
                          onSelect={() =>
                            mSetVisibility.mutate({
                              fileIds: [file.id],
                              visible: file.client_visible_override === true ? false : true,
                            })
                          }
                        >
                          {file.is_client_visible
                            ? "Make Internal (override)"
                            : "Share with Client (override)"}
                        </ContextMenuItem>
                        {file.client_visible_override !== null && (
                          <ContextMenuItem
                            onSelect={() =>
                              mSetVisibility.mutate({ fileIds: [file.id], visible: null })
                            }
                          >
                            Reset to folder default
                          </ContextMenuItem>
                        )}
                        <ContextMenuSeparator />
                        {categories.length > 0 && (
                          <ContextMenuItem onSelect={() => setRowCategoryOpenId(file.id)}>
                            <Tag className="h-4 w-4" /> Manage categories…
                          </ContextMenuItem>
                        )}
                        <ContextMenuItem
                          onSelect={() =>
                            setDescriptionDialog({
                              open: true,
                              fileId: file.id,
                              filename: file.filename,
                              initial: file.description ?? "",
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" /> Edit description…
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        {viewArchive ? (
                          <ContextMenuItem onSelect={() => mRestore.mutate([file.id])}>
                            <ArchiveRestore className="h-4 w-4" /> Restore
                          </ContextMenuItem>
                        ) : (
                          <ContextMenuItem onSelect={() => mArchive.mutate([file.id])}>
                            <Archive className="h-4 w-4" /> Archive
                          </ContextMenuItem>
                        )}
                        <ContextMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() =>
                            setConfirmDelete({
                              open: true,
                              fileIds: [file.id],
                              label: file.filename,
                            })
                          }
                        >
                          Delete
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Dropzone overlay */}
          {dragDepth > 0 && (
            <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-indigo-400 bg-indigo-50/80 backdrop-blur-sm dark:bg-indigo-500/10">
              <CloudUpload className="h-10 w-10 text-indigo-500" />
              <p className="text-sm font-medium text-indigo-700 dark:text-indigo-200">
                Drop files here to upload to {selectedPath || firmName}
              </p>
            </div>
          )}
        </section>
      </div>

      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        taskId={taskId}
        activePath={selectedPath}
        firmName={firmName}
        onDeployed={() => {
          // Expand the active folder so newly created children are visible.
          setExpanded((prev) => new Set([...prev, selectedPath]));
        }}
      />

      <FileRequestDialog taskId={taskId} open={fileRequestOpen} onOpenChange={setFileRequestOpen} />

      <DocumentPreviewSheet
        state={preview}
        onOpenChange={(o) => !o && setPreview({ open: false, file: null, url: null })}
        onDownload={downloadCurrentPreview}
        categories={categories}
        categoryById={categoryById}
        folderLabel={(p) => p || firmName}
        onSaveDescription={(fileId, value) =>
          mSetDescription.mutate({ fileId, description: value })
        }
        onSetCategory={(fileId, categoryId) =>
          mSetCategory.mutate({ fileIds: [fileId], categoryId })
        }
        onClearCategory={(fileId) => mSetCategory.mutate({ fileIds: [fileId], categoryId: null })}
        onSetVisibility={(fileId, visible) => mSetVisibility.mutate({ fileIds: [fileId], visible })}
      />

      <DocumentMoveDialog
        open={moveDialog.open}
        onOpenChange={(o) => setMoveDialog((prev) => ({ ...prev, open: o }))}
        folders={allFolderPaths}
        currentPath={moveDialog.kind === "folder" ? (moveDialog.folderPath ?? "") : selectedPath}
        disabledPath={moveDialog.kind === "folder" ? moveDialog.folderPath : undefined}
        onConfirm={(target) => {
          if (moveDialog.kind === "files" && moveDialog.ids?.length) {
            mMoveFiles.mutate({ fileIds: moveDialog.ids, toFolder: target });
          } else if (moveDialog.kind === "folder" && moveDialog.folderPath !== undefined) {
            mMoveFolder.mutate({ fromPath: moveDialog.folderPath, toParent: target });
          }
          setMoveDialog({ open: false, kind: "files" });
        }}
      />

      <DocumentBulkRenameDialog
        open={bulkRename}
        onOpenChange={setBulkRename}
        items={selectedFiles.map((f) => ({ id: f.id, filename: f.filename }))}
        onConfirm={(renames) => mBulkRename.mutate(renames)}
      />

      <AlertDialog
        open={confirmDelete.open}
        onOpenChange={(o) => setConfirmDelete((p) => ({ ...p, open: o }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.{" "}
              {confirmDelete.folderPath ? "All files inside this folder will also be removed." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete.fileIds?.length) mDeleteFiles.mutate(confirmDelete.fileIds);
                if (confirmDelete.folderPath) mDeleteFolder.mutate(confirmDelete.folderPath);
                setConfirmDelete({ open: false, label: "" });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DocumentAuditDialog
        open={auditDialog.open}
        onOpenChange={(o) => setAuditDialog((p) => ({ ...p, open: o }))}
        taskId={taskId}
        nodeIds={auditDialog.nodeIds}
        title={auditDialog.title}
      />

      <DescriptionDialog
        open={descriptionDialog.open}
        onOpenChange={(o) => setDescriptionDialog((p) => ({ ...p, open: o }))}
        filename={descriptionDialog.filename}
        initialValue={descriptionDialog.initial}
        onSave={(value) =>
          mSetDescription.mutate({
            fileId: descriptionDialog.fileId,
            description: value.length === 0 ? null : value,
          })
        }
      />
      <CategoryDeleteDialog
        open={deleteCategoryState.open}
        onOpenChange={(o) =>
          setDeleteCategoryState((p) => ({ ...p, open: o, target: o ? p.target : null }))
        }
        category={deleteCategoryState.target}
        otherCategories={categories.filter((c) => c.id !== deleteCategoryState.target?.id)}
        pending={mDeleteCategory.isPending}
        onConfirm={(result: CategoryDeleteResult) => {
          if (!deleteCategoryState.target) return;
          if (result.mode === "reassign") {
            mDeleteCategory.mutate({
              categoryId: deleteCategoryState.target.id,
              mode: "reassign",
              reassignToCategoryId: result.reassignToCategoryId,
            });
          } else {
            mDeleteCategory.mutate({
              categoryId: deleteCategoryState.target.id,
              mode: "untag",
            });
          }
        }}
      />
    </div>
  );
}

function walk(node: TreeNode, path: string): TreeNode | null {
  if (!path) return node;
  const segs = path.split("/");
  let cursor: TreeNode | undefined = node;
  for (const s of segs) {
    cursor = cursor?.children.get(s);
    if (!cursor) return null;
  }
  return cursor;
}

const FOLDER_COLOR_SWATCHES = [
  "#f59e0b", // amber (default)
  "#ef4444", // red
  "#ec4899", // pink
  "#a855f7", // purple
  "#3b82f6", // blue
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#84cc16", // lime
  "#64748b", // slate
] as const;

const FOLDER_COLOR_LEGEND: Record<string, string> = {
  "#f59e0b": "Amber — Default",
  "#ef4444": "Red — Urgent",
  "#ec4899": "Pink — Client-facing",
  "#a855f7": "Purple — Review",
  "#3b82f6": "Blue — Reference",
  "#06b6d4": "Cyan — In progress",
  "#10b981": "Emerald — Approved",
  "#84cc16": "Lime — Final",
  "#64748b": "Slate — Archived",
};

function TreeRow({
  node,
  depth,
  selectedPath,
  expanded,
  visibilityMap,
  colorMap,
  visiblePaths,
  onSetColor,
  onToggle,
  onSelect,
  onDrop,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string;
  expanded: Set<string>;
  visibilityMap?: Map<string, boolean>;
  colorMap?: Map<string, string | null>;
  visiblePaths?: Set<string> | null;
  onSetColor?: (path: string, color: string | null) => void;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  onDrop: (e: React.DragEvent, targetPath: string) => void;
}) {
  if (visiblePaths && !visiblePaths.has(node.path)) return null;
  const isOpen = expanded.has(node.path);
  const isActive = selectedPath === node.path;
  const hasFolders = node.children.size > 0;
  const [over, setOver] = useState(false);
  const isRoot = node.path === "";
  const shared = !isRoot && visibilityMap?.get(node.path) === true;
  const folderColor = (!isRoot && colorMap?.get(node.path)) || null;
  const iconColor = folderColor ?? undefined;

  return (
    <div>
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/x-doc-node")) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          onDrop(e, node.path);
        }}
        className={cn(
          "group relative flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          isActive
            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
            : "text-slate-700 hover:bg-slate-100/70 dark:text-slate-300 dark:hover:bg-slate-800/50",
          over && "ring-2 ring-indigo-400",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {isActive && (
          <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r bg-indigo-500" />
        )}
        {hasFolders ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.path);
            }}
            className="shrink-0 p-0.5 -ml-0.5 rounded hover:bg-black/5 dark:hover:bg-white/5"
            aria-label={isOpen ? "Collapse folder" : "Expand folder"}
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 opacity-60" />
            )}
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        <button
          type="button"
          onClick={() => {
            onSelect(node.path);
            if (hasFolders && !isOpen) onToggle(node.path);
          }}
          className="flex flex-1 items-center gap-1.5 min-w-0 text-left"
        >
          {isOpen ? (
            <FolderOpen
              className={cn("h-4 w-4 shrink-0", !iconColor && "text-amber-500")}
              style={iconColor ? { color: iconColor } : undefined}
            />
          ) : (
            <Folder
              className={cn("h-4 w-4 shrink-0", !iconColor && "text-amber-500")}
              style={iconColor ? { color: iconColor } : undefined}
            />
          )}
          <span className="flex-1 truncate">{node.path === "" ? node.name : node.name}</span>
        </button>
        {!isRoot && onSetColor && folderColor && (
          <span
            className="ml-0.5 h-2 w-2 shrink-0 rounded-full border border-border-subtle dark:border-slate-900/40"
            style={{ background: folderColor }}
            aria-hidden
          />
        )}
        {!isRoot && (
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="ml-1 shrink-0">
                  {shared ? (
                    <Users className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent side="right">
                {shared ? "Shared with client" : "Internal only"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {isOpen && (
        <div>
          {[...node.children.values()].map((c) => (
            <TreeRow
              key={c.path}
              node={c}
              depth={depth + 1}
              selectedPath={selectedPath}
              expanded={expanded}
              visibilityMap={visibilityMap}
              colorMap={colorMap}
              visiblePaths={visiblePaths}
              onSetColor={onSetColor}
              onToggle={onToggle}
              onSelect={onSelect}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onToggle,
  align = "left",
}: {
  label: string;
  k: "name" | "category" | "modified" | "size";
  sortKey: string;
  sortDir: "asc" | "desc";
  onToggle: (k: "name" | "category" | "modified" | "size") => void;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <button
      type="button"
      onClick={() => onToggle(k)}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors",
        align === "right" && "ml-auto",
        active && "text-foreground",
      )}
    >
      <span>{label}</span>
      <span className="text-[10px] opacity-70">
        {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
      </span>
    </button>
  );
}

export default DocumentManager;
