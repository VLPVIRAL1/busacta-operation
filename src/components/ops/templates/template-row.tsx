import { type ComponentProps } from "react";
import { GripVertical, Copy, Trash2, Pencil } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/shared/utils";
import type { WorkflowTemplate as Template } from "@/lib/queries/ops.queries";
import { CATEGORY_META } from "./category-meta";

function RowActionBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-6 w-6"
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

// Card-style row mirroring the original ops/templates list (and client-row.tsx).
export function TemplateRow({
  template,
  slNo,
  itemCount,
  isSelected,
  canEdit,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  template: Template;
  slNo: number;
  itemCount: number;
  isSelected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const meta = CATEGORY_META[template.category] ?? CATEGORY_META.workflow;
  const Icon = meta.icon;
  const showCount = template.category !== "email";

  const card = (
    <div
      className={cn(
        "group relative rounded-md border-l-2 mx-2 my-0.5 transition-colors",
        "border-y border-r border-transparent",
        isSelected
          ? "bg-primary/10 border-l-primary border-y-primary/30 border-r-primary/30"
          : cn(meta.accent, "hover:bg-primary/5"),
      )}
    >
      <button type="button" onClick={onSelect} className="w-full text-left pl-2 pr-[5.5rem] py-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              isSelected ? "text-primary" : "text-muted-foreground",
            )}
          />
          <span className="text-[10px] font-mono text-muted-foreground shrink-0 tabular-nums">
            {slNo}.
          </span>
          <span className="text-xs font-medium truncate flex-1">{template.name}</span>
          {template.template && (
            <Badge
              variant="outline"
              className="text-[9px] font-mono px-1 py-0 shrink-0 hidden sm:inline-flex"
            >
              {template.template}
            </Badge>
          )}
          {showCount ? (
            <Badge
              variant={isSelected ? "default" : "secondary"}
              className="shrink-0 text-[10px] px-1.5 py-0 tabular-nums min-w-[1.4rem] text-center"
            >
              {itemCount}
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 text-[9px] px-1 py-0">
              {meta.short}
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5 ml-5">
          {template.description || <span className="italic opacity-60">No description</span>}
        </p>
      </button>

      {canEdit && (
        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity bg-background/90 backdrop-blur-sm rounded-sm">
          <RowActionBtn
            title="Duplicate"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
          >
            <Copy className="h-3 w-3" />
          </RowActionBtn>
          <RowActionBtn
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </RowActionBtn>
        </div>
      )}
    </div>
  );

  if (!canEdit) return card;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 mr-2" /> Edit template
        </ContextMenuItem>
        <ContextMenuItem onClick={onDuplicate}>
          <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function SortableTemplateRow(props: ComponentProps<typeof TemplateRow>) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id: props.template.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group/sortable relative", isDragging && "opacity-50")}
    >
      {props.canEdit && (
        <button
          type="button"
          className="absolute left-0.5 top-1/2 -translate-y-1/2 z-10 cursor-grab active:cursor-grabbing text-muted-foreground opacity-0 group-hover/sortable:opacity-40 hover:!opacity-80 p-0.5 rounded transition-opacity"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3 w-3" />
        </button>
      )}
      <TemplateRow {...props} />
    </div>
  );
}
