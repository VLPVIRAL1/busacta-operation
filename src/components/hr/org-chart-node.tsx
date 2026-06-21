// Single org chart node card. Used by both the tree canvas and the list fallback.
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit3 } from "lucide-react";
import { EditReportingLinePopover } from "./edit-reporting-line-popover";
import type { OrgNode } from "@/lib/hr/hierarchy.functions";

export function OrgChartNode({
  node,
  canEdit,
  focused,
  highlighted,
  onFocus,
  allNodes,
}: {
  node: OrgNode;
  canEdit: boolean;
  focused: boolean;
  highlighted: boolean;
  onFocus: (id: string) => void;
  allNodes: OrgNode[];
}) {
  const [editing, setEditing] = useState(false);
  const initials = (node.full_name ?? node.email ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={[
        "relative group inline-flex flex-col gap-1 rounded-lg border bg-card p-3 w-[220px] shadow-sm transition-all cursor-pointer",
        focused && "ring-2 ring-primary",
        highlighted && !focused && "ring-1 ring-primary/40",
        !focused && !highlighted && "opacity-95 hover:opacity-100 hover:border-primary/40",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onFocus(node.id)}
    >
      <div className="flex items-start gap-2">
        <Avatar className="h-9 w-9">
          <AvatarImage src={node.avatar_url ?? undefined} alt={node.full_name ?? ""} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate" title={node.full_name ?? undefined}>
            {node.full_name ?? "Unnamed"}
          </div>
          <div
            className="text-[11px] text-muted-foreground truncate"
            title={node.position_title ?? undefined}
          >
            {node.position_title ?? "—"}
            {node.department ? (
              <>
                {" "}
                · <span className="capitalize">{node.department}</span>
              </>
            ) : null}
          </div>
        </div>
        {node.status && node.status !== "active" && (
          <Badge variant="outline" className="text-[9px] capitalize">
            {node.status}
          </Badge>
        )}
      </div>

      {canEdit && (
        <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
          <Button
            size="icon"
            variant="outline"
            className="h-6 w-6 rounded-full"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            title="Edit reporting line"
            aria-label="Edit reporting line"
          >
            <Edit3 className="h-3 w-3" />
          </Button>
        </div>
      )}

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
