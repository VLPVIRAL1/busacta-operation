// Windows Explorer-style top bar for the File Gallery.
//
// Alt+D (from browser) calls the imperative ref to enter edit mode + focus.
// Edit mode shows a text input with autocomplete suggestions derived from the
// tree data (up to the task level). Arrow keys navigate suggestions.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  LayoutGrid,
  List,
  Loader2,
  RefreshCw,
  Search,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/shared/utils";
import type { GalleryNode, GalleryTree } from "@/lib/queries/gallery.queries";
import type { ViewMode } from "./gallery-explorer-panel";
import type { GalleryFilters } from "./gallery-toolbar";
import { FILE_TYPE_LABEL, type FileTypeKey } from "./gallery-utils";

// ---------------------------------------------------------------------------
// Imperative handle (exposed via forwardRef so parent can call focusAddressBar)
// ---------------------------------------------------------------------------
export type GalleryAddressBarHandle = {
  focusAddressBar: () => void;
};

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------
type PathSegment = { label: string; node: GalleryNode };

function buildPathSegments(node: GalleryNode, tree: GalleryTree | null): PathSegment[] {
  if (!tree) return [];
  const firm: PathSegment = {
    label: tree.firmName,
    node: { type: "firm_folder", firmId: tree.firmId, firmName: tree.firmName },
  };
  switch (node.type) {
    case "firm_folder":
      return [firm];
    case "project_folder":
      return [firm, { label: node.projectName, node }];
    case "client_folder":
      return [firm, { label: node.clientName, node }];
    case "task_folder": {
      let projectName: string | null = null;
      let projectId: string | null = null;
      for (const p of tree.projects) {
        if (p.tasks.some((t) => t.id === node.taskId)) {
          projectName = p.name;
          projectId = p.id;
          break;
        }
      }
      if (!projectId) {
        outer2: for (const c of tree.clientGroups) {
          for (const p of c.projects) {
            if (p.tasks.some((t) => t.id === node.taskId)) {
              projectName = p.name;
              projectId = p.id;
              break outer2;
            }
          }
        }
      }
      const segs: PathSegment[] = [firm];
      if (projectId && projectName)
        segs.push({ label: projectName, node: { type: "project_folder", projectId, projectName } });
      segs.push({ label: node.taskTitle, node: { ...node, folderPath: "" } });
      if (node.folderPath)
        node.folderPath.split("/").forEach((part, i, arr) =>
          segs.push({
            label: part,
            node: { ...node, folderPath: arr.slice(0, i + 1).join("/") },
          }),
        );
      return segs;
    }
    case "project_residual":
    case "client_residual":
      return [firm, { label: "Shared Resources", node }];
    default:
      return [firm];
  }
}

function pathToText(segments: PathSegment[]): string {
  return segments.map((s) => s.label).join(" > ");
}

function parsePath(text: string, tree: GalleryTree): GalleryNode | null {
  const parts = text
    .split(/[>\/\\]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return { type: "firm_folder", firmId: tree.firmId, firmName: tree.firmName };
  let i = 0;
  if (parts[i].toLowerCase() === tree.firmName.toLowerCase()) i++;
  if (i >= parts.length)
    return { type: "firm_folder", firmId: tree.firmId, firmName: tree.firmName };
  const seg1 = parts[i].toLowerCase();
  const proj = tree.projects.find((p) => p.name.toLowerCase() === seg1);
  if (proj) {
    i++;
    if (i >= parts.length)
      return { type: "project_folder", projectId: proj.id, projectName: proj.name };
    const task = proj.tasks.find((t) => t.title.toLowerCase() === parts[i].toLowerCase());
    if (!task) return null;
    i++;
    return {
      type: "task_folder",
      taskId: task.id,
      folderPath: parts.slice(i).join("/"),
      taskTitle: task.title,
    };
  }
  const client = tree.clientGroups.find((c) => c.name.toLowerCase() === seg1);
  if (client) {
    i++;
    if (i >= parts.length)
      return { type: "client_folder", clientId: client.id, clientName: client.name };
    const cp = client.projects.find((p) => p.name.toLowerCase() === parts[i].toLowerCase());
    if (!cp) return null;
    i++;
    if (i >= parts.length)
      return { type: "project_folder", projectId: cp.id, projectName: cp.name };
    const task = cp.tasks.find((t) => t.title.toLowerCase() === parts[i].toLowerCase());
    if (!task) return null;
    i++;
    return {
      type: "task_folder",
      taskId: task.id,
      folderPath: parts.slice(i).join("/"),
      taskTitle: task.title,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Auto-suggestions
// ---------------------------------------------------------------------------
type Suggestion = { label: string; fullPath: string; node: GalleryNode };

function findTaskInTree(
  tree: GalleryTree,
  taskId: string,
): GalleryTree["projects"][0]["tasks"][0] | null {
  for (const p of tree.projects) {
    const t = p.tasks.find((t) => t.id === taskId);
    if (t) return t;
  }
  for (const c of tree.clientGroups) {
    for (const p of c.projects) {
      const t = p.tasks.find((t) => t.id === taskId);
      if (t) return t;
    }
  }
  for (const dc of tree.directClients) {
    const t = dc.tasks.find((t) => t.id === taskId);
    if (t) return t;
  }
  return tree.unassignedTasks.find((t) => t.id === taskId) ?? null;
}

function getSuggestions(text: string, tree: GalleryTree): Suggestion[] {
  const raw = text.split(/[>\/\\]/).map((s) => s.trim());
  const lastPart = raw[raw.length - 1].toLowerCase();
  const prefixParts = raw
    .slice(0, -1)
    .map((s) => s.trim())
    .filter(Boolean);

  const prefixText = prefixParts.join(" > ");
  const resolvedPrefix = prefixText ? parsePath(prefixText, tree) : null;

  // Root level — suggest firm name, then projects and clients
  if (!resolvedPrefix && prefixParts.length === 0) {
    const out: Suggestion[] = [];
    if (!lastPart || tree.firmName.toLowerCase().startsWith(lastPart))
      out.push({
        label: tree.firmName,
        fullPath: tree.firmName,
        node: { type: "firm_folder", firmId: tree.firmId, firmName: tree.firmName },
      });
    for (const p of tree.projects) {
      if (!lastPart || p.name.toLowerCase().startsWith(lastPart))
        out.push({
          label: p.name,
          fullPath: `${tree.firmName} > ${p.name}`,
          node: { type: "project_folder", projectId: p.id, projectName: p.name },
        });
    }
    for (const c of tree.clientGroups) {
      if (!lastPart || c.name.toLowerCase().startsWith(lastPart))
        out.push({
          label: c.name,
          fullPath: `${tree.firmName} > ${c.name}`,
          node: { type: "client_folder", clientId: c.id, clientName: c.name },
        });
    }
    return out.slice(0, 8);
  }

  // After firm name → projects + clients
  if (
    !resolvedPrefix &&
    prefixParts.length === 1 &&
    prefixParts[0].toLowerCase() === tree.firmName.toLowerCase()
  ) {
    const out: Suggestion[] = [];
    for (const p of tree.projects) {
      if (!lastPart || p.name.toLowerCase().startsWith(lastPart))
        out.push({
          label: p.name,
          fullPath: `${tree.firmName} > ${p.name}`,
          node: { type: "project_folder", projectId: p.id, projectName: p.name },
        });
    }
    for (const c of tree.clientGroups) {
      if (!lastPart || c.name.toLowerCase().startsWith(lastPart))
        out.push({
          label: c.name,
          fullPath: `${tree.firmName} > ${c.name}`,
          node: { type: "client_folder", clientId: c.id, clientName: c.name },
        });
    }
    return out.slice(0, 8);
  }

  if (!resolvedPrefix) return [];

  // Under a project → suggest tasks
  if (resolvedPrefix.type === "project_folder") {
    const proj = tree.projects.find((p) => p.id === resolvedPrefix.projectId);
    if (!proj) return [];
    return proj.tasks
      .filter((t) => !lastPart || t.title.toLowerCase().startsWith(lastPart))
      .slice(0, 8)
      .map((t) => ({
        label: t.title,
        fullPath: `${tree.firmName} > ${proj.name} > ${t.title}`,
        node: { type: "task_folder" as const, taskId: t.id, folderPath: "", taskTitle: t.title },
      }));
  }

  // Under a client → suggest projects
  if (resolvedPrefix.type === "client_folder") {
    const client = tree.clientGroups.find((c) => c.id === resolvedPrefix.clientId);
    if (!client) return [];
    return client.projects
      .filter((p) => !lastPart || p.name.toLowerCase().startsWith(lastPart))
      .slice(0, 8)
      .map((p) => ({
        label: p.name,
        fullPath: `${tree.firmName} > ${client.name} > ${p.name}`,
        node: { type: "project_folder" as const, projectId: p.id, projectName: p.name },
      }));
  }

  // Under a task folder → suggest sub-folders from the task's folderPaths
  if (resolvedPrefix.type === "task_folder") {
    const task = findTaskInTree(tree, resolvedPrefix.taskId);
    if (!task || task.folderPaths.length === 0) return [];

    const currentPath = resolvedPrefix.folderPath; // "" = task root
    const seen = new Set<string>();
    const children: string[] = [];
    for (const fp of task.folderPaths) {
      let child: string | null = null;
      if (!currentPath) {
        child = fp.split("/")[0];
      } else if (fp.startsWith(currentPath + "/")) {
        child = fp.slice(currentPath.length + 1).split("/")[0];
      }
      if (child && !seen.has(child)) {
        seen.add(child);
        children.push(child);
      }
    }

    return children
      .filter((f) => !lastPart || f.toLowerCase().startsWith(lastPart))
      .slice(0, 8)
      .map((f) => {
        const folderPath = currentPath ? `${currentPath}/${f}` : f;
        return {
          label: f,
          fullPath: `${prefixText} > ${f}`,
          node: {
            type: "task_folder" as const,
            taskId: resolvedPrefix.taskId,
            folderPath,
            taskTitle: resolvedPrefix.taskTitle,
          },
        };
      });
  }

  return [];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TYPE_KEYS: FileTypeKey[] = ["pdf", "image", "document", "spreadsheet", "other"];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
type Props = {
  node: GalleryNode | null;
  tree: GalleryTree | null;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoUp: boolean;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onNavigate: (node: GalleryNode) => void;
  onRefresh: () => void;
  canUpload: boolean;
  uploading: boolean;
  onUpload: (files: FileList) => void;
  filters: GalleryFilters;
  onFiltersChange: (next: GalleryFilters) => void;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
};

// ---------------------------------------------------------------------------
// GalleryAddressBar
// ---------------------------------------------------------------------------
export const GalleryAddressBar = forwardRef<GalleryAddressBarHandle, Props>(
  function GalleryAddressBar(
    {
      node,
      tree,
      canGoBack,
      canGoForward,
      canGoUp,
      onBack,
      onForward,
      onUp,
      onNavigate,
      onRefresh,
      canUpload,
      uploading,
      onUpload,
      filters,
      onFiltersChange,
      viewMode,
      onViewModeChange,
    },
    ref,
  ) {
    const segments = node && tree ? buildPathSegments(node, tree) : [];
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ---- Editable path + suggestions ----
    const [editing, setEditing] = useState(false);
    const [pathText, setPathText] = useState("");
    const [pathError, setPathError] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [suggIdx, setSuggIdx] = useState(-1);
    const pathInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      focusAddressBar() {
        setPathText(pathToText(segments));
        setPathError(false);
        setEditing(true);
      },
    }));

    useEffect(() => {
      if (editing) {
        pathInputRef.current?.focus();
        pathInputRef.current?.select();
      }
    }, [editing]);

    function updateSuggestions(text: string) {
      if (!tree) {
        setSuggestions([]);
        return;
      }
      setSuggestions(getSuggestions(text, tree));
      setSuggIdx(-1);
    }

    function handlePathChange(text: string) {
      setPathText(text);
      setPathError(false);
      updateSuggestions(text);
    }

    function commitPath(overrideText?: string) {
      const text = overrideText ?? pathText;
      if (!tree) {
        setEditing(false);
        return;
      }
      const resolved = parsePath(text, tree);
      if (resolved) {
        setEditing(false);
        setPathError(false);
        setSuggestions([]);
        onNavigate(resolved);
      } else {
        setPathError(true);
      }
    }

    function cancelEditing() {
      setEditing(false);
      setPathError(false);
      setSuggestions([]);
      setSuggIdx(-1);
    }

    function handlePathKeyDown(e: React.KeyboardEvent) {
      if (suggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSuggIdx((i) => Math.min(suggestions.length - 1, i + 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSuggIdx((i) => Math.max(-1, i - 1));
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          const target = suggIdx >= 0 ? suggestions[suggIdx] : suggestions[0];
          if (target) {
            setPathText(target.fullPath + " > ");
            updateSuggestions(target.fullPath + " > ");
          }
          return;
        }
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (suggIdx >= 0 && suggestions[suggIdx]) {
          commitPath(suggestions[suggIdx].fullPath);
        } else {
          commitPath();
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancelEditing();
      }
    }

    return (
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-2 py-1.5">
        {/* ← → ↑ */}
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            onClick={onBack}
            disabled={!canGoBack}
            title="Back (Alt+← or Backspace)"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            onClick={onForward}
            disabled={!canGoForward}
            title="Forward (Alt+→)"
          >
            <ArrowRight className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            onClick={onUp}
            disabled={!canGoUp}
            title="Up one level (Alt+↑)"
          >
            <ArrowUp className="size-4" />
          </Button>
        </div>

        <span className="h-5 w-px shrink-0 bg-border" />

        {/* Address / path bar */}
        <div className="relative flex min-w-0 flex-1 items-center gap-1">
          {editing ? (
            <>
              <Input
                ref={pathInputRef}
                value={pathText}
                onChange={(e) => handlePathChange(e.target.value)}
                onKeyDown={handlePathKeyDown}
                onBlur={(e) => {
                  // Don't cancel if clicking a suggestion
                  if (!(e.relatedTarget as HTMLElement)?.closest?.("[data-gallery-suggestions]"))
                    cancelEditing();
                }}
                className={cn(
                  "h-8 flex-1 font-mono text-sm",
                  pathError && "border-destructive focus-visible:ring-destructive",
                )}
                placeholder="e.g. Tax Returns 2025 > Prepare 1040  (Tab to autocomplete)"
                data-gallery-path-input
              />
              {/* Suggestions dropdown */}
              {suggestions.length > 0 && (
                <ul
                  data-gallery-suggestions
                  className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md"
                >
                  {suggestions.map((s, i) => (
                    <li key={s.fullPath}>
                      <button
                        type="button"
                        tabIndex={-1}
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted",
                          i === suggIdx && "bg-muted",
                        )}
                        onMouseDown={(e) => {
                          e.preventDefault(); // keep input focus
                          commitPath(s.fullPath);
                        }}
                      >
                        <span className="truncate font-medium">{s.label}</span>
                        <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground">
                          {s.fullPath}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPathText(pathToText(segments));
                setEditing(true);
                updateSuggestions(pathToText(segments));
              }}
              className="flex min-w-0 flex-1 items-center gap-0.5 rounded-md border bg-background px-2 py-1 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Click or Alt+D to edit path"
            >
              {segments.length === 0 ? (
                <span className="text-muted-foreground">File Gallery</span>
              ) : (
                segments.map((seg, i) => (
                  <span
                    key={`seg-${i}`}
                    className="flex items-center gap-0.5"
                    onClick={
                      i < segments.length - 1
                        ? (e) => {
                            e.stopPropagation();
                            onNavigate(seg.node);
                          }
                        : undefined
                    }
                  >
                    {i > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground" />}
                    <span
                      className={cn(
                        "truncate",
                        i === segments.length - 1
                          ? "font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:underline",
                      )}
                    >
                      {seg.label}
                    </span>
                  </span>
                ))
              )}
            </button>
          )}
        </div>

        {/* Refresh */}
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0"
          onClick={onRefresh}
          title="Refresh (F5)"
        >
          <RefreshCw className="size-4" />
        </Button>

        <span className="h-5 w-px shrink-0 bg-border" />

        {/* Upload */}
        {canUpload && (
          <>
            <Button
              size="sm"
              variant="default"
              className="h-8 shrink-0 gap-1.5"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              title="Upload files (Ctrl+U)"
              data-gallery-upload
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              Upload
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) {
                  onUpload(e.target.files);
                  e.target.value = "";
                }
              }}
            />
          </>
        )}

        {/* Type filter */}
        <Select
          value={filters.type}
          onValueChange={(v) => onFiltersChange({ ...filters, type: v as GalleryFilters["type"] })}
        >
          <SelectTrigger className="h-8 w-[120px] shrink-0 text-sm">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TYPE_KEYS.map((k) => (
              <SelectItem key={k} value={k}>
                {FILE_TYPE_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="h-5 w-px shrink-0 bg-border" />

        {/* Grid / List toggle */}
        <div className="flex shrink-0 rounded-md border bg-muted/40">
          <Button
            size="icon"
            variant="ghost"
            title="Grid view (Ctrl+Shift+2)"
            className={cn(
              "size-8 rounded-r-none",
              viewMode === "grid" && "bg-background shadow-sm",
            )}
            onClick={() => onViewModeChange("grid")}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="List view (Ctrl+Shift+1)"
            className={cn(
              "size-8 rounded-l-none",
              viewMode === "list" && "bg-background shadow-sm",
            )}
            onClick={() => onViewModeChange("list")}
          >
            <List className="size-4" />
          </Button>
        </div>

        <span className="h-5 w-px shrink-0 bg-border" />

        {/* Quick search */}
        <div className="relative w-[190px] shrink-0">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            placeholder="Search (Ctrl+F)"
            className="h-8 pl-7 pr-7 text-sm"
            data-gallery-search
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, search: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  },
);
