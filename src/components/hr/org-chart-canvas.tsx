// Tree canvas: pure CSS-grid recursive layout. Roots stack horizontally,
// children render in a horizontal row beneath each parent, joined by simple
// CSS connector pseudo-elements. Wrapped in a horizontally + vertically
// scrollable container so very wide / deep trees stay usable.
import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrgChartNode } from "./org-chart-node";
import type { OrgNode } from "@/lib/hr/hierarchy.functions";

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

export function OrgChartCanvas({ nodes, canEdit }: { nodes: OrgNode[]; canEdit: boolean }) {
  const { byParent, treeRoots, standalone } = useMemo(() => {
    // Build manager_id → children[] map from the multi-manager junction data.
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
    const allRoots = map.get(null) ?? [];
    const treeRoots = allRoots.filter((r) => (map.get(r.id) ?? []).length > 0);
    const standalone = allRoots.filter((r) => (map.get(r.id) ?? []).length === 0);
    return { byParent: map, treeRoots, standalone };
  }, [nodes]);

  const [focusId, setFocusId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFocusId(null);
  }, [nodes]);

  const clamp = (v: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(v.toFixed(2))));

  // ⌘/Ctrl + wheel zoom inside the canvas.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((z) => clamp(z + delta));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const { highlightedIds, focusChain } = useMemo(() => {
    if (!focusId) return { highlightedIds: new Set<string>(), focusChain: new Set<string>() };
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const chain = new Set<string>();
    let cursor: OrgNode | undefined = byId.get(focusId);
    while (cursor) {
      chain.add(cursor.id);
      cursor = cursor.reports_to ? byId.get(cursor.reports_to) : undefined;
    }
    const reports = new Set<string>();
    for (const n of nodes) {
      if (n.reports_to === focusId) reports.add(n.id);
    }
    return { highlightedIds: reports, focusChain: chain };
  }, [focusId, nodes]);

  return (
    <div className="relative">
      {/* Zoom controls */}
      <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md border bg-card/95 backdrop-blur p-0.5 shadow-sm">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setZoom((z) => clamp(z - ZOOM_STEP))}
          disabled={zoom <= ZOOM_MIN}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="px-1.5 text-[11px] tabular-nums text-muted-foreground w-10 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setZoom((z) => clamp(z + ZOOM_STEP))}
          disabled={zoom >= ZOOM_MAX}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setZoom(1)}
          title="Fit (100%)"
          aria-label="Fit to 100%"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div
        ref={scrollerRef}
        className="overflow-auto rounded-lg border bg-muted/20 p-6 max-h-[calc(100vh-280px)]"
        title="Hold ⌘/Ctrl and scroll to zoom"
      >
        <div style={{ zoom: zoom }} className="inline-flex items-start gap-0 min-w-max">
          {/* Left column — standalone nodes with no reporting line */}
          {standalone.length > 0 && (
            <div className="flex flex-col gap-0 shrink-0">
              {/* Column header */}
              <div className="flex items-center gap-2 px-3 pb-3 border-b border-border mb-4">
                <div className="w-px h-4 bg-muted-foreground/30" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap font-medium">
                  No Reporting Line
                </span>
              </div>
              <div className="flex flex-col items-center gap-3 px-3">
                {standalone.map((node) => {
                  const isFocused = focusId === node.id;
                  const isInChain = focusChain.has(node.id);
                  const isDirectReport = highlightedIds.has(node.id);
                  const dim = focusId !== null && !isFocused && !isInChain && !isDirectReport;
                  return (
                    <div key={node.id} className={dim ? "opacity-30" : undefined}>
                      <OrgChartNode
                        node={node}
                        canEdit={canEdit}
                        focused={isFocused}
                        highlighted={isInChain || isDirectReport}
                        onFocus={(id) => setFocusId(id === focusId ? null : id)}
                        allNodes={nodes}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Divider between the two columns */}
          {standalone.length > 0 && treeRoots.length > 0 && (
            <div className="w-px self-stretch bg-border mx-6 shrink-0" />
          )}

          {/* Right column — full hierarchy tree */}
          {treeRoots.length > 0 && (
            <div className="flex flex-col items-start gap-0 min-w-0">
              {/* Column header */}
              <div className="flex items-center gap-2 px-3 pb-3 border-b border-border mb-4 w-full">
                <div className="w-px h-4 bg-muted-foreground/30" />
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground whitespace-nowrap font-medium">
                  Reporting Hierarchy
                </span>
              </div>
              <div className="inline-flex items-start gap-10 px-3">
                {treeRoots.map((root) => (
                  <Subtree
                    key={root.id}
                    node={root}
                    byParent={byParent}
                    canEdit={canEdit}
                    allNodes={nodes}
                    focusId={focusId}
                    focusChain={focusChain}
                    highlightedIds={highlightedIds}
                    onFocus={(id) => setFocusId(id === focusId ? null : id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Subtree({
  node,
  byParent,
  canEdit,
  allNodes,
  focusId,
  focusChain,
  highlightedIds,
  onFocus,
}: {
  node: OrgNode;
  byParent: Map<string | null, OrgNode[]>;
  canEdit: boolean;
  allNodes: OrgNode[];
  focusId: string | null;
  focusChain: Set<string>;
  highlightedIds: Set<string>;
  onFocus: (id: string) => void;
}) {
  const children = byParent.get(node.id) ?? [];
  const isFocused = focusId === node.id;
  const isInChain = focusChain.has(node.id);
  const isDirectReport = highlightedIds.has(node.id);
  const dim = focusId !== null && !isFocused && !isInChain && !isDirectReport;

  return (
    <div
      className={["inline-flex flex-col items-center", dim && "opacity-30"]
        .filter(Boolean)
        .join(" ")}
    >
      <OrgChartNode
        node={node}
        canEdit={canEdit}
        focused={isFocused}
        highlighted={isInChain || isDirectReport}
        onFocus={onFocus}
        allNodes={allNodes}
      />
      {children.length > 0 && (
        <>
          {/* Vertical down stem */}
          <div className="w-px h-6 bg-border" />
          {/* Horizontal connector */}
          {children.length > 1 && (
            <div className="h-px bg-border" style={{ width: "calc(100% - 220px)" }} />
          )}
          <div className="flex items-start gap-8 pt-0">
            {children.map((child) => (
              <div key={child.id} className="flex flex-col items-center">
                {/* short stem up to horizontal connector */}
                <div className="w-px h-6 bg-border -mt-px" />
                <Subtree
                  node={child}
                  byParent={byParent}
                  canEdit={canEdit}
                  allNodes={allNodes}
                  focusId={focusId}
                  focusChain={focusChain}
                  highlightedIds={highlightedIds}
                  onFocus={onFocus}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
