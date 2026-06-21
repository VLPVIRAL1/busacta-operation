import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, BookOpen, Building2, Users, Clock } from "lucide-react";
import { cn } from "@/lib/shared/utils";

const TABS: { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }[] = [
  { to: "/ops/firms/$firmId", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/ops/firms/$firmId/clients", label: "Clients", icon: Users },
  { to: "/ops/firms/$firmId/timesheet", label: "Work Log", icon: Clock },
  { to: "/ops/firms/$firmId/sops", label: "SOP & Notes", icon: BookOpen },
  { to: "/ops/firms/$firmId/client-info", label: "Client Info", icon: Building2 },
];

export function FirmTabs({ firmId }: { firmId: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const base = `/ops/firms/${firmId}`;
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-border-subtle">
      {TABS.map((t) => {
        const target = t.to.replace("$firmId", firmId);
        const active = t.exact
          ? pathname === base || pathname === base + "/"
          : pathname.startsWith(target);
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={t.to as "/ops/firms/$firmId"}
            params={{ firmId }}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{t.label}</span>
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
