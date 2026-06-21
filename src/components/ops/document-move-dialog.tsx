import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Folder, FolderOpen, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/shared/utils";

export function DocumentMoveDialog({
  open,
  onOpenChange,
  folders,
  currentPath,
  disabledPath,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: string[]; // all folder paths in the task (including implicit ones)
  currentPath: string;
  // For folder moves, prevent moving into self or descendants
  disabledPath?: string;
  onConfirm: (target: string) => void;
}) {
  const [selected, setSelected] = useState<string>(currentPath ?? "");
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));

  // Build tree from flat paths
  const tree = buildTree(folders);

  const disabledPrefix = disabledPath ? `${disabledPath}/` : null;
  const isDisabled = (path: string): boolean =>
    !!disabledPath &&
    (path === disabledPath || (!!disabledPrefix && path.startsWith(disabledPrefix)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move to…</DialogTitle>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto rounded-md border p-1">
          <TreeNode
            node={tree}
            depth={0}
            selected={selected}
            expanded={expanded}
            onToggle={(p) =>
              setExpanded((prev) => {
                const next = new Set(prev);
                next.has(p) ? next.delete(p) : next.add(p);
                return next;
              })
            }
            onSelect={setSelected}
            isDisabled={isDisabled}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(selected)}
            disabled={selected === currentPath || isDisabled(selected)}
          >
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TNode = { name: string; path: string; children: TNode[] };

function buildTree(paths: string[]): TNode {
  const root: TNode = { name: "Root", path: "", children: [] };
  const all = new Set<string>(paths.filter(Boolean));
  // Ensure parent folders exist
  for (const p of [...all]) {
    const segs = p.split("/");
    for (let i = 1; i <= segs.length; i++) all.add(segs.slice(0, i).join("/"));
  }
  const map = new Map<string, TNode>();
  map.set("", root);
  for (const p of [...all].sort()) {
    const segs = p.split("/");
    const name = segs[segs.length - 1];
    const parent = segs.slice(0, -1).join("/");
    const node: TNode = { name, path: p, children: [] };
    map.set(p, node);
    map.get(parent)?.children.push(node);
  }
  return root;
}

function TreeNode({
  node,
  depth,
  selected,
  expanded,
  onToggle,
  onSelect,
  isDisabled,
}: {
  node: TNode;
  depth: number;
  selected: string;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
  isDisabled: (path: string) => boolean;
}) {
  const isOpen = expanded.has(node.path);
  const isSel = selected === node.path;
  const disabled = isDisabled(node.path);
  const hasKids = node.children.length > 0;
  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          onSelect(node.path);
          if (hasKids) onToggle(node.path);
        }}
        className={cn(
          "flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm",
          isSel
            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
            : "hover:bg-slate-100/70 dark:hover:bg-slate-800/40",
          disabled && "opacity-40",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {hasKids ? (
          isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 opacity-60" />
          )
        ) : (
          <span className="w-3.5" />
        )}
        {isOpen ? (
          <FolderOpen className="h-4 w-4 text-amber-500" />
        ) : (
          <Folder className="h-4 w-4 text-amber-500" />
        )}
        <span className="truncate">{node.path === "" ? "Task Root" : node.name}</span>
      </button>
      {isOpen && hasKids && (
        <div>
          {node.children.map((c) => (
            <TreeNode
              key={c.path}
              node={c}
              depth={depth + 1}
              selected={selected}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              isDisabled={isDisabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
