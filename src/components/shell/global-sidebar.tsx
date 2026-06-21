import { Fragment } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNav, moduleFromPath, CLIENT_MGMT_KEYS, type ModuleKey } from "@/lib/routing/use-nav";
import { useBranding } from "@/lib/shared/branding";
import { cn } from "@/lib/shared/utils";

export function GlobalSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const activeModule: ModuleKey = moduleFromPath(path);
  const { tier1 } = useNav();
  const branding = useBranding();

  // Indices of the Client Management group within the filtered tier1 list,
  // used to draw a thin separator above/below it (visual grouping in the
  // narrow icon sidebar without redesigning the rail).
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
        className="fixed left-0 top-0 z-30 hidden h-screen w-14 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-3 backdrop-blur-xl md:flex"
        aria-label="Global navigation"
      >
        <Link
          to="/global-dashboard"
          className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold shadow-lg shadow-primary/30"
        >
          {branding.mark || "B1"}
        </Link>
        <div className="my-1 h-px w-8 bg-sidebar-border" />
        {tier1.map((item, idx) => {
          const Icon = item.icon;
          const isActive = item.key === activeModule;
          const showLeadingSeparator = idx === groupStart && groupStart >= 0;
          const showTrailingSeparator = idx === groupEnd && groupEnd >= 0;
          return (
            <Fragment key={item.key}>
              {showLeadingSeparator && (
                <div
                  className="my-1 h-px w-8 bg-sidebar-border/70"
                  role="separator"
                  aria-label="Client Management"
                  title="Client Management"
                />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    to={item.url as never}
                    className={cn(
                      "group relative flex h-10 w-10 items-center justify-center rounded-lg text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                    aria-label={item.title}
                  >
                    <Icon className="h-5 w-5" />
                    {isActive && (
                      <span className="absolute right-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-l-full bg-sidebar-primary" />
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  {CLIENT_MGMT_KEYS.includes(item.key)
                    ? `Client Management · ${item.title}`
                    : item.title}
                </TooltipContent>
              </Tooltip>
              {showTrailingSeparator && (
                <div className="my-1 h-px w-8 bg-sidebar-border/70" role="separator" />
              )}
            </Fragment>
          );
        })}
      </aside>
    </TooltipProvider>
  );
}
