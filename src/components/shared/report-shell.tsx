import { type ReactNode } from "react";
import { CalendarRange, FolderKanban, Layers, X, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/shared/utils";

/**
 * Generic report toolbar shared by Finance and Petty Cash hubs.
 *
 * Same visual shape as the original PettyCashReportToolbar (which is now a
 * thin alias). Slots:
 *   - title / subtitle
 *   - rangeBadge / scopeBadge / bookBadge → read-only state badges
 *   - filters → date / scope controls (left)
 *   - extras  → compare / show-tx / book toggles (middle)
 *   - actions → icon-only refresh + export (right, ml-auto)
 *   - helper  → optional helper text below the bar
 */
export interface ReportShellProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  rangeBadge?: ReactNode;
  scopeBadge?: ReactNode;
  bookBadge?: ReactNode;
  filters: ReactNode;
  extras?: ReactNode;
  actions?: ReactNode;
  helper?: ReactNode;
  className?: string;
}

export function ReportShell({
  title,
  subtitle,
  rangeBadge,
  scopeBadge,
  bookBadge,
  filters,
  extras,
  actions,
  helper,
  className,
}: ReportShellProps) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-slate-50/70 dark:bg-muted/30 p-4 space-y-3 sticky top-0 z-10 backdrop-blur",
        className,
      )}
    >
      {(title || subtitle) && (
        <div className="space-y-1">
          {title && <h1 className="text-xl font-bold tracking-tight">{title}</h1>}
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      )}

      {(rangeBadge || scopeBadge || bookBadge) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {rangeBadge && (
            <Badge
              variant="secondary"
              className="h-6 gap-1.5 rounded-full px-2.5 text-[11px] font-medium"
            >
              <CalendarRange className="h-3 w-3 opacity-70" />
              {rangeBadge}
            </Badge>
          )}
          {scopeBadge && (
            <Badge
              variant="outline"
              className="h-6 gap-1.5 rounded-full px-2.5 text-[11px] font-medium"
            >
              <FolderKanban className="h-3 w-3 opacity-70" />
              {scopeBadge}
            </Badge>
          )}
          {bookBadge && (
            <Badge
              variant="outline"
              className="h-6 gap-1.5 rounded-full px-2.5 text-[11px] font-medium"
            >
              <BookOpen className="h-3 w-3 opacity-70" />
              {bookBadge}
            </Badge>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">{filters}</div>
        {extras && (
          <>
            <Separator orientation="vertical" className="h-6 hidden sm:block" />
            <div className="flex flex-wrap items-center gap-1.5">{extras}</div>
          </>
        )}
        {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
      </div>

      {helper && <div className="text-[11px] text-muted-foreground">{helper}</div>}
    </div>
  );
}

/** Chip-style "Compare to prior period" toggle (shared). */
export function CompareChip({
  active,
  onToggle,
  label = "Compare prior",
  className,
}: {
  active: boolean;
  onToggle: (v: boolean) => void;
  label?: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => onToggle(!active)}
      title={active ? "Disable comparison" : "Compare to prior period"}
      aria-label={active ? "Disable comparison" : "Compare to prior period"}
      aria-pressed={active}
      className={cn(
        "h-7 gap-1.5 px-2 text-[11px] shrink-0",
        active && "border-primary/60 bg-primary/5",
        className,
      )}
    >
      <Layers className="h-3 w-3" />
      <span>{label}</span>
      {active && <X className="h-3 w-3 opacity-60" />}
    </Button>
  );
}
