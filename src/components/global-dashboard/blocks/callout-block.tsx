import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { AlertTriangle, CheckCircle2, Info, Lightbulb, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/shared/utils";

type Variant = "info" | "warning" | "tip" | "success";

const VARIANTS: Record<
  Variant,
  { label: string; icon: LucideIcon; wrap: string; iconColor: string }
> = {
  info: {
    label: "Info",
    icon: Info,
    wrap: "border-sky-500/20 bg-sky-500/10 text-sky-900 dark:text-sky-200",
    iconColor: "text-sky-600 dark:text-sky-400",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    wrap: "border-amber-500/20 bg-amber-500/10 text-amber-900 dark:text-amber-200",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  tip: {
    label: "Tip",
    icon: Lightbulb,
    wrap: "border-violet-500/20 bg-violet-500/10 text-violet-900 dark:text-violet-200",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  success: {
    label: "Success",
    icon: CheckCircle2,
    wrap: "border-emerald-500/20 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
};

/**
 * Callout / alert box — block-level container with a variant
 * (Info / Warning / Tip / Success). Holds arbitrary block content.
 */
export const CalloutBlock = Node.create({
  name: "calloutBlock",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      variant: { default: "info" },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="callout-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "callout-block" }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutView) as any;
  },
});

function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const variant =
    ((node.attrs.variant as Variant) || "info") in VARIANTS
      ? (node.attrs.variant as Variant)
      : "info";
  const cfg = VARIANTS[variant];
  const Icon = cfg.icon;
  const editable = editor.isEditable;

  return (
    <NodeViewWrapper
      data-type="callout-block"
      className={cn("my-3 flex gap-3 rounded-lg border px-3 py-2.5", cfg.wrap)}
    >
      <div contentEditable={false} className="shrink-0 pt-0.5">
        {editable ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn("rounded p-0.5 hover:bg-black/5", cfg.iconColor)}
                aria-label={`Callout type: ${cfg.label}`}
                title={`Callout: ${cfg.label} — click to change`}
              >
                <Icon className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              {(Object.keys(VARIANTS) as Variant[]).map((v) => {
                const VIcon = VARIANTS[v].icon;
                return (
                  <DropdownMenuItem
                    key={v}
                    onSelect={(e) => {
                      e.preventDefault();
                      updateAttributes({ variant: v });
                    }}
                  >
                    <VIcon className={cn("mr-2 h-3.5 w-3.5", VARIANTS[v].iconColor)} />
                    {VARIANTS[v].label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Icon className={cn("h-4 w-4", cfg.iconColor)} />
        )}
      </div>
      <NodeViewContent className="callout-block-content min-w-0 flex-1" />
    </NodeViewWrapper>
  );
}
