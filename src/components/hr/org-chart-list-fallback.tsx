// Cascading list fallback for very large org trees or list-style browsing.
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EditReportingLinePopover } from "./edit-reporting-line-popover";
import type { OrgNode } from "@/lib/hr/hierarchy.functions";

export function OrgChartListFallback({ nodes, canEdit }: { nodes: OrgNode[]; canEdit: boolean }) {
  const { roots, byParent } = useMemo(() => {
    const map = new Map<string | null, OrgNode[]>();
    for (const n of nodes) {
      if (n.manager_ids.length === 0) {
        const arr = map.get(null) ?? [];
        arr.push(n);
        map.set(null, arr);
      } else {
        for (const mid of n.manager_ids) {
          const arr = map.get(mid) ?? [];
          arr.push(n);
          map.set(mid, arr);
        }
      }
    }
    return { roots: map.get(null) ?? [], byParent: map };
  }, [nodes]);

  return (
    <div className="rounded-lg border bg-card divide-y">
      {roots.map((r) => (
        <Row key={r.id} node={r} depth={0} byParent={byParent} canEdit={canEdit} allNodes={nodes} />
      ))}
    </div>
  );
}

function Row({
  node,
  depth,
  byParent,
  canEdit,
  allNodes,
}: {
  node: OrgNode;
  depth: number;
  byParent: Map<string | null, OrgNode[]>;
  canEdit: boolean;
  allNodes: OrgNode[];
}) {
  const children = byParent.get(node.id) ?? [];
  const [open, setOpen] = useState(depth < 1);
  const [editing, setEditing] = useState(false);
  const initials = (node.full_name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-2 hover:bg-accent/40 transition-colors"
        style={{ paddingLeft: `${12 + depth * 24}px` }}
      >
        {children.length > 0 ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 shrink-0"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </Button>
        ) : (
          <span className="w-5" />
        )}
        <Avatar className="h-6 w-6">
          <AvatarImage src={node.avatar_url ?? undefined} alt={node.full_name ?? ""} />
          <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{node.full_name ?? "Unnamed"}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {node.position_title ?? "—"}
            {node.department ? (
              <>
                {" "}
                · <span className="capitalize">{node.department}</span>
              </>
            ) : null}
          </div>
        </div>
        {children.length > 0 && (
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {children.length}
          </Badge>
        )}
        {canEdit && (
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => setEditing(true)}
            title="Edit reporting line"
            aria-label="Edit reporting line"
          >
            <Edit3 className="h-3 w-3" />
          </Button>
        )}
      </div>
      {open &&
        children.map((c) => (
          <Row
            key={c.id}
            node={c}
            depth={depth + 1}
            byParent={byParent}
            canEdit={canEdit}
            allNodes={allNodes}
          />
        ))}
      {editing && (
        <EditReportingLinePopover
          node={node}
          allNodes={allNodes}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
