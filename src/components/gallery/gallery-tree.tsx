// Left-rail folder tree for the File Gallery — Phase 3.
//
// Two modes toggled by the user (persisted to localStorage):
//   "client"  → Firm → Client → Project → Task → folders
//   "project" → Firm → Project → Task → folders
//
// Container nodes (Firm / Client / Project) are split into:
//   • A clickable label that sets the selected node (shows all files in scope)
//   • A chevron button that expands/collapses children
//
// B2C Clients section is unchanged from Phase 2.
import { useState } from "react";
import {
  Bookmark,
  Building2,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderTree,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/shared/utils";
import type {
  GalleryClientNode,
  GalleryClientProjectNode,
  GalleryNode,
  GalleryProjectFlatNode,
  GalleryTree,
  GalleryTreeDirectClient,
  GalleryTreeTask,
} from "@/lib/queries/gallery.queries";

// ---------------------------------------------------------------------------
// buildFolderTree helper (adapted from document-manager.tsx)
// ---------------------------------------------------------------------------

type TreeNode = { name: string; path: string; children: Map<string, TreeNode> };

function buildFolderTree(folderPaths: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map() };
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

// ---------------------------------------------------------------------------
// Active-state helpers
// ---------------------------------------------------------------------------

function isTaskFolderActive(
  selected: GalleryNode | null,
  taskId: string,
  folderPath: string,
): boolean {
  return (
    !!selected &&
    selected.type === "task_folder" &&
    selected.taskId === taskId &&
    selected.folderPath === folderPath
  );
}

function isNodeActive(selected: GalleryNode | null, type: string, id: string): boolean {
  if (!selected || selected.type !== type) return false;
  const n = selected as Record<string, unknown>;
  return (
    n["firmId"] === id ||
    n["clientId"] === id ||
    n["projectId"] === id ||
    (n["id"] as string) === id
  );
}

// ---------------------------------------------------------------------------
// Residual leaf
// ---------------------------------------------------------------------------

function ResidualLeaf({
  count,
  depth,
  active,
  onClick,
}: {
  count: number;
  depth: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: 8 + depth * 14 }}
      className={cn(
        "relative flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm transition-colors hover:bg-muted/60",
        "text-amber-700 dark:text-amber-400",
        active && "bg-muted font-medium",
      )}
    >
      {active && <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded-r bg-indigo-500" />}
      <Bookmark className="size-4 shrink-0" />
      <span className="truncate">Residual (Shared Resources)</span>
      {count > 0 && (
        <span className="ml-auto shrink-0 rounded bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// FolderSubTree — task's internal folders shown in the left tree
// ---------------------------------------------------------------------------

function FolderSubTree({
  node,
  taskId,
  taskTitle,
  colors,
  depth,
  selected,
  onSelect,
}: {
  node: TreeNode;
  taskId: string;
  taskTitle: string;
  colors: Record<string, string | null>;
  depth: number;
  selected: GalleryNode | null;
  onSelect: (n: GalleryNode) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = node.children.size > 0;
  const isActive = isTaskFolderActive(selected, taskId, node.path);
  const folderColor = colors[node.path] ?? null;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelect({ type: "task_folder", taskId, folderPath: node.path, taskTitle });
          if (hasChildren) setOpen((v) => !v);
        }}
        style={{ paddingLeft: 8 + depth * 14 }}
        className={cn(
          "relative flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm transition-colors hover:bg-muted/60",
          isActive && "bg-muted font-medium text-foreground",
        )}
      >
        {isActive && (
          <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded-r bg-indigo-500" />
        )}
        {hasChildren ? (
          open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {open ? (
          <FolderOpen
            className={cn("size-4 shrink-0", !folderColor && "text-amber-500")}
            style={folderColor ? { color: folderColor } : undefined}
          />
        ) : (
          <Folder
            className={cn("size-4 shrink-0", !folderColor && "text-amber-500")}
            style={folderColor ? { color: folderColor } : undefined}
          />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {open && (
        <div>
          {[...node.children.values()].map((child) => (
            <FolderSubTree
              key={child.path}
              node={child}
              taskId={taskId}
              taskTitle={taskTitle}
              colors={colors}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TaskBranch — expandable task showing its folder sub-tree
// ---------------------------------------------------------------------------

function TaskBranch({
  task,
  depth,
  selected,
  onSelect,
}: {
  task: GalleryTreeTask;
  depth: number;
  selected: GalleryNode | null;
  onSelect: (n: GalleryNode) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasFolders = task.folderPaths.length > 0;
  const isRootActive = isTaskFolderActive(selected, task.id, "");
  const folderTree = hasFolders ? buildFolderTree(task.folderPaths) : null;

  return (
    <div>
      <div
        style={{ paddingLeft: 8 + depth * 14 }}
        className={cn(
          "relative flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-sm transition-colors hover:bg-muted/60",
          isRootActive && "bg-muted font-medium text-foreground",
        )}
      >
        {isRootActive && (
          <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded-r bg-indigo-500" />
        )}
        {hasFolders ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="shrink-0 p-0.5"
            aria-label={open ? "Collapse folders" : "Expand folders"}
          >
            {open ? (
              <ChevronDown className="size-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          type="button"
          onClick={() =>
            onSelect({
              type: "task_folder",
              taskId: task.id,
              folderPath: "",
              taskTitle: task.title,
            })
          }
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {open ? (
            <FolderOpen className="size-4 shrink-0 text-indigo-500" />
          ) : (
            <Folder className="size-4 shrink-0 text-indigo-400" />
          )}
          <span className="truncate">{task.title}</span>
        </button>
        {task.fileCount > 0 && (
          <span className="ml-auto shrink-0 rounded bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
            {task.fileCount}
          </span>
        )}
      </div>
      {open && folderTree && (
        <div>
          {[...folderTree.children.values()].map((child) => (
            <FolderSubTree
              key={child.path}
              node={child}
              taskId={task.id}
              taskTitle={task.title}
              colors={task.folderColors}
              depth={depth + 1}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SelectableBranch — a container row that is BOTH selectable AND expandable
// ---------------------------------------------------------------------------

function SelectableBranch({
  label,
  icon,
  depth,
  active,
  defaultOpen,
  onSelect,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  depth: number;
  active: boolean;
  defaultOpen?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div>
      <div
        style={{ paddingLeft: 8 + depth * 14 }}
        className={cn(
          "relative flex w-full items-center gap-1 rounded-md pr-2 transition-colors hover:bg-muted/60",
          active && "bg-muted",
        )}
      >
        {active && (
          <span className="absolute bottom-1 left-0 top-1 w-0.5 rounded-r bg-indigo-500" />
        )}
        {/* Chevron — expand/collapse only */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 p-1.5"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </button>
        {/* Label — select this node */}
        <button
          type="button"
          onClick={() => {
            onSelect();
            if (!open) setOpen(true);
          }}
          className={cn(
            "flex flex-1 items-center gap-1.5 py-1.5 text-left text-sm font-medium",
            active && "text-foreground",
          )}
        >
          <span className="shrink-0 text-muted-foreground">{icon}</span>
          <span className="truncate">{label}</span>
        </button>
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionHeader with optional toggle buttons
// ---------------------------------------------------------------------------

function SectionHeader({
  icon,
  label,
  actions,
}: {
  icon: React.ReactNode;
  label: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 px-2 pb-1 pt-3">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </span>
      {actions && <span className="ml-auto flex items-center gap-0.5">{actions}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project-first tree
// ---------------------------------------------------------------------------

function ProjectFirstTree({
  firmId,
  firmName,
  projects,
  unassignedTasks,
  selected,
  onSelect,
}: {
  firmId: string;
  firmName: string;
  projects: GalleryProjectFlatNode[];
  unassignedTasks: GalleryTreeTask[];
  selected: GalleryNode | null;
  onSelect: (n: GalleryNode) => void;
}) {
  const firmActive = isNodeActive(selected, "firm_folder", firmId);

  return (
    <SelectableBranch
      label={firmName}
      icon={<Building2 className="size-4" />}
      depth={0}
      active={firmActive}
      defaultOpen={true}
      onSelect={() => onSelect({ type: "firm_folder", firmId, firmName })}
    >
      {projects.map((p) => {
        const projActive = isNodeActive(selected, "project_folder", p.id);
        return (
          <SelectableBranch
            key={p.id}
            label={p.name}
            icon={<Folder className="size-4" />}
            depth={1}
            active={projActive}
            onSelect={() =>
              onSelect({ type: "project_folder", projectId: p.id, projectName: p.name })
            }
          >
            {p.tasks.map((t) => (
              <TaskBranch key={t.id} task={t} depth={2} selected={selected} onSelect={onSelect} />
            ))}
            {p.residualCount > 0 && (
              <ResidualLeaf
                count={p.residualCount}
                depth={2}
                active={isNodeActive(selected, "project_residual", p.id)}
                onClick={() => onSelect({ type: "project_residual", id: p.id })}
              />
            )}
          </SelectableBranch>
        );
      })}
      {unassignedTasks.map((t) => (
        <TaskBranch key={t.id} task={t} depth={1} selected={selected} onSelect={onSelect} />
      ))}
    </SelectableBranch>
  );
}

// ---------------------------------------------------------------------------
// Client-first tree
// ---------------------------------------------------------------------------

function ClientProjectBranch({
  proj,
  depth,
  selected,
  onSelect,
}: {
  proj: GalleryClientProjectNode;
  depth: number;
  selected: GalleryNode | null;
  onSelect: (n: GalleryNode) => void;
}) {
  const projActive = isNodeActive(selected, "project_folder", proj.id);
  return (
    <SelectableBranch
      label={proj.name}
      icon={<Folder className="size-4" />}
      depth={depth}
      active={projActive}
      onSelect={() =>
        onSelect({ type: "project_folder", projectId: proj.id, projectName: proj.name })
      }
    >
      {proj.tasks.map((t) => (
        <TaskBranch key={t.id} task={t} depth={depth + 1} selected={selected} onSelect={onSelect} />
      ))}
      {proj.residualCount > 0 && (
        <ResidualLeaf
          count={proj.residualCount}
          depth={depth + 1}
          active={isNodeActive(selected, "project_residual", proj.id)}
          onClick={() => onSelect({ type: "project_residual", id: proj.id })}
        />
      )}
    </SelectableBranch>
  );
}

function ClientFirstTree({
  firmId,
  firmName,
  clientGroups,
  unassignedTasks,
  selected,
  onSelect,
}: {
  firmId: string;
  firmName: string;
  clientGroups: GalleryClientNode[];
  unassignedTasks: GalleryTreeTask[];
  selected: GalleryNode | null;
  onSelect: (n: GalleryNode) => void;
}) {
  const firmActive = isNodeActive(selected, "firm_folder", firmId);

  return (
    <SelectableBranch
      label={firmName}
      icon={<Building2 className="size-4" />}
      depth={0}
      active={firmActive}
      defaultOpen={true}
      onSelect={() => onSelect({ type: "firm_folder", firmId, firmName })}
    >
      {clientGroups.map((c) => {
        const clientActive = isNodeActive(selected, "client_folder", c.id);
        return (
          <SelectableBranch
            key={c.id}
            label={c.name}
            icon={<Users className="size-4" />}
            depth={1}
            active={clientActive}
            onSelect={() => onSelect({ type: "client_folder", clientId: c.id, clientName: c.name })}
          >
            {c.projects.map((proj) => (
              <ClientProjectBranch
                key={proj.id}
                proj={proj}
                depth={2}
                selected={selected}
                onSelect={onSelect}
              />
            ))}
          </SelectableBranch>
        );
      })}
      {unassignedTasks.length > 0 && (
        <SelectableBranch
          label="Internal (No Client)"
          icon={<Folder className="size-4" />}
          depth={1}
          active={false}
          onSelect={() => {}}
        >
          {unassignedTasks.map((t) => (
            <TaskBranch key={t.id} task={t} depth={2} selected={selected} onSelect={onSelect} />
          ))}
        </SelectableBranch>
      )}
    </SelectableBranch>
  );
}

// ---------------------------------------------------------------------------
// B2C Client section (unchanged from Phase 2)
// ---------------------------------------------------------------------------

function DirectClientBranch({
  client,
  selected,
  onSelect,
}: {
  client: GalleryTreeDirectClient;
  selected: GalleryNode | null;
  onSelect: (n: GalleryNode) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: 8 }}
        className="flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-sm font-medium transition-colors hover:bg-muted/60"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <Folder className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{client.name}</span>
      </button>
      {open && (
        <div>
          {client.tasks.map((t) => (
            <TaskBranch key={t.id} task={t} depth={1} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

type Props = {
  tree: GalleryTree;
  selected: GalleryNode | null;
  onSelect: (node: GalleryNode) => void;
};

export type TreeMode = "client" | "project";

export function GalleryTreeView({ tree, selected, onSelect }: Props) {
  const [treeMode, setTreeMode] = useState<TreeMode>(() => {
    if (typeof localStorage !== "undefined") {
      const v = localStorage.getItem("gallery-tree-mode");
      if (v === "client" || v === "project") return v;
    }
    return "project";
  });

  function handleSetMode(m: TreeMode) {
    setTreeMode(m);
    if (typeof localStorage !== "undefined") localStorage.setItem("gallery-tree-mode", m);
  }

  const empty =
    tree.projects.length === 0 && tree.clientGroups.length === 0 && tree.directClients.length === 0;

  return (
    <ScrollArea className="h-full">
      <div className="space-y-0.5 p-2">
        {empty && (
          <p className="px-2 py-6 text-sm text-muted-foreground">No documents available yet.</p>
        )}

        {/* Firm / Projects section with toggle */}
        {(tree.projects.length > 0 || tree.clientGroups.length > 0) && (
          <>
            <SectionHeader
              icon={<Building2 className="size-3.5" />}
              label="Firm / Projects"
              actions={
                <>
                  <Button
                    size="sm"
                    variant={treeMode === "client" ? "secondary" : "ghost"}
                    className="h-6 px-2 text-[11px]"
                    onClick={() => handleSetMode("client")}
                    title="Client-first: Firm → Client → Project → Task"
                  >
                    By Client
                  </Button>
                  <Button
                    size="sm"
                    variant={treeMode === "project" ? "secondary" : "ghost"}
                    className="h-6 px-2 text-[11px]"
                    onClick={() => handleSetMode("project")}
                    title="Project-first: Firm → Project → Task"
                  >
                    By Project
                  </Button>
                </>
              }
            />

            {treeMode === "project" ? (
              <ProjectFirstTree
                firmId={tree.firmId}
                firmName={tree.firmName}
                projects={tree.projects}
                unassignedTasks={tree.unassignedTasks}
                selected={selected}
                onSelect={onSelect}
              />
            ) : (
              <ClientFirstTree
                firmId={tree.firmId}
                firmName={tree.firmName}
                clientGroups={tree.clientGroups}
                unassignedTasks={tree.unassignedTasks}
                selected={selected}
                onSelect={onSelect}
              />
            )}
          </>
        )}

        {/* B2C Clients — unchanged */}
        {tree.directClients.length > 0 && (
          <>
            <SectionHeader icon={<FolderTree className="size-3.5" />} label="B2C Clients" />
            {tree.directClients.map((d) => (
              <DirectClientBranch key={d.id} client={d} selected={selected} onSelect={onSelect} />
            ))}
          </>
        )}
      </div>
    </ScrollArea>
  );
}
