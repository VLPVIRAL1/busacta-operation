import { Link, useRouterState } from "@tanstack/react-router";
import { useNav, moduleFromPath } from "@/lib/routing/use-nav";
import { cn } from "@/lib/shared/utils";

export function ModuleTopNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const activeModule = moduleFromPath(path);
  const { tier2For } = useNav();
  const groups = tier2For(activeModule);

  if (groups.length === 0) return null;

  const links = groups.flatMap((g) => g.links);

  return (
    <nav
      className="sticky top-14 z-10 border-b border-border-subtle glass px-4"
      aria-label="Module navigation"
    >
      <div className="flex h-11 items-center gap-1 overflow-x-auto">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = path === link.url || path.startsWith(link.url + "/");
          return (
            <Link
              key={link.url}
              to={link.url as never}
              title={link.description}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                isActive && "bg-primary/10 text-primary",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {link.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
