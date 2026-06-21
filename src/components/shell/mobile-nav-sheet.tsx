import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useNav, moduleFromPath, CLIENT_MGMT_KEYS, type ModuleKey } from "@/lib/routing/use-nav";
import { useBranding } from "@/lib/shared/branding";
import { cn } from "@/lib/shared/utils";

export function MobileNavSheet() {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { tier1, tier2For } = useNav();
  const branding = useBranding();
  const activeModule: ModuleKey = moduleFromPath(path);
  const groups = tier2For(activeModule);

  const isActive = (url: string) => path === url || path.startsWith(url + "/");

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-[320px] p-0 flex flex-col gap-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold">
              {branding.mark || "B1"}
            </span>
            <span className="truncate">{branding.name || "Workspace"}</span>
          </SheetTitle>
          <div className="mt-1 inline-flex w-fit items-center rounded-md border border-primary/40 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary">
            Hub · {tier1.find((t) => t.key === activeModule)?.title ?? "Dashboard"}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Hubs
          </div>
          <nav className="flex flex-col gap-0.5 px-2">
            {tier1.map((item, idx) => {
              const Icon = item.icon;
              const active = item.key === activeModule;
              const prev = tier1[idx - 1];
              const isGroupStart =
                CLIENT_MGMT_KEYS.includes(item.key) &&
                (!prev || !CLIENT_MGMT_KEYS.includes(prev.key));
              return (
                <div key={item.key} className="contents">
                  {isGroupStart && (
                    <div className="mt-2 px-2.5 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Client Management
                    </div>
                  )}
                  <Link
                    to={item.url as never}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                      active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate" title={item.title}>
                      {item.title}
                    </span>
                  </Link>
                </div>
              );
            })}
          </nav>

          {groups.length > 0 && (
            <div className="mt-4">
              <div className="px-3 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Sections
              </div>
              <div className="px-2 pb-4">
                {groups.map((group) => (
                  <div key={group.label} className="mb-3">
                    {groups.length > 1 && (
                      <div className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                        {group.label}
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5">
                      {group.links.map((link) => {
                        const Icon = link.icon;
                        const active = isActive(link.url);
                        return (
                          <Link
                            key={link.url}
                            to={link.url as never}
                            onClick={() => setOpen(false)}
                            className={cn(
                              "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                              active
                                ? "bg-primary/10 text-primary"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate" title={link.title}>
                              {link.title}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
