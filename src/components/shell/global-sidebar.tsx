import { Fragment, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNav, moduleFromPath, CLIENT_MGMT_KEYS, type ModuleKey } from "@/lib/routing/use-nav";
import { useBranding } from "@/lib/shared/branding";
import { useSidebarCollapsed } from "@/lib/shell/sidebar-collapse";
import { cn } from "@/lib/shared/utils";

export function GlobalSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const activeModule: ModuleKey = moduleFromPath(path);
  const { tier1 } = useNav();
  const branding = useBranding();
  const { collapsed, toggle } = useSidebarCollapsed();

  // Hover-to-peek: when the rail is *pinned* collapsed, hovering with a mouse
  // temporarily expands it without mutating the pinned state. The pinned width
  // (`--rail-w`, set by the provider) is left untouched so page content never
  // reflows — the expanded rail simply overlays the canvas.
  const [peeking, setPeeking] = useState(false);
  const expanded = !collapsed || peeking;

  // Indices of the Client Management group within the filtered tier1 list,
  // used to draw a separator (collapsed) or a text heading (expanded) above the
  // group for clear visual grouping in the rail.
  const groupStart = tier1.findIndex((i) => CLIENT_MGMT_KEYS.includes(i.key));
  const groupEnd = (() => {
    if (groupStart < 0) return -1;
    let end = groupStart;
    for (let i = groupStart + 1; i < tier1.length; i++) {
      if (CLIENT_MGMT_KEYS.includes(tier1[i].key) && i === end + 1) end = i;
      else break;
    }
    return end;
  })();

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        // Only react to mouse hovers (not touch) so the peek never fires on
        // tap-scroll on coarse-pointer devices.
        onPointerEnter={(e) => {
          if (collapsed && e.pointerType === "mouse") setPeeking(true);
        }}
        onPointerLeave={() => setPeeking(false)}
        className={cn(
          "fixed left-0 top-0 z-[60] hidden h-screen flex-col gap-1 border-r border-sidebar-border bg-sidebar py-3 backdrop-blur-xl transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex",
          expanded ? "w-64 items-stretch px-2" : "w-14 items-center",
          // When peeking over the canvas, lift the rail so it reads as an overlay.
          collapsed && peeking && "shadow-2xl",
        )}
        aria-label="Global navigation"
      >
        {/* Slim collapse toggle pinned to the rail's right edge. Reflects the
            pinned state (not the transient peek). */}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-1/2 z-[61] flex h-11 w-5 -translate-y-1/2 items-center justify-center rounded-md border border-sidebar-border bg-sidebar text-sidebar-foreground/70 shadow-[var(--shadow-elegant)] transition-colors hover:text-sidebar-foreground"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>

        <Link
          to="/global-dashboard"
          className={cn(
            "mb-2 flex h-9 items-center rounded-md bg-primary text-primary-foreground text-xs font-bold shadow-lg shadow-primary/30",
            expanded ? "w-full gap-2 px-3" : "w-9 justify-center",
          )}
        >
          <span className="shrink-0">{branding.mark || "B1"}</span>
          {expanded && (
            <span className="truncate text-sm font-semibold">{branding.name || "BusAcTa"}</span>
          )}
        </Link>
        <div className={cn("my-1 h-px bg-sidebar-border", expanded ? "w-full" : "w-8")} />
        {tier1.map((item, idx) => {
          const Icon = item.icon;
          const isActive = item.key === activeModule;
          const showLeadingSeparator = idx === groupStart && groupStart >= 0;
          const showTrailingSeparator = idx === groupEnd && groupEnd >= 0;
          const link = (
            <Link
              to={item.url as never}
              className={cn(
                "group relative flex items-center rounded-lg text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                expanded ? "h-10 w-full gap-3 px-3" : "h-10 w-10 justify-center",
                isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
              aria-label={item.title}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {expanded && <span className="truncate text-sm font-medium">{item.title}</span>}
              {isActive && (
                <span className="absolute right-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-l-full bg-sidebar-primary" />
              )}
            </Link>
          );
          return (
            <Fragment key={item.key}>
              {showLeadingSeparator &&
                (expanded ? (
                  <div
                    className="mb-1 mt-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45"
                    role="separator"
                    aria-label="Client Management"
                  >
                    Client Management
                  </div>
                ) : (
                  <div
                    className="my-1 h-px w-8 bg-sidebar-border/70"
                    role="separator"
                    aria-label="Client Management"
                    title="Client Management"
                  />
                ))}
              {expanded ? (
                link
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {CLIENT_MGMT_KEYS.includes(item.key)
                      ? `Client Management · ${item.title}`
                      : item.title}
                  </TooltipContent>
                </Tooltip>
              )}
              {showTrailingSeparator && (
                <div
                  className={cn("my-1 h-px bg-sidebar-border/70", expanded ? "w-full" : "w-8")}
                  role="separator"
                />
              )}
            </Fragment>
          );
        })}
      </aside>
    </TooltipProvider>
  );
}
