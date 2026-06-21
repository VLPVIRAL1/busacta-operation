import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FolderKanban, Inbox, ListChecks } from "lucide-react";
import { cn } from "@/lib/shared/utils";

/**
 * Portal sub-nav. Rendered at the top of every /portal/* page (except
 * /portal/tasks/$taskId which keeps its Phase 2 "Back to portal" link and
 * /portal/upload/$token which is a shell-less magic link surface).
 *
 * Tabs: Dashboard, Projects, My Tasks (B2C clients), Inbox.
 */
const ITEMS = [
  { to: "/portal", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/portal/projects", label: "Projects", icon: FolderKanban, exact: false },
  { to: "/portal/my-tasks", label: "My Tasks", icon: ListChecks, exact: false },
  { to: "/portal/inbox", label: "Inbox", icon: Inbox, exact: true },
] as const;

export function PortalNav() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <nav
      aria-label="Portal sections"
      className="mb-5 flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-border-subtle glass p-1 text-sm"
    >
      {ITEMS.map(({ to, label, icon: Icon, exact }) => {
        const active = exact ? path === to : path === to || path.startsWith(`${to}/`);
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
