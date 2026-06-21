import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { CalendarDays, LayoutDashboard, Notebook, Radio } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { TabWorkspace } from "@/components/global-dashboard/tab-workspace";
import { TabDailyNotes } from "@/components/global-dashboard/tab-daily-notes";
import { TabCalendar } from "@/components/global-dashboard/tab-calendar";
import { TabLiveTrack } from "@/components/global-dashboard/tab-live-track";
import "tippy.js/dist/tippy.css";
import { cn } from "@/lib/shared/utils";

const WORKSPACE_STATE_KEY = "workspace-last-search";

const TABS = [
  { id: "workspace", label: "Workspace", icon: LayoutDashboard },
  { id: "notes", label: "Daily Notes", icon: Notebook },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "live", label: "Live Track", icon: Radio },
] as const;

type TabId = (typeof TABS)[number]["id"];

// Accept legacy "main", "tasks", and "timesheet" values so old bookmarks resolve to Workspace.
const searchSchema = z.object({
  tab: fallback(
    z.enum(["workspace", "main", "tasks", "notes", "calendar", "timesheet", "live"]),
    "workspace",
  ).default("workspace"),
  layout: fallback(z.enum(["split", "focus", "stack", "rail"]), "split").default("split"),
  period: fallback(
    z.union([
      z.literal(5),
      z.literal(10),
      z.literal(15),
      z.literal(30),
      z.literal(60),
      z.literal("all"),
    ]),
    30,
  ).default(30),
  scope: fallback(z.array(z.enum(["assignee", "reviewer", "watcher"])), [
    "assignee",
    "reviewer",
    "watcher",
  ]).default(["assignee", "reviewer", "watcher"]),
  users: fallback(z.array(z.string()), []).default([]),
  metric: fallback(
    z.enum(["total", "bat", "with_client", "on_hold", "completed"]).nullable(),
    null,
  ).default(null),
  clients: fallback(z.array(z.string()), []).default([]),
  projects: fallback(z.array(z.string()), []).default([]),
});

export const Route = createFileRoute("/global-dashboard")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Global Workspace — BusAcTa Operations" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "Global Workspace" }]} fullBleed>
        <GlobalDashboardPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function GlobalDashboardPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/global-dashboard" });
  const initialized = useRef(false);

  // Restore last state when navigating back from another page (URL has no explicit params).
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (window.location.search) return; // Explicit URL params — respect them.
    try {
      const saved = localStorage.getItem(WORKSPACE_STATE_KEY);
      if (!saved) return;
      navigate({ search: () => JSON.parse(saved) as typeof search, replace: true });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist state on every change.
  useEffect(() => {
    try {
      localStorage.setItem(WORKSPACE_STATE_KEY, JSON.stringify(search));
    } catch {}
  }, [search]);

  const { tab } = search;
  // Legacy aliases: ?tab=main, ?tab=tasks, ?tab=timesheet all resolve to Workspace.
  const effectiveTab: TabId =
    tab === "main" || tab === "tasks" || tab === "timesheet" ? "workspace" : (tab as TabId);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <nav className="flex items-center gap-1 border-b bg-background px-3 py-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = effectiveTab === t.id;
          return (
            <Link
              key={t.id}
              to="/global-dashboard"
              search={() => ({ ...search, tab: t.id })}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <TabPanel tab={effectiveTab} />
      </div>
    </div>
  );
}

function TabPanel({ tab }: { tab: TabId }) {
  if (tab === "workspace") return <TabWorkspace />;
  if (tab === "notes") return <TabDailyNotes />;
  if (tab === "calendar") return <TabCalendar />;
  if (tab === "live") return <TabLiveTrack />;
  return null;
}
