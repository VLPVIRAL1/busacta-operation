import { Link, useRouterState } from "@tanstack/react-router";
import * as NavigationMenuPrimitive from "@radix-ui/react-navigation-menu";
import { ChevronDown, Lock } from "lucide-react";
import { useNav, moduleFromPath } from "@/lib/routing/use-nav";
import { formatRoles } from "@/lib/routing/route-access";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/shared/utils";

/**
 * Smart module nav:
 *  - 0 groups → render nothing.
 *  - 1 group → flat tab bar (no dropdown).
 *  - 2+ groups → mega-menu dropdowns anchored under each trigger.
 *
 * NOTE: We use Radix NavigationMenu *without* the built-in Viewport so each
 * NavigationMenuContent renders inside its own NavigationMenuItem and is
 * absolutely positioned right below the trigger that opened it (instead of
 * being centered under the whole nav, which made it appear far to the left).
 */
export function ModuleMegaMenu() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const activeModule = moduleFromPath(path);
  const { tier2For } = useNav();
  const groups = tier2For(activeModule);

  if (groups.length === 0) return null;

  const isLinkActive = (url: string) => path === url || path.startsWith(url + "/");

  // Single-group hubs render as a flat scrollable tab bar.
  if (groups.length === 1) {
    const group = groups[0];
    return (
      <nav
        className="sticky top-14 z-50 border-b border-border-subtle glass px-4"
        aria-label="Module navigation"
      >
        <TooltipProvider delayDuration={150}>
          <div className="flex h-11 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {group.links.map((link) => {
              const Icon = link.icon;
              const active = isLinkActive(link.url);
              const node = (
                <Link
                  key={link.url}
                  to={link.url as never}
                  title={link.title}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground max-w-[14rem]",
                    active && "bg-primary/10 text-primary",
                    link.restricted && "opacity-60 pointer-events-none",
                  )}
                  aria-disabled={link.restricted || undefined}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{link.title}</span>
                  {link.restricted && <Lock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />}
                </Link>
              );
              if (!link.restricted) return node;
              return (
                <Tooltip key={link.url}>
                  <TooltipTrigger asChild>
                    <span>{node}</span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    Requires {formatRoles(link.requiredRoles ?? [])}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>
      </nav>
    );
  }

  return (
    <nav
      className="sticky top-14 z-50 hidden border-b border-border-subtle glass px-4 md:block"
      aria-label="Module navigation"
    >
      <NavigationMenuPrimitive.Root
        delayDuration={100}
        className="relative flex h-11 max-w-max items-center"
      >
        <NavigationMenuPrimitive.List className="flex list-none items-center gap-0.5">
          {groups.map((group) => {
            const groupActive = group.links.some((l) => isLinkActive(l.url));

            // Direct link (no dropdown / no chevron) when only one entry.
            if (group.links.length === 1) {
              const link = group.links[0];
              const Icon = link.icon;
              const active = isLinkActive(link.url);
              return (
                <NavigationMenuPrimitive.Item key={group.label}>
                  <Link
                    to={link.url as never}
                    title={link.title}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent",
                      active || groupActive ? "bg-primary/10 text-primary" : "text-foreground/80",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{link.title}</span>
                  </Link>
                </NavigationMenuPrimitive.Item>
              );
            }

            return (
              <NavigationMenuPrimitive.Item key={group.label} className="relative">
                <NavigationMenuPrimitive.Trigger
                  className={cn(
                    "group inline-flex h-8 items-center gap-1 rounded-md bg-transparent px-3 text-sm font-medium transition-colors hover:bg-accent data-[state=open]:bg-accent focus:outline-none",
                    groupActive ? "text-primary" : "text-foreground/80",
                  )}
                  onPointerMove={(e) => e.preventDefault()}
                  onPointerLeave={(e) => e.preventDefault()}
                >
                  {group.label}
                  <ChevronDown
                    className="h-3 w-3 transition-transform duration-200 group-data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </NavigationMenuPrimitive.Trigger>
                <NavigationMenuPrimitive.Content
                  onPointerMove={(e) => e.preventDefault()}
                  onPointerLeave={(e) => e.preventDefault()}
                  className={cn(
                    "absolute left-0 top-full z-[100] mt-1.5 rounded-md border bg-popover text-popover-foreground shadow-lg outline-none",
                    "data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out",
                  )}
                >
                  <ul className="grid w-[460px] gap-1 p-3 md:grid-cols-2">
                    {group.links.map((link) => {
                      const Icon = link.icon;
                      const active = isLinkActive(link.url);
                      return (
                        <li key={link.url}>
                          <Link
                            to={link.url as never}
                            title={
                              link.restricted
                                ? `Requires ${formatRoles(link.requiredRoles ?? [])}`
                                : undefined
                            }
                            aria-disabled={link.restricted || undefined}
                            className={cn(
                              "flex gap-2.5 rounded-md p-2.5 transition-colors hover:bg-accent/60",
                              active && "bg-primary/10",
                              link.restricted && "opacity-60 pointer-events-none",
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
                                active && "bg-primary/15 text-primary",
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5 text-sm font-medium leading-tight">
                                {link.title}
                                {link.restricted && (
                                  <Lock className="h-3 w-3 opacity-70" aria-hidden />
                                )}
                              </span>
                              {link.description && (
                                <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">
                                  {link.description}
                                </span>
                              )}
                              {link.restricted && (
                                <span className="mt-1 block text-[10px] uppercase tracking-wide text-amber-600">
                                  Requires {formatRoles(link.requiredRoles ?? [])}
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </NavigationMenuPrimitive.Content>
              </NavigationMenuPrimitive.Item>
            );
          })}
        </NavigationMenuPrimitive.List>
      </NavigationMenuPrimitive.Root>
    </nav>
  );
}
