import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { BarChart3 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { BlockShell } from "./block-shell";

/** Progress tracker — label + 0-100 value, animated bar fill. */
export const ProgressBlock = Node.create({
  name: "progressBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      label: { default: "Progress" },
      value: { default: 25 },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="progress-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "progress-block" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ProgressView) as any;
  },
});

function ProgressView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const label = (node.attrs.label as string) ?? "Progress";
  const value = Math.max(0, Math.min(100, Number(node.attrs.value ?? 0)));
  const editable = editor.isEditable;
  return (
    <BlockShell
      icon={BarChart3}
      label="Progress tracker"
      editable={editable}
      onDelete={() => deleteNode()}
      dataType="progress-block"
      headerExtra={
        <span className="tabular-nums rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
          {value}%
        </span>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {editable ? (
            <Input
              value={label}
              onChange={(e) => updateAttributes({ label: e.target.value })}
              placeholder="What are you tracking?"
              className="h-7 flex-1 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0"
            />
          ) : (
            <span className="flex-1 text-sm font-medium">{label}</span>
          )}
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-[width] duration-500 ease-out"
            style={{ width: `${value}%` }}
          />
        </div>
        {editable && (
          <Slider
            value={[value]}
            min={0}
            max={100}
            step={1}
            onValueChange={(v) => updateAttributes({ value: v[0] })}
          />
        )}
      </div>
    </BlockShell>
  );
}
