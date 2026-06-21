import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { Eraser, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import { BlockShell } from "./block-shell";

type Stroke = { color: string; width: number; points: Array<[number, number]> };

const W = 760;
const H = 280;
const COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#111827"];

export const DrawingBlock = Node.create({
  name: "drawingBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      strokes: { default: [] as Stroke[] },
      color: { default: "#0ea5e9" },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="drawing-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "drawing-block" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DrawingView) as any;
  },
});

function DrawingView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const editable = editor.isEditable;
  const strokes: Stroke[] = Array.isArray(node.attrs.strokes) ? node.attrs.strokes : [];
  const color: string = (node.attrs.color as string) ?? "#0ea5e9";

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const currentRef = useRef<Stroke | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const all = currentRef.current ? [...strokes, currentRef.current] : strokes;
    for (const s of all) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      s.points.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  });

  function getPos(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const r = canvasRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
  }
  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!editable) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    currentRef.current = { color, width: 2.5, points: [getPos(e)] };
    force((n) => n + 1);
  }
  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !currentRef.current) return;
    currentRef.current.points.push(getPos(e));
    force((n) => n + 1);
  }
  function onUp() {
    if (!drawing.current || !currentRef.current) return;
    drawing.current = false;
    const next = [...strokes, currentRef.current];
    currentRef.current = null;
    updateAttributes({ strokes: next });
  }

  return (
    <BlockShell
      icon={Pencil}
      label="Drawing"
      editable={editable}
      onDelete={() => deleteNode()}
      dataType="drawing-block"
      headerExtra={
        editable ? (
          <div className="flex items-center gap-1 rounded-full bg-background/70 px-1.5 py-0.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => updateAttributes({ color: c })}
                className={cn(
                  "h-3.5 w-3.5 rounded-full border transition-transform",
                  color === c && "ring-2 ring-offset-1 ring-primary scale-110",
                )}
                style={{ background: c }}
                aria-label={`Pick color ${c}`}
              />
            ))}
            <Button
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              onClick={() => updateAttributes({ strokes: [] })}
              aria-label="Clear"
            >
              <Eraser className="h-3 w-3" />
            </Button>
          </div>
        ) : null
      }
    >
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className={cn(
          "w-full rounded-md border bg-[radial-gradient(circle,_var(--tw-gradient-from)_1px,_transparent_1px)] from-muted-foreground/15 [background-size:14px_14px]",
          editable ? "cursor-crosshair touch-none" : "",
        )}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      />
    </BlockShell>
  );
}
