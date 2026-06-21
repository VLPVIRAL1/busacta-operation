import { useState, useRef, useEffect } from "react";
import { Trash2, Check, RotateCcw, Eye, EyeOff, Send } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/shared/utils";
import type { FileAnnotation } from "@/lib/ops/file-annotations.functions";

export type AnnotationTool = "pointer" | "pin" | "rect";

export type AnnotationLayerProps = {
  pageNumber: number;
  width: number;
  height: number;
  annotations: FileAnnotation[];
  tool: AnnotationTool;
  showResolved: boolean;
  layerOn: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (input: {
    page: number;
    kind: "pin" | "rect";
    geometry: { x: number; y: number; w?: number; h?: number };
  }) => void;
  onUpdateBody: (id: string, body: string) => void;
  onToggleVisibility: (id: string, value: boolean) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onDelete: (id: string) => void;
  onReply: (id: string, body: string) => void;
  onDeleteReply: (id: string) => void;
};

export function AnnotationLayer(props: AnnotationLayerProps) {
  const {
    pageNumber,
    width,
    height,
    annotations,
    tool,
    showResolved,
    layerOn,
    selectedId,
    onSelect,
    onCreate,
  } = props;

  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; cx: number; cy: number } | null>(null);

  const visible = annotations.filter(
    (a) => a.page === pageNumber && (showResolved || !a.resolved_at),
  );

  const pointer = (e: React.PointerEvent) => {
    if (!ref.current) return { x: 0, y: 0 };
    const r = ref.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!layerOn) return;
    if (tool === "pin") {
      const { x, y } = pointer(e);
      onCreate({ page: pageNumber, kind: "pin", geometry: { x, y } });
    } else if (tool === "rect") {
      const { x, y } = pointer(e);
      setDrag({ x, y, cx: x, cy: y });
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } else {
      onSelect(null);
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { x, y } = pointer(e);
    setDrag({ ...drag, cx: x, cy: y });
  };
  const onUp = () => {
    if (!drag) return;
    const x = Math.min(drag.x, drag.cx);
    const y = Math.min(drag.y, drag.cy);
    const w = Math.abs(drag.cx - drag.x);
    const h = Math.abs(drag.cy - drag.y);
    if (w > 0.005 && h > 0.005) {
      onCreate({ page: pageNumber, kind: "rect", geometry: { x, y, w, h } });
    }
    setDrag(null);
  };

  const cursor = !layerOn
    ? "default"
    : tool === "pin"
      ? "crosshair"
      : tool === "rect"
        ? "crosshair"
        : "default";

  return (
    <div
      ref={ref}
      className="absolute inset-0 select-none"
      style={{ width, height, pointerEvents: layerOn ? "auto" : "none", cursor }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {drag && (
        <div
          className="absolute border-2 border-amber-500 bg-amber-400/20"
          style={{
            left: Math.min(drag.x, drag.cx) * width,
            top: Math.min(drag.y, drag.cy) * height,
            width: Math.abs(drag.cx - drag.x) * width,
            height: Math.abs(drag.cy - drag.y) * height,
          }}
        />
      )}
      {visible.map((a, i) => (
        <AnnotationNode
          key={a.id}
          {...props}
          index={i + 1}
          annotation={a}
          selected={selectedId === a.id}
        />
      ))}
    </div>
  );
}

function AnnotationNode({
  annotation: a,
  width,
  height,
  index,
  selected,
  onSelect,
  onUpdateBody,
  onToggleVisibility,
  onResolve,
  onDelete,
  onReply,
  onDeleteReply,
}: AnnotationLayerProps & {
  annotation: FileAnnotation;
  index: number;
  selected: boolean;
}) {
  const isRect = a.kind === "rect";
  const g = a.geometry;
  const left = (g.x ?? 0) * width;
  const top = (g.y ?? 0) * height;
  const w = isRect ? (g.w ?? 0) * width : 0;
  const h = isRect ? (g.h ?? 0) * height : 0;
  const color = a.color || "#fbbf24";
  const resolved = !!a.resolved_at;

  const [body, setBody] = useState(a.body);
  const [reply, setReply] = useState("");
  useEffect(() => setBody(a.body), [a.body, a.id]);

  return (
    <Popover open={selected} onOpenChange={(o) => onSelect(o ? a.id : null)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Annotation"
          className={cn("absolute outline-none transition-opacity", resolved && "opacity-40")}
          style={
            isRect
              ? {
                  left,
                  top,
                  width: w,
                  height: h,
                  border: `2px solid ${color}`,
                  background: `${color}33`,
                  cursor: "pointer",
                }
              : {
                  left: left - 12,
                  top: top - 12,
                  width: 24,
                  height: 24,
                  borderRadius: 9999,
                  background: color,
                  color: "#1f2937",
                  fontSize: 11,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 1px 3px rgba(0,0,0,.35)",
                  cursor: "pointer",
                }
          }
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(a.id);
          }}
        >
          {!isRect && index}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        className="w-80 space-y-3 p-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">{a.author_name ?? "User"}</span>
          <span>·</span>
          <span>{new Date(a.created_at).toLocaleString()}</span>
          {resolved && (
            <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Resolved
            </span>
          )}
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onBlur={() => body !== a.body && onUpdateBody(a.id, body)}
          rows={3}
          placeholder="Add a comment…"
          className="text-sm"
        />

        {a.replies.length > 0 && (
          <div className="space-y-2 border-t pt-2">
            {a.replies.map((r) => (
              <div key={r.id} className="rounded-md bg-muted/50 p-2 text-xs">
                <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>
                    {r.author_name ?? "User"} · {new Date(r.created_at).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => onDeleteReply(r.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="whitespace-pre-wrap">{r.body}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={1}
            placeholder="Reply…"
            className="min-h-9 text-xs"
          />
          <Button
            size="sm"
            disabled={!reply.trim()}
            onClick={() => {
              onReply(a.id, reply.trim());
              setReply("");
            }}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="flex items-center justify-between border-t pt-2 text-xs">
          <label className="flex items-center gap-2">
            <Switch
              checked={a.is_client_visible}
              onCheckedChange={(v) => onToggleVisibility(a.id, v)}
            />
            <span className="text-muted-foreground inline-flex items-center gap-1">
              {a.is_client_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
              {a.is_client_visible ? "Shared" : "Internal"}
            </span>
          </label>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => onResolve(a.id, !resolved)}
              title={resolved ? "Reopen" : "Resolve"}
            >
              {resolved ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-destructive hover:text-destructive"
              onClick={() => onDelete(a.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
