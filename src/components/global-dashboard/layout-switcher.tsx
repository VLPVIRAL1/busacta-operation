import { Columns3, Focus, LayoutPanelLeft, Layers } from "lucide-react";
import { cn } from "@/lib/shared/utils";

export type WorkspaceLayout = "split" | "focus" | "stack" | "rail";

const OPTIONS: { id: WorkspaceLayout; label: string; icon: typeof Columns3 }[] = [
  { id: "split", label: "Split — KPI strip + 3 columns", icon: Columns3 },
  { id: "focus", label: "Focus — collapsible side rails", icon: Focus },
  { id: "stack", label: "Stack — today first, reminders drawer", icon: Layers },
  { id: "rail", label: "Rail — KPI vertical rail (4 cols)", icon: LayoutPanelLeft },
];

export function LayoutSwitcher({
  value,
  onChange,
}: {
  value: WorkspaceLayout;
  onChange: (v: WorkspaceLayout) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm"
      role="tablist"
      aria-label="Layout"
    >
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={o.label}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}
