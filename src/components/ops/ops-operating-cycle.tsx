import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  OPS_COLUMNS,
  type OpsColumn,
  type OpsNode,
  type TierColor,
} from "@/lib/ops/operating-cycle-nodes";
import { useAuth } from "@/lib/auth/auth-context";
import { notificationsInboxQuery, myActiveTodoCountQuery } from "@/lib/queries/ops.queries";
import { cn } from "@/lib/shared/utils";

// "The Loop" — a reimagined operating cycle.
//
// The tiers are drawn as stations on a single flowing track that curves back on
// itself, so the *cycle* reads as a cycle (the old grid drew it as a flat line).
// Each station carries its destinations as live tiles, a "you are here"
// highlight tracks the current route, and count badges turn the launcher into a
// light dashboard. Single-destination stations render a taller "feature" tile
// so the row stays balanced.
//
// Keyboard model (simplified from the old roving-tabindex grid):
//  - Tiles are plain links in natural tab order.
//  - Number keys (1–5 stations top row, 6–9/0 bottom row) open the matching
//    tile. The handler is window-level but scoped to /ops and ignores typing
//    targets and modifier combos, so hub-level Alt+digit shortcuts are safe.
//  - Activations announce the destination via an aria-live region.

function buildFlat(columns: OpsColumn[]): OpsNode[] {
  const secondaries = columns.map((c) => c.secondary).filter((n): n is OpsNode => Boolean(n));
  return [...columns.map((c) => c.primary), ...secondaries];
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  const role = t.getAttribute("role");
  if (role === "combobox" || role === "textbox") return true;
  return false;
}

// All class strings are static literals so Tailwind's scanner picks them up.
type TierColorClasses = {
  medallionBg: string;
  medallionText: string;
  medallionRing: string;
  railFrom: string;
  railTo: string;
  dot: string;
  iconBg: string;
  iconText: string;
  iconRing: string;
  iconGroupHover: string;
  hoverBorder: string;
  focusRing: string;
  activeBorder: string;
  activeBg: string;
  activeGlow: string;
  badgeBg: string;
  labelColor: string;
};

const TIER_COLORS: Record<TierColor, TierColorClasses> = {
  slate: {
    medallionBg: "bg-slate-500",
    medallionText: "text-white",
    medallionRing: "ring-slate-500/30",
    railFrom: "from-slate-400/70",
    railTo: "to-violet-400/70",
    dot: "bg-slate-400",
    iconBg: "bg-slate-500/10",
    iconText: "text-slate-600 dark:text-slate-400",
    iconRing: "ring-slate-500/20",
    iconGroupHover: "group-hover:bg-slate-500/15",
    hoverBorder: "hover:border-slate-400",
    focusRing: "focus-visible:ring-slate-500",
    activeBorder: "border-slate-400",
    activeBg: "bg-slate-50/80 dark:bg-slate-900/40",
    activeGlow: "shadow-[0_0_0_3px_rgba(100,116,139,0.12)]",
    badgeBg: "bg-slate-500",
    labelColor: "text-slate-500 dark:text-slate-400",
  },
  violet: {
    medallionBg: "bg-violet-500",
    medallionText: "text-white",
    medallionRing: "ring-violet-500/30",
    railFrom: "from-violet-400/70",
    railTo: "to-amber-400/70",
    dot: "bg-violet-400",
    iconBg: "bg-violet-500/10",
    iconText: "text-violet-600 dark:text-violet-400",
    iconRing: "ring-violet-500/20",
    iconGroupHover: "group-hover:bg-violet-500/15",
    hoverBorder: "hover:border-violet-400",
    focusRing: "focus-visible:ring-violet-500",
    activeBorder: "border-violet-400",
    activeBg: "bg-violet-50/80 dark:bg-violet-950/40",
    activeGlow: "shadow-[0_0_0_3px_rgba(139,92,246,0.14)]",
    badgeBg: "bg-violet-500",
    labelColor: "text-violet-600 dark:text-violet-400",
  },
  amber: {
    medallionBg: "bg-amber-500",
    medallionText: "text-white",
    medallionRing: "ring-amber-500/30",
    railFrom: "from-amber-400/70",
    railTo: "to-emerald-400/70",
    dot: "bg-amber-400",
    iconBg: "bg-amber-500/10",
    iconText: "text-amber-600 dark:text-amber-400",
    iconRing: "ring-amber-500/20",
    iconGroupHover: "group-hover:bg-amber-500/15",
    hoverBorder: "hover:border-amber-400",
    focusRing: "focus-visible:ring-amber-500",
    activeBorder: "border-amber-400",
    activeBg: "bg-amber-50/80 dark:bg-amber-950/40",
    activeGlow: "shadow-[0_0_0_3px_rgba(245,158,11,0.14)]",
    badgeBg: "bg-amber-500",
    labelColor: "text-amber-600 dark:text-amber-400",
  },
  emerald: {
    medallionBg: "bg-emerald-500",
    medallionText: "text-white",
    medallionRing: "ring-emerald-500/30",
    railFrom: "from-emerald-400/70",
    railTo: "to-blue-400/70",
    dot: "bg-emerald-400",
    iconBg: "bg-emerald-500/10",
    iconText: "text-emerald-600 dark:text-emerald-400",
    iconRing: "ring-emerald-500/20",
    iconGroupHover: "group-hover:bg-emerald-500/15",
    hoverBorder: "hover:border-emerald-400",
    focusRing: "focus-visible:ring-emerald-500",
    activeBorder: "border-emerald-400",
    activeBg: "bg-emerald-50/80 dark:bg-emerald-950/40",
    activeGlow: "shadow-[0_0_0_3px_rgba(16,185,129,0.14)]",
    badgeBg: "bg-emerald-500",
    labelColor: "text-emerald-600 dark:text-emerald-400",
  },
  blue: {
    medallionBg: "bg-blue-500",
    medallionText: "text-white",
    medallionRing: "ring-blue-500/30",
    railFrom: "from-blue-400/70",
    railTo: "to-blue-400/70",
    dot: "bg-blue-400",
    iconBg: "bg-blue-500/10",
    iconText: "text-blue-600 dark:text-blue-400",
    iconRing: "ring-blue-500/20",
    iconGroupHover: "group-hover:bg-blue-500/15",
    hoverBorder: "hover:border-blue-400",
    focusRing: "focus-visible:ring-blue-500",
    activeBorder: "border-blue-400",
    activeBg: "bg-blue-50/80 dark:bg-blue-950/40",
    activeGlow: "shadow-[0_0_0_3px_rgba(59,130,246,0.14)]",
    badgeBg: "bg-blue-500",
    labelColor: "text-blue-600 dark:text-blue-400",
  },
};

type NodeTileProps = {
  node: OpsNode;
  tierLabel: string;
  colors: TierColorClasses;
  isActive: boolean;
  badge: number;
  onActivate: () => void;
  // A station with no secondary renders its single destination as a taller
  // "feature" tile that fills the column height and shows its description
  // inline, so the row stays visually balanced with the two-tile stations.
  featured?: boolean;
};

function NodeTile({
  node,
  tierLabel,
  colors,
  isActive,
  badge,
  onActivate,
  featured = false,
}: NodeTileProps) {
  const { Icon } = node;
  const descId = useId();
  const badgeLabel = badge > 0 ? `. ${badge} item${badge === 1 ? "" : "s"} need attention` : "";

  const cornerBadge =
    badge > 0 ? (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white",
          colors.badgeBg,
        )}
      >
        {badge > 99 ? "99+" : badge}
      </span>
    ) : (
      <kbd
        aria-hidden="true"
        className="hidden h-4 min-w-4 items-center justify-center rounded border border-slate-300/70 bg-slate-50 px-1 font-mono text-[10px] font-semibold text-slate-500 shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:inline-flex dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-400"
      >
        {node.shortcut}
      </kbd>
    );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={node.to as never}
          data-ops-shortcut={node.shortcut}
          onClick={onActivate}
          aria-label={`${node.title} — ${tierLabel}. Shortcut ${node.shortcut}${badgeLabel}`}
          aria-describedby={descId}
          aria-current={isActive ? "page" : undefined}
          className={cn(
            "group relative rounded-lg border backdrop-blur-sm transition hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            featured ? "flex h-full flex-col gap-2 p-3" : "flex items-center gap-2 p-2.5",
            isActive
              ? cn(colors.activeBorder, colors.activeBg, colors.activeGlow)
              : "border-slate-200/60 bg-white/50 dark:border-slate-800/60 dark:bg-slate-950/40",
            colors.hoverBorder,
            colors.focusRing,
          )}
        >
          <div className={cn("flex items-center gap-2", featured && "w-full")}>
            <span
              className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-md ring-1 transition-colors",
                featured ? "h-8 w-8" : "h-7 w-7",
                colors.iconBg,
                colors.iconText,
                colors.iconRing,
                colors.iconGroupHover,
              )}
            >
              <Icon className={featured ? "h-4.5 w-4.5" : "h-4 w-4"} aria-hidden="true" />
            </span>
            <span
              className={cn(
                "truncate font-semibold text-slate-900 dark:text-slate-100",
                featured ? "text-sm" : "text-xs",
              )}
            >
              {node.title}
            </span>
            <span className="ml-auto">{cornerBadge}</span>
          </div>
          {featured ? (
            <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              {node.desc}
            </p>
          ) : null}
          <span id={descId} className="sr-only">
            {node.desc} Press {node.shortcut} on the Ops dashboard to open.
          </span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[220px] text-xs">
        <span className="block">{node.desc}</span>
        <span className="mt-1 block text-[10px] opacity-70">Shortcut: {node.shortcut}</span>
        {badge > 0 && (
          <span className="mt-0.5 block text-[10px] font-semibold">
            {badge} item{badge === 1 ? "" : "s"} waiting
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function OpsOperatingCycle() {
  const navigate = useNavigate();
  const location = useLocation();
  const flat = useMemo(() => buildFlat(OPS_COLUMNS), []);
  const [announcement, setAnnouncement] = useState("");
  const announceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { user } = useAuth();
  const { data: notifications = [] } = useQuery({
    ...notificationsInboxQuery(user?.id ?? ""),
    enabled: !!user?.id,
  });
  const { data: activeTodoCount = 0 } = useQuery(myActiveTodoCountQuery(user?.id));

  const unreadNotifCount = useMemo(
    () => notifications.filter((n) => !n.read_at).length,
    [notifications],
  );

  const getBadge = useCallback(
    (node: OpsNode): number => {
      if (node.to === "/ops/notifications") return unreadNotifCount;
      if (node.to === "/ops/todos") return activeTodoCount;
      return 0;
    },
    [unreadNotifCount, activeTodoCount],
  );

  const isNodeActive = useCallback(
    (node: OpsNode): boolean =>
      location.pathname === node.to || location.pathname.startsWith(`${node.to}/`),
    [location.pathname],
  );

  // The station the user is currently "in", if any — drives the pulsing medallion.
  const activeColumnIdx = useMemo(() => {
    const idx = OPS_COLUMNS.findIndex(
      (c) => isNodeActive(c.primary) || (c.secondary != null && isNodeActive(c.secondary)),
    );
    return idx;
  }, [isNodeActive]);

  const announce = useCallback((node: OpsNode, tierLabel: string) => {
    setAnnouncement(""); // reset so repeats still re-announce
    requestAnimationFrame(() => setAnnouncement(`Opening ${node.title} — ${tierLabel}`));
    if (announceTimer.current) clearTimeout(announceTimer.current);
    announceTimer.current = setTimeout(() => setAnnouncement(""), 2000);
  }, []);

  useEffect(
    () => () => {
      if (announceTimer.current) clearTimeout(announceTimer.current);
    },
    [],
  );

  const tierLabelFor = useCallback((node: OpsNode) => {
    const col = OPS_COLUMNS.find((c) => c.primary === node || c.secondary === node);
    return col?.label ?? "";
  }, []);

  // Global number-key shortcuts, active only on /ops, only without modifiers,
  // and only when the user isn't typing. Registered with capture so descendant
  // components that stopPropagation on keydown can't swallow it.
  useEffect(() => {
    if (!location.pathname.startsWith("/ops")) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.isComposing || e.key === "Dead") return;
      if (isTypingTarget(e.target)) return;
      let digit: string | null = /^[0-9]$/.test(e.key) ? e.key : null;
      if (!digit) {
        const m = /^Digit([0-9])$/.exec(e.code);
        if (m) digit = m[1];
      }
      if (!digit) return;
      const node = flat.find((n) => n.shortcut === digit);
      if (!node) return;
      e.preventDefault();
      announce(node, tierLabelFor(node));
      requestAnimationFrame(() => navigate({ to: node.to as never }));
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [location.pathname, flat, navigate, announce, tierLabelFor]);

  return (
    <TooltipProvider delayDuration={150}>
      <Card
        className="relative overflow-hidden border-blue-500/20 bg-card/70 shadow-sm backdrop-blur-xl"
        aria-labelledby="operating-cycle-title"
        aria-describedby="operating-cycle-help"
      >
        {/* Local keyframes for the flowing track dots. */}
        <style>{`@keyframes ops-flow{0%{transform:translateX(-120%)}100%{transform:translateX(2200%)}}@media (prefers-reduced-motion:reduce){.ops-flow-dot{animation:none!important;opacity:0}}`}</style>

        <div className="flex items-baseline justify-between gap-3 border-b border-slate-200/60 px-4 py-2 dark:border-slate-800/60">
          <div>
            <h2
              id="operating-cycle-title"
              className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100"
            >
              Operating cycle
            </h2>
            <p id="operating-cycle-help" className="text-[11px] text-slate-500 dark:text-slate-400">
              Five stations along the daily loop. Press{" "}
              <kbd className="rounded border px-1 font-mono text-[10px]">1</kbd>–
              <kbd className="rounded border px-1 font-mono text-[10px]">5</kbd> (top) or{" "}
              <kbd className="rounded border px-1 font-mono text-[10px]">6</kbd>–
              <kbd className="rounded border px-1 font-mono text-[10px]">9</kbd>,{" "}
              <kbd className="rounded border px-1 font-mono text-[10px]">0</kbd> (bottom) to open.
            </p>
          </div>
          <span className="hidden items-center gap-1 rounded-full border border-slate-200/70 bg-slate-50/60 px-2 py-0.5 text-[10px] font-medium text-slate-500 sm:inline-flex dark:border-slate-700/70 dark:bg-slate-900/40 dark:text-slate-400">
            <RotateCw className="h-3 w-3" aria-hidden="true" />
            Repeats daily
          </span>
        </div>

        <div className="grid grid-cols-1 gap-x-3 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-5">
          {OPS_COLUMNS.map((col, c) => {
            const colors = TIER_COLORS[col.color];
            const isLast = c === OPS_COLUMNS.length - 1;
            const stationActive = activeColumnIdx === c;
            return (
              <div key={col.idx} className="relative flex flex-col">
                {/* Station header: medallion + connecting rail to the next station. */}
                <div className="mb-2.5 flex items-center gap-2">
                  <span
                    className={cn(
                      "relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2 transition",
                      colors.medallionBg,
                      colors.medallionText,
                      colors.medallionRing,
                      stationActive && "scale-110",
                    )}
                  >
                    {col.idx}
                    {stationActive && (
                      <span
                        aria-hidden="true"
                        className={cn(
                          "absolute inset-0 animate-ping rounded-full opacity-40",
                          colors.medallionBg,
                        )}
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      "truncate text-[10px] font-bold uppercase tracking-wider",
                      colors.labelColor,
                    )}
                  >
                    {col.label.replace(/^\d+\.\s*/, "")}
                  </span>
                </div>

                {/* Animated connecting rail to the next station (lg only). */}
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-[calc(100%-0.375rem)] top-[0.875rem] z-10 hidden h-px w-[calc(0.75rem+0.75rem)] -translate-y-1/2 overflow-hidden lg:block"
                  >
                    <span
                      className={cn(
                        "absolute inset-0 bg-gradient-to-r",
                        colors.railFrom,
                        colors.railTo,
                      )}
                    />
                    <span
                      className={cn(
                        "ops-flow-dot absolute top-1/2 h-1 w-1 -translate-y-1/2 rounded-full",
                        colors.dot,
                      )}
                      style={{
                        animation: "ops-flow 2.4s linear infinite",
                        animationDelay: `${c * 0.45}s`,
                      }}
                    />
                  </span>
                )}

                <div className="flex flex-1 flex-col gap-2">
                  <NodeTile
                    node={col.primary}
                    tierLabel={col.label}
                    colors={colors}
                    isActive={isNodeActive(col.primary)}
                    badge={getBadge(col.primary)}
                    onActivate={() => announce(col.primary, col.label)}
                    featured={!col.secondary}
                  />
                  {col.secondary ? (
                    <NodeTile
                      node={col.secondary}
                      tierLabel={col.label}
                      colors={colors}
                      isActive={isNodeActive(col.secondary)}
                      badge={getBadge(col.secondary)}
                      onActivate={() => announce(col.secondary!, col.label)}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {/* Return rail — closes the loop from Intelligence back to Setup. */}
        <div className="hidden items-center gap-2 border-t border-dashed border-slate-200/70 px-4 py-1.5 lg:flex dark:border-slate-800/70">
          <span className="h-px flex-1 bg-gradient-to-r from-blue-400/50 to-slate-400/50" />
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
            <RotateCw className="h-3 w-3" aria-hidden="true" />
            Cycle repeats — back to Setup
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-slate-400/50 to-blue-400/50" />
        </div>

        {/* Visually hidden announcement for screen readers. */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>
      </Card>
    </TooltipProvider>
  );
}
