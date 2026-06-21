/**
 * AssigneeStack — DRY primitive for clustered avatar lists.
 *
 * Extracted byte-for-byte from the existing inline stacks in the former
 * /ops/projects list (md), `projects-list-pane.tsx` (sm), and
 * `firms.index.tsx` (lg). Each preset preserves its source pixel sizing
 * — do not change visual defaults without an explicit ticket.
 *
 * Pure presentational. No data fetching, no mutations.
 */
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/shared/utils";

export type AssigneePerson = {
  id: string;
  name: string;
  avatar_url?: string | null;
};

type Size = "sm" | "md" | "lg";

const SIZE_STYLES: Record<
  Size,
  {
    avatar: string;
    overflow: string;
    ring: string;
    spacing: string;
    text: string;
  }
> = {
  // matches src/components/ops/projects/projects-list-pane.tsx
  sm: {
    avatar: "h-5 w-5",
    overflow: "h-5 min-w-[20px] px-1",
    ring: "ring-2 ring-background",
    spacing: "-space-x-1.5",
    text: "text-[9px]",
  },
  // matches the former /ops/projects list
  md: {
    avatar: "h-6 w-6",
    overflow: "h-6 min-w-[24px] px-1.5",
    ring: "ring-2 ring-background",
    spacing: "-space-x-2",
    text: "text-[10px]",
  },
  // matches src/routes/ops/firms.index.tsx
  lg: {
    avatar: "h-7 w-7",
    overflow: "h-7 w-7",
    ring: "border-2 border-background",
    spacing: "-space-x-2",
    text: "text-[10px]",
  },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function AssigneeStack({
  people,
  max = 4,
  size = "md",
  emptyLabel,
  showTooltips = true,
  className,
}: {
  people: AssigneePerson[];
  max?: number;
  size?: Size;
  /** Text rendered when `people` is empty. Omit to render nothing. */
  emptyLabel?: string;
  /** lg preset uses native `title` (matches firms.index.tsx); sm/md use Tooltip. */
  showTooltips?: boolean;
  className?: string;
}) {
  const styles = SIZE_STYLES[size];

  if (people.length === 0) {
    if (!emptyLabel) return null;
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  }

  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;
  const useTooltipProvider = showTooltips && size !== "lg";

  const inner = (
    <div className={cn("flex items-center", styles.spacing, className)}>
      {shown.map((p) => {
        const avatar = (
          <Avatar
            className={cn(styles.avatar, styles.ring)}
            title={!useTooltipProvider ? p.name : undefined}
          >
            {p.avatar_url ? <AvatarImage src={p.avatar_url} alt={p.name} /> : null}
            <AvatarFallback className={styles.text}>{initials(p.name)}</AvatarFallback>
          </Avatar>
        );
        if (!useTooltipProvider) return <span key={p.id}>{avatar}</span>;
        return (
          <Tooltip key={p.id}>
            <TooltipTrigger asChild>{avatar}</TooltipTrigger>
            <TooltipContent>{p.name}</TooltipContent>
          </Tooltip>
        );
      })}
      {overflow > 0 && (
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-muted font-medium",
            styles.overflow,
            styles.ring,
            styles.text,
          )}
        >
          +{overflow}
        </div>
      )}
    </div>
  );

  if (!useTooltipProvider) return inner;
  return <TooltipProvider delayDuration={150}>{inner}</TooltipProvider>;
}
