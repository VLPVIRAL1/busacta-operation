import { MoreHorizontal, Trash2, type LucideIcon } from "lucide-react";
import { NodeViewWrapper } from "@tiptap/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/shared/utils";

type Props = {
  icon: LucideIcon;
  label: string;
  editable: boolean;
  onDelete: () => void;
  dataType: string;
  children: React.ReactNode;
  /** Optional trailing element rendered in the header (right of label, left of menu) */
  headerExtra?: React.ReactNode;
  className?: string;
};

/**
 * MS Loop-style shared chrome for embedded block components.
 * Provides drag handle, icon + label header, kebab menu (Delete).
 */
export function BlockShell({
  icon: Icon,
  label,
  editable,
  onDelete,
  dataType,
  children,
  headerExtra,
  className,
}: Props) {
  return (
    <NodeViewWrapper
      data-type={dataType}
      className={cn(
        "group/loop relative my-3 rounded-xl border bg-card shadow-sm transition-all",
        "hover:shadow-md focus-within:ring-2 focus-within:ring-primary/30",
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {headerExtra}
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover/loop:opacity-100"
                aria-label="Block menu"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onDelete();
                }}
                className="text-rose-600 focus:text-rose-600"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete block
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <div className="p-3">{children}</div>
    </NodeViewWrapper>
  );
}
