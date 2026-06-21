/**
 * Shared icon glyphs for Task Priority + Task Complexity option lists.
 *
 * Priority and Complexity look very similar as plain text. We render
 * compact lucide glyphs with tooltips instead of the textual label in
 * every display surface (table cell, badge, Select trigger, group-by
 * header). Dropdown items keep label + icon so users can read the
 * choices before picking one.
 */
import {
  ArrowDown,
  ArrowUp,
  Equal,
  Mountain,
  Hexagon,
  Circle,
  Feather,
  Brain,
  Puzzle,
  Layers,
  Network,
  Gauge,
  Sigma,
  Turtle,
  Clock,
  Zap,
  Flame,
  AlarmClock,
  Timer,
  Bell,
  Siren,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Icon glyphs for project-configured Difficulty / Urgency levels. The level's
 * `icon` column stores one of these keys (set in Project Settings → Task Type).
 * Mirrors the registry used by the settings editor so glyphs render identically.
 */
export const LEVEL_ICON_REGISTRY: Record<string, LucideIcon> = {
  feather: Feather,
  brain: Brain,
  puzzle: Puzzle,
  layers: Layers,
  network: Network,
  gauge: Gauge,
  sigma: Sigma,
  turtle: Turtle,
  clock: Clock,
  zap: Zap,
  flame: Flame,
  alarm: AlarmClock,
  timer: Timer,
  bell: Bell,
  siren: Siren,
};

/** Render a configured level's icon by key; falls back to rendering the raw string (e.g. an emoji). */
export function LevelGlyph({ name, className }: { name?: string | null; className?: string }) {
  if (!name) return null;
  const Icon = LEVEL_ICON_REGISTRY[name];
  if (Icon) return <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} aria-hidden />;
  return <span className={cn("text-sm leading-none", className)}>{name}</span>;
}

export const PRIORITY_ICONS: Record<
  string,
  { Icon: LucideIcon; toneClass: string; label: string }
> = {
  low: { Icon: ArrowDown, toneClass: "text-muted-foreground", label: "Low" },
  medium: { Icon: Equal, toneClass: "text-blue-600 dark:text-blue-300", label: "Medium" },
  high: { Icon: ArrowUp, toneClass: "text-rose-600 dark:text-rose-300", label: "High" },
};

export const COMPLEXITY_ICONS: Record<
  string,
  { Icon: LucideIcon; toneClass: string; label: string }
> = {
  a_hard: { Icon: Mountain, toneClass: "text-rose-600 dark:text-rose-300", label: "A — Hard" },
  b_medium: { Icon: Hexagon, toneClass: "text-amber-600 dark:text-amber-300", label: "B — Medium" },
  c_easy: { Icon: Circle, toneClass: "text-emerald-600 dark:text-emerald-300", label: "C — Easy" },
};

export function priorityLabel(value: string | null | undefined): string {
  return value ? (PRIORITY_ICONS[value]?.label ?? value) : "—";
}
export function complexityLabel(value: string | null | undefined): string {
  return value ? (COMPLEXITY_ICONS[value]?.label ?? value) : "—";
}

export function PriorityIcon({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  if (!value) return null;
  const entry = PRIORITY_ICONS[value];
  if (!entry) return null;
  const { Icon, toneClass } = entry;
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", toneClass, className)} aria-hidden />;
}

export function ComplexityIcon({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  if (!value) return null;
  const entry = COMPLEXITY_ICONS[value];
  if (!entry) return null;
  const { Icon, toneClass } = entry;
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", toneClass, className)} aria-hidden />;
}

function IconBadge({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          title={label}
          className={cn(
            "inline-flex items-center justify-center align-middle",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm",
            className,
          )}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Icon-only Priority display with tooltip + aria-label. Falls back to "—". */
export function PriorityBadge({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const label = priorityLabel(value);
  if (!value || !PRIORITY_ICONS[value]) {
    return (
      <span className={cn("text-muted-foreground", className)} aria-label={label} title={label}>
        —
      </span>
    );
  }
  return (
    <IconBadge label={label} className={className}>
      <PriorityIcon value={value} />
    </IconBadge>
  );
}

/** Icon-only Complexity display with tooltip + aria-label. Falls back to "—". */
export function ComplexityBadge({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  const label = complexityLabel(value);
  if (!value || !COMPLEXITY_ICONS[value]) {
    return (
      <span className={cn("text-muted-foreground", className)} aria-label={label} title={label}>
        —
      </span>
    );
  }
  return (
    <IconBadge label={label} className={className}>
      <ComplexityIcon value={value} />
    </IconBadge>
  );
}
