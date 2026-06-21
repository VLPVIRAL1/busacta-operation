// File Gallery hub — Windows Explorer style browser.
//
// Layout: [address bar] / [tree | handle | explorer] / [status bar]
//
// Keyboard shortcuts (work everywhere — stale-closure fixed with latest-ref pattern):
//   Alt+← / Backspace    Back
//   Alt+→                Forward
//   Alt+↑                Up one level
//   Alt+D                Focus address bar (edit path)
//   Alt+Space → 4        Focus folder tree panel
//   Alt+Space → 6        Focus file explorer panel
//   F5                   Refresh
//   Ctrl+F / F3          Focus search
//   Escape               Clear search or blur
//   Ctrl+U               Upload (task folder only)
//   Ctrl+Shift+1         List view
//   Ctrl+Shift+2         Grid view
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CloudUpload, Loader2 } from "lucide-react";
import { useGalleryUpload } from "@/lib/gallery/gallery-upload";
import {
  galleryNodeFilesQuery,
  galleryTreeQuery,
  type GalleryNode,
  type GalleryTree,
} from "@/lib/queries/gallery.queries";
import { GalleryAddressBar, type GalleryAddressBarHandle } from "./gallery-address-bar";
import { GalleryExplorerPanel, type ViewMode } from "./gallery-explorer-panel";
import { GalleryStatusBar } from "./gallery-status-bar";
import { EMPTY_FILTERS, type GalleryFilters } from "./gallery-toolbar";
import { GalleryTreeView } from "./gallery-tree";

// ---------------------------------------------------------------------------
// Per-folder view mode key (mirrors Windows Explorer per-folder memory)
// ---------------------------------------------------------------------------
function nodeViewModeKey(node: GalleryNode | null): string {
  if (!node) return "";
  switch (node.type) {
    case "firm_folder":
      return `firm:${node.firmId}`;
    case "project_folder":
      return `project:${node.projectId}`;
    case "client_folder":
      return `client:${node.clientId}`;
    case "task_folder":
      return `task:${node.taskId}:${node.folderPath}`;
    case "project_residual":
      return `presid:${node.id}`;
    case "client_residual":
      return `cresid:${node.id}`;
  }
}

// ---------------------------------------------------------------------------
// Resize constants
// ---------------------------------------------------------------------------
const TREE_W_KEY = "gallery-tree-w";
const TREE_W_DEFAULT = 280;
const TREE_W_MIN = 180;
const TREE_W_MAX = 520;

// ---------------------------------------------------------------------------
// "Up" navigation
// ---------------------------------------------------------------------------
function getParentNode(node: GalleryNode, tree: GalleryTree): GalleryNode | null {
  if (node.type === "task_folder") {
    if (node.folderPath) {
      const parentPath = node.folderPath.split("/").slice(0, -1).join("/");
      return { ...node, folderPath: parentPath };
    }
    for (const p of tree.projects)
      if (p.tasks.some((t) => t.id === node.taskId))
        return { type: "project_folder", projectId: p.id, projectName: p.name };
    for (const c of tree.clientGroups)
      for (const p of c.projects)
        if (p.tasks.some((t) => t.id === node.taskId))
          return { type: "project_folder", projectId: p.id, projectName: p.name };
    return { type: "firm_folder", firmId: tree.firmId, firmName: tree.firmName };
  }
  if (node.type === "project_folder" || node.type === "client_folder")
    return { type: "firm_folder", firmId: tree.firmId, firmName: tree.firmName };
  return null;
}

// ---------------------------------------------------------------------------
// GalleryBrowser
// ---------------------------------------------------------------------------
export function GalleryBrowser() {
  // ---- View state ----
  const [filters, setFilters] = useState<GalleryFilters>(EMPTY_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem("gallery-view-mode");
      if (v === "grid" || v === "list") return v;
    }
    return "grid";
  });
  const [dragDepth, setDragDepth] = useState(0);

  // ---- Navigation history ----
  const [history, setHistory] = useState<GalleryNode[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const selected: GalleryNode | null = historyIdx >= 0 ? (history[historyIdx] ?? null) : null;

  const treeQuery = useQuery(galleryTreeQuery());
  const tree = treeQuery.data ?? null;

  const canGoBack = historyIdx > 0;
  const canGoForward = historyIdx < history.length - 1;
  const canGoUp = !!selected && !!tree && getParentNode(selected, tree) !== null;

  // ---- Latest-ref pattern — ensures keyboard handler never goes stale ----
  const stateRef = useRef({
    history,
    historyIdx,
    selected,
    tree,
    canGoBack,
    canGoForward,
    canGoUp,
    filters,
    viewMode,
  });
  stateRef.current = {
    history,
    historyIdx,
    selected,
    tree,
    canGoBack,
    canGoForward,
    canGoUp,
    filters,
    viewMode,
  };

  function navigate(node: GalleryNode) {
    setHistory((prev) => [...prev.slice(0, stateRef.current.historyIdx + 1), node]);
    setHistoryIdx((i) => i + 1);
    setFilters((f) => ({ ...EMPTY_FILTERS, search: f.search }));
  }
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  function goBack() {
    if (stateRef.current.canGoBack) setHistoryIdx((i) => i - 1);
  }
  function goForward() {
    if (stateRef.current.canGoForward) setHistoryIdx((i) => i + 1);
  }
  function goUp() {
    const { selected: s, tree: t } = stateRef.current;
    if (!s || !t) return;
    const parent = getParentNode(s, t);
    if (parent) navigateRef.current(parent);
  }
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  const goForwardRef = useRef(goForward);
  goForwardRef.current = goForward;
  const goUpRef = useRef(goUp);
  goUpRef.current = goUp;

  // ---- Data ----
  const qc = useQueryClient();
  const contentQuery = useQuery(galleryNodeFilesQuery(selected));
  const { uploadFiles, uploading } = useGalleryUpload();
  const canUpload = selected?.type === "task_folder";

  function handleRefresh() {
    void qc.invalidateQueries({ queryKey: ["gallery-node-files"] });
    void qc.invalidateQueries({ queryKey: ["gallery-tree"] });
  }
  const refreshRef = useRef(handleRefresh);
  refreshRef.current = handleRefresh;

  // ---- Address bar imperative ref (for Alt+D) ----
  const addressBarRef = useRef<GalleryAddressBarHandle>(null);

  // ---- Per-folder view mode restore (like Windows Explorer) ----
  const selectedKey = selected ? nodeViewModeKey(selected) : "";
  useEffect(() => {
    if (!selectedKey || typeof localStorage === "undefined") return;
    const stored = localStorage.getItem(`gallery-vm:${selectedKey}`);
    if (stored === "grid" || stored === "list") setViewMode(stored);
  }, [selectedKey]);

  function handleViewModeChange(v: ViewMode) {
    setViewMode(v);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("gallery-view-mode", v);
      const key = nodeViewModeKey(stateRef.current.selected);
      if (key) localStorage.setItem(`gallery-vm:${key}`, v);
    }
  }
  const viewModeRef = useRef(handleViewModeChange);
  viewModeRef.current = handleViewModeChange;

  // ---- Chord state for Alt+Space → 4/6 panel focus ----
  const chordPendingRef = useRef(false);
  const chordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleUpload(fileList: FileList | File[]) {
    const { selected: s } = stateRef.current;
    if (!s || s.type !== "task_folder") return;
    void uploadFiles(s.taskId, s.folderPath, fileList);
  }
  const uploadRef = useRef(handleUpload);
  uploadRef.current = handleUpload;

  // ---- Keyboard shortcuts (registered once — no stale closures via refs) ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const tag = target.tagName;

      // Is focus inside a genuine text input (but NOT the path input — we handle that ourselves)?
      const inPathInput =
        !!(target as HTMLElement).closest?.("[data-gallery-path-input]") ||
        target.matches("[data-gallery-path-input]");
      const inSearch = target.matches("[data-gallery-search]");
      const inTextInput =
        (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) && !inPathInput;

      // ── Escape: always — clear search or blur ──────────────────────────────
      if (e.key === "Escape") {
        if (stateRef.current.filters.search) {
          e.preventDefault();
          setFilters((f) => ({ ...f, search: "" }));
          return;
        }
        (document.activeElement as HTMLElement | null)?.blur();
        return;
      }

      // ── Ctrl+F / F3: always — focus search ────────────────────────────────
      if (e.key === "F3" || (e.ctrlKey && e.key === "f" && !e.shiftKey)) {
        e.preventDefault();
        (document.querySelector("[data-gallery-search]") as HTMLInputElement | null)?.focus();
        return;
      }

      // ── Block remaining shortcuts only when focus is in a real text field ──
      // (Backspace in the search box should still type, not navigate back)
      if (inTextInput && !inSearch) return;

      // ── Alt+← / Alt+→ / Alt+↑ / Alt+D / Alt+Space — always ─────────────────
      if (e.altKey) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          goBackRef.current();
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          goForwardRef.current();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          goUpRef.current();
          return;
        }
        if (e.key === "d" || e.key === "D") {
          e.preventDefault();
          addressBarRef.current?.focusAddressBar();
          return;
        }
        if (e.key === " ") {
          // Alt+Space starts the chord: next keypress of 4/6 switches panels
          e.preventDefault();
          chordPendingRef.current = true;
          if (chordTimeoutRef.current) clearTimeout(chordTimeoutRef.current);
          chordTimeoutRef.current = setTimeout(() => {
            chordPendingRef.current = false;
          }, 1500);
          return;
        }
      }

      // ── Alt+Space chord: 4 → tree panel, 6 → explorer panel ─────────────────
      if (chordPendingRef.current) {
        chordPendingRef.current = false;
        if (chordTimeoutRef.current) clearTimeout(chordTimeoutRef.current);
        if (e.key === "4") {
          e.preventDefault();
          const panel = document.querySelector<HTMLElement>("[data-gallery-tree-panel]");
          const first = panel?.querySelector<HTMLElement>("button");
          (first ?? panel)?.focus();
          return;
        }
        if (e.key === "6") {
          e.preventDefault();
          document.querySelector<HTMLElement>("[data-gallery-explorer-panel] [tabindex]")?.focus();
          return;
        }
        // Any other key silently cancels the chord
        return;
      }

      // ── Below: blocked when focus is in any input (including search) ───────
      if (inTextInput || inSearch) return;

      // Backspace — go back (mirrors Windows Explorer)
      if (e.key === "Backspace") {
        e.preventDefault();
        goBackRef.current();
        return;
      }

      // F5 — refresh
      if (e.key === "F5") {
        e.preventDefault();
        refreshRef.current();
        return;
      }

      // Ctrl+U — upload
      if (e.ctrlKey && e.key === "u") {
        if (stateRef.current.selected?.type === "task_folder") {
          e.preventDefault();
          (document.querySelector("[data-gallery-upload]") as HTMLElement | null)?.click();
        }
        return;
      }

      // Ctrl+Shift+1/2 — view mode
      if (e.ctrlKey && e.shiftKey) {
        if (e.key === "1") {
          e.preventDefault();
          viewModeRef.current("list");
          return;
        }
        if (e.key === "2") {
          e.preventDefault();
          viewModeRef.current("grid");
          return;
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // Registered once — reads all live state through refs
  }, []);

  // ---- Resizable tree panel ----
  const [treeColPx, setTreeColPx] = useState<number>(() => {
    if (typeof localStorage !== "undefined") {
      const n = Number(localStorage.getItem(TREE_W_KEY));
      if (Number.isFinite(n) && n >= TREE_W_MIN && n <= TREE_W_MAX) return n;
    }
    return TREE_W_DEFAULT;
  });
  const treeDragRef = useRef(false);

  function startTreeDrag(e: React.PointerEvent) {
    e.preventDefault();
    treeDragRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }
  function moveTreeDrag(e: React.PointerEvent) {
    if (!treeDragRef.current) return;
    const c = (e.currentTarget as HTMLElement).closest("[data-gallery-grid]") as HTMLElement | null;
    if (!c) return;
    setTreeColPx(
      Math.max(TREE_W_MIN, Math.min(TREE_W_MAX, e.clientX - c.getBoundingClientRect().left)),
    );
  }
  function endTreeDrag() {
    if (!treeDragRef.current) return;
    treeDragRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    if (typeof localStorage !== "undefined") localStorage.setItem(TREE_W_KEY, String(treeColPx));
  }

  const content = contentQuery.data ?? { folders: [], files: [] };
  const filteredFileCount = content.files.filter(
    (f) => !filters.search || f.filename.toLowerCase().includes(filters.search.toLowerCase()),
  ).length;

  return (
    <div
      className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-lg border bg-card"
      onDragEnter={(e) => {
        if (canUpload && e.dataTransfer?.types?.includes("Files")) {
          e.preventDefault();
          setDragDepth((d) => d + 1);
        }
      }}
      onDragOver={(e) => {
        if (canUpload && e.dataTransfer?.types?.includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => setDragDepth((d) => Math.max(0, d - 1))}
      onDrop={(e) => {
        if (canUpload && e.dataTransfer?.files?.length) {
          e.preventDefault();
          setDragDepth(0);
          handleUpload(e.dataTransfer.files);
        }
      }}
    >
      {/* Address bar */}
      <GalleryAddressBar
        ref={addressBarRef}
        node={selected}
        tree={tree}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        canGoUp={canGoUp}
        onBack={goBack}
        onForward={goForward}
        onUp={goUp}
        onNavigate={navigate}
        onRefresh={handleRefresh}
        canUpload={canUpload}
        uploading={uploading}
        onUpload={handleUpload}
        filters={filters}
        onFiltersChange={setFilters}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
      />

      {/* Two-column resizable body */}
      <div
        data-gallery-grid
        className="min-h-0 flex-1"
        style={{ display: "grid", gridTemplateColumns: `${treeColPx}px 5px minmax(0, 1fr)` }}
        onPointerMove={moveTreeDrag}
        onPointerUp={endTreeDrag}
        onPointerCancel={endTreeDrag}
      >
        {/* Left: tree */}
        <aside data-gallery-tree-panel className="overflow-hidden border-r bg-muted/20">
          {treeQuery.isLoading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : treeQuery.isError ? (
            <p className="p-4 text-sm text-destructive">Failed to load the gallery.</p>
          ) : (
            <GalleryTreeView tree={tree!} selected={selected} onSelect={navigate} />
          )}
        </aside>

        {/* Resize handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize · double-click to reset"
          onPointerDown={startTreeDrag}
          onDoubleClick={() => {
            setTreeColPx(TREE_W_DEFAULT);
            if (typeof localStorage !== "undefined")
              localStorage.setItem(TREE_W_KEY, String(TREE_W_DEFAULT));
          }}
          className="flex cursor-col-resize items-center justify-center hover:bg-indigo-100/40 dark:hover:bg-indigo-500/10"
        >
          <span className="h-10 w-px rounded-full bg-border" />
        </div>

        {/* Right: explorer */}
        <section
          data-gallery-explorer-panel
          className="relative flex min-w-0 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 overflow-hidden">
            <GalleryExplorerPanel
              content={content}
              node={selected}
              filters={filters}
              viewMode={viewMode}
              isLoading={!!selected && contentQuery.isLoading}
              onNavigateInto={navigate}
            />
          </div>

          {dragDepth > 0 && canUpload && (
            <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-indigo-400 bg-indigo-50/80 backdrop-blur-sm dark:bg-indigo-500/10">
              <CloudUpload className="size-10 text-indigo-500" />
              <p className="text-sm font-medium text-indigo-700 dark:text-indigo-200">
                Drop files here to upload
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Status bar */}
      <GalleryStatusBar
        content={selected ? content : null}
        isLoading={!!selected && contentQuery.isLoading}
        filteredFileCount={filteredFileCount}
      />
    </div>
  );
}
