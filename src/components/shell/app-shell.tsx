import { type ReactNode, useEffect } from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { moduleFromPath, MODULE_LABEL } from "@/lib/routing/use-nav";
import { useHubAccess } from "@/lib/auth/use-hub-access";
import { LogOut, ChevronRight, Loader2 } from "lucide-react";
import { GlobalSidebar } from "./global-sidebar";
import { ModuleMegaMenu } from "./module-mega-menu";
import { MobileNavSheet } from "./mobile-nav-sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RoleSwitcher } from "./role-switcher";
import { TimerWidget } from "@/components/ops/timer-widget";
import { NotificationsBell } from "./notifications-bell";
import { GlobalRefreshButton } from "./global-refresh-button";
import { ChatUnreadBadge } from "./chat-unread-badge";
import { ThemeToggle } from "./theme-toggle";
import { useProfileLite, initialsFor } from "@/components/shared/user-avatar";
import { User } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { useHubShortcuts } from "@/lib/routing/use-hub-shortcuts";
import { RouteErrorBoundary } from "@/components/shared/error-boundary";
import { OfflineIndicator } from "@/components/shell/offline-indicator";
import { BiometricGate } from "@/components/mobile/biometric-gate";
import { ShortcutCheatsheet } from "@/components/shell/shortcut-cheatsheet";
import { CommandPalette } from "@/components/shell/command-palette";
import { SearchTriggerButton } from "@/components/shell/search-trigger-button";
import { LayoutGrid } from "lucide-react";
import { useReminderToast } from "@/hooks/use-reminder-toast";

export interface Crumb {
  label: string;
  to?: string;
}

export function AppShell({
  children,
  crumbs = [],
  hideMegaMenu = false,
  fullBleed = false,
}: {
  children: ReactNode;
  crumbs?: Crumb[];
  hideMegaMenu?: boolean;
  fullBleed?: boolean;
}) {
  const { user, role, department, signOut } = useAuth();
  const router = useRouter();
  const path = useRouterState({ select: (r) => r.location.pathname });
  const hubKey = moduleFromPath(path);
  const hubLabel = MODULE_LABEL[hubKey];
  const { data: profile } = useProfileLite(user?.id);
  useHubShortcuts();
  useReminderToast();

  // Hub Module Visibility enforcement: a signed-in user whose current hub is
  // hidden (per-user override, role default, or global switch) is bounced to
  // /access-denied even when they arrive via a direct link. Independent of the
  // global BYPASS_ACCESS role gate so it works during the validation phase.
  const { isHubVisible, isLoading: hubAccessLoading } = useHubAccess();
  const hubBlocked = !!user && !hubAccessLoading && !isHubVisible(hubKey);

  useEffect(() => {
    if (hubBlocked) {
      router.navigate({ to: "/access-denied", search: { from: path, need: undefined } });
    }
  }, [hubBlocked, router, path]);

  // Remember the last real Ops sub-page so the Ops Hub (/ops) lands the user
  // back where they left off. We persist the full path+search (e.g.
  // /ops/reports?tab=workload) but never the bare /ops index, which redirects.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!path.startsWith("/ops/") || path === "/ops/") return;
    try {
      window.localStorage.setItem(
        "ops:last-path",
        window.location.pathname + window.location.search,
      );
    } catch {
      /* localStorage unavailable (private mode) — landing falls back to default */
    }
  }, [path]);

  const handleSignOut = async () => {
    await signOut();
    router.navigate({ to: "/login" });
  };

  const lite = profile ?? {
    id: user?.id ?? "",
    full_name: null,
    email: user?.email ?? null,
    avatar_url: null,
  };
  const initials = initialsFor(lite);

  // Map ModuleKey → theme class. "direct-clients" already has its own
  // `theme-direct` wrapper, so we skip applying a duplicate here.
  const NEUTRAL_HUBS = new Set([
    "dashboard",
    "portal",
    "general",
    "growth",
    "guide",
    "direct-clients",
  ]);
  const hubThemeClass = NEUTRAL_HUBS.has(hubKey) ? "" : `theme-${hubKey}`;

  // HR Hub uses a fixed shell so report tables scroll within their card instead
  // of the whole page scrolling. Pages that explicitly request fullBleed keep
  // full control of their layout.
  const hrFixed = hubKey === "hr" && !fullBleed;

  // While hub access is still resolving for a signed-in user, or while the
  // redirect for a blocked hub is in flight, show a loader rather than the
  // protected content underneath.
  if (hubBlocked || (!!user && hubAccessLoading)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex h-screen w-full overflow-hidden bg-background bg-mesh",
        hubThemeClass,
      )}
    >
      <GlobalSidebar />
      <div className="flex flex-1 flex-col min-w-0 min-h-0 md:pl-14">
        <header className="shrink-0 flex h-14 items-center gap-2 border-b border-border-subtle glass px-3 sm:px-4">
          <MobileNavSheet />
          <Badge
            variant="outline"
            className="hidden sm:inline-flex shrink-0 border-primary/40 text-primary bg-primary/5"
            title={`Current hub: ${hubLabel}`}
          >
            {hubLabel}
          </Badge>
          <nav
            className="flex flex-1 min-w-0 items-center gap-1 text-sm text-muted-foreground overflow-hidden"
            aria-label="Breadcrumb"
          >
            {crumbs.map((c, i) => {
              const isLast = i === crumbs.length - 1;
              return (
                <span
                  key={i}
                  className={cn(
                    "flex items-center gap-1 min-w-0",
                    isLast ? "shrink truncate" : "shrink-0 hidden sm:flex",
                  )}
                >
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 opacity-50 shrink-0" />}
                  {c.to && !isLast ? (
                    <Link
                      to={c.to}
                      className="hover:text-foreground transition-colors truncate max-w-[12rem]"
                      title={c.label}
                    >
                      {c.label}
                    </Link>
                  ) : (
                    <span className="text-foreground font-medium truncate" title={c.label}>
                      {c.label}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <SearchTriggerButton />
            <Button size="sm" variant="outline" className="hidden md:inline-flex gap-1.5" asChild>
              <Link to="/ops/bulk-add">
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Bulk Import Tasks</span>
              </Link>
            </Button>
            <TimerWidget />
            <ChatUnreadBadge />
            <GlobalRefreshButton />
            <NotificationsBell />
            <ThemeToggle />
            <RoleSwitcher />
            {role && (
              <Badge variant="secondary" className="capitalize hidden sm:inline-flex">
                {role.replace("_", " ")}
              </Badge>
            )}
            {department && (
              <Badge
                variant="outline"
                className="capitalize hidden md:inline-flex border-primary/40 text-primary"
              >
                {department}
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="h-8 w-8 ring-2 ring-white/60">
                    {lite.avatar_url ? (
                      <AvatarImage
                        src={lite.avatar_url}
                        alt={lite.full_name ?? user?.email ?? ""}
                      />
                    ) : null}
                    <AvatarFallback className="gradient-primary text-primary-foreground text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium truncate">
                      {lite.full_name ?? user?.email}
                    </span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {role ?? "no role"}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/general/profile">
                    <User className="mr-2 h-4 w-4" />
                    General · My Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        {!hideMegaMenu && <ModuleMegaMenu />}
        {/*
          HR Hub uses a fixed shell: the window never scrolls and the header +
          mega-menu stay put. Content scrolls inside its own container so
          individual panels manage their own overflow. Pages that opt into
          fullBleed manage their own layout entirely.
        */}
        <main
          className={cn(
            "relative flex-1 min-h-0",
            fullBleed || hrFixed ? "flex flex-col overflow-hidden" : "overflow-y-auto p-4 sm:p-6",
          )}
        >
          <RouteErrorBoundary label={hubLabel}>
            {hrFixed ? (
              <div className="flex flex-1 min-h-0 flex-col p-3 sm:p-4">{children}</div>
            ) : (
              children
            )}
          </RouteErrorBoundary>
        </main>
      </div>
      <OfflineIndicator />
      <BiometricGate />
      <ShortcutCheatsheet />
      <CommandPalette />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 sm:mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <h1
          className="text-xl sm:text-2xl font-semibold tracking-tight break-words sm:truncate"
          title={title}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground break-words">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2 [&>*]:min-h-9">{actions}</div>}
    </div>
  );
}
