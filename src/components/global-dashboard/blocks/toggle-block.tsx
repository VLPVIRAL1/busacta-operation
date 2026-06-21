import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/shared/utils";

/**
 * Toggle / collapsible section. Click the chevron to expand/collapse;
 * the summary line is editable inline, and the body holds arbitrary blocks.
 */
export const ToggleBlock = Node.create({
  name: "toggleBlock",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  addAttributes() {
    return {
      open: { default: true },
      summary: { default: "Toggle" },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="toggle-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "toggle-block" }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ToggleView) as any;
  },
});

function ToggleView({ node, updateAttributes, editor }: NodeViewProps) {
  const open = node.attrs.open !== false;
  const summary = (node.attrs.summary as string) ?? "Toggle";
  const editable = editor.isEditable;

  return (
    <NodeViewWrapper
      data-type="toggle-block"
      className="my-2 rounded-md border border-border/60 bg-card/40"
    >
      <div className="flex items-start gap-1.5 px-2 py-1.5">
        <button
          type="button"
          contentEditable={false}
          onClick={() => updateAttributes({ open: !open })}
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        </button>
        {editable ? (
          <input
            type="text"
            value={summary}
            onChange={(e) => updateAttributes({ summary: e.target.value })}
            placeholder="Toggle title"
            className="flex-1 border-0 bg-transparent px-0 py-0.5 text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
          />
        ) : (
          <span className="flex-1 py-0.5 text-sm font-medium">{summary}</span>
        )}
      </div>
      <div className={cn("border-t border-border/40 px-3 py-2 pl-9", !open && "hidden")}>
        <NodeViewContent className="toggle-block-content" />
      </div>
    </NodeViewWrapper>
  );
}
