import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CheckCheck,
  Inbox,
  AtSign,
  Activity,
  Trash2,
  Pin,
  PinOff,
  MailOpen,
  Mail,
  Filter,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";

import { EmptyState } from "@/components/shared/empty-state";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { FacetedSingleChip } from "@/components/shared/faceted-multi-chip";
import { computeFacets } from "@/lib/ops/facets";
import { FirmCode, ProjectCode } from "@/components/shared/entity-code";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/shared/utils";
import { useAuth } from "@/lib/auth/auth-context";
import {
  notificationsInboxInfinite,
  markAllNotificationsRead,
  setNotificationRead,
  setNotificationPinned,
  deleteNotification,
  type NotificationRow,
} from "@/lib/queries/ops.queries";
import { VirtualRows } from "@/components/shared/virtual-rows";
import { GridErrorState, GridSkeletonRows } from "@/components/shared/grid-states";

export const Route = createFileRoute("/ops/notifications")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "Notifications" }]} fullBleed>
        <NotificationsInbox />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type ViewKey = "all" | "unread" | "pinned" | "mentions" | "activity";

const VIEW_STORAGE_KEY = "ops:notifications:view:v1";

function classifyView(n: NotificationRow): ViewKey[] {
  const tags: ViewKey[] = ["all"];
  if (!n.read_at) tags.push("unread");
  if (n.is_pinned) tags.push("pinned");
  const isMention = n.kind === "mention" || n.kind.includes("mention");
  if (isMention) tags.push("mentions");
  else tags.push("activity");
  return tags;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = Math.max(0, now - d.getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString();
}

function NotificationsInbox() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewKey>(() => {
    if (typeof window === "undefined") return "all";
    return (localStorage.getItem(VIEW_STORAGE_KEY) as ViewKey | null) ?? "all";
  });

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...notificationsInboxInfinite(user?.id ?? ""),
    enabled: !!user,
  });

  const rows = useMemo<NotificationRow[]>(
    () => (data?.pages ?? []).flatMap((p) => p.rows as NotificationRow[]),
    [data],
  );

  // Surface pinned items at the top of the loaded window without breaking the
  // keyset cursor (which is plain created_at DESC).
  const orderedRows = useMemo(() => {
    const pinned = rows.filter((r) => r.is_pinned);
    const rest = rows.filter((r) => !r.is_pinned);
    return [...pinned, ...rest];
  }, [rows]);

  const facets = useMemo(
    () =>
      computeFacets<NotificationRow>(
        rows,
        {}, // no cross-filters; all options always counted independently
        { view: (r) => classifyView(r) },
      ),
    [rows],
  );

  const filtered = useMemo(() => {
    if (view === "all") return orderedRows;
    return orderedRows.filter((n) => classifyView(n).includes(view));
  }, [orderedRows, view]);

  const unreadCount = facets.view.get("unread") ?? 0;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notifications-inbox-infinite", user?.id ?? ""] });
    qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await markAllNotificationsRead(user.id);
    },
    onSuccess: () => {
      toast.success("All caught up");
      invalidate();
    },
  });

  const setRead = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => setNotificationRead(id, read),
    onSuccess: invalidate,
  });
  const setPinned = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      setNotificationPinned(id, pinned),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: invalidate,
  });

  const openNotif = (n: NotificationRow) => {
    if (!n.read_at) setRead.mutate({ id: n.id, read: true });
    if (n.url) navigate({ to: n.url }).catch(() => {});
  };

  const viewOptions: { value: ViewKey; label: string; icon: React.ReactNode }[] = [
    { value: "all", label: "All", icon: <Inbox className="h-3 w-3" /> },
    { value: "unread", label: "Unread", icon: <Mail className="h-3 w-3" /> },
    { value: "pinned", label: "Pinned", icon: <Pin className="h-3 w-3" /> },
    { value: "mentions", label: "Mentions", icon: <AtSign className="h-3 w-3" /> },
    { value: "activity", label: "Task activity", icon: <Activity className="h-3 w-3" /> },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Compact header */}
      <header className="shrink-0 flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold leading-tight">Notifications</h1>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Mentions, task activity and updates addressed to you.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending || unreadCount === 0}
        >
          <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark all read
        </Button>
      </header>

      {/* Sticky filter bar */}
      <div className="shrink-0 flex flex-wrap items-center gap-1.5 border-b bg-background/95 px-4 py-1.5 backdrop-blur">
        {/* Segmented quick chips */}
        <div className="inline-flex items-center rounded-md border bg-background p-0.5">
          {viewOptions.map((opt) => {
            const n = facets.view.get(opt.value) ?? 0;
            const active = view === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setView(opt.value)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {opt.icon}
                <span>{opt.label}</span>
                {n > 0 && (
                  <span
                    className={cn(
                      "ml-0.5 rounded px-1 text-[10px] tabular-nums",
                      active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Optional faceted chip (same data, popover form) */}
        <FacetedSingleChip
          icon={<Filter className="h-3 w-3" />}
          label="View"
          value={view}
          emptyValue="all"
          onChange={(v) => setView((v as ViewKey) || "all")}
          options={viewOptions.map((o) => ({ value: o.value, label: o.label }))}
          counts={facets.view}
        />
      </div>

      {/* Feed */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {isError ? (
          <GridErrorState
            error={error}
            onRetry={() => void refetch()}
            onClearFilters={() => setView("all")}
          />
        ) : isLoading ? (
          <GridSkeletonRows rows={12} />
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={<Bell className="h-8 w-8" />}
              title={view === "unread" ? "Inbox zero" : "Nothing here yet"}
              description={
                view === "mentions"
                  ? "You haven't been @mentioned recently."
                  : view === "activity"
                    ? "Task and time activity addressed to you will appear here."
                    : view === "pinned"
                      ? "Pin important notifications to keep them at the top."
                      : "When teammates @mention you or update tasks you watch, you'll see it here."
              }
            />
          </div>
        ) : (
          <VirtualRows
            rows={filtered}
            estimateRowHeight={36}
            rowKey={(n) => n.id}
            onEndReached={handleEndReached}
            bottomSlot={
              isFetchingNextPage ? (
                <div className="px-3 py-2 text-[11px] text-muted-foreground">Loading more…</div>
              ) : !hasNextPage && filtered.length > 0 ? (
                <div className="px-3 py-2 text-[11px] text-muted-foreground">End of inbox</div>
              ) : null
            }
            renderRow={(n) => (
              <NotifRow
                n={n}
                onOpen={() => openNotif(n)}
                onToggleRead={() => setRead.mutate({ id: n.id, read: !n.read_at })}
                onTogglePin={() => setPinned.mutate({ id: n.id, pinned: !n.is_pinned })}
                onDelete={() => remove.mutate(n.id)}
              />
            )}
          />
        )}
      </div>
    </div>
  );
}

function kindIcon(kind: string) {
  if (kind === "mention" || kind.includes("mention")) return AtSign;
  if (kind.includes("pin")) return Pin;
  if (kind.includes("activity") || kind.includes("task")) return Activity;
  return Bell;
}

function NotifRow({
  n,
  onOpen,
  onToggleRead,
  onTogglePin,
  onDelete,
}: {
  n: NotificationRow;
  onOpen: () => void;
  onToggleRead: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  const KindIcon = kindIcon(n.kind);
  const unread = !n.read_at;
  const created = new Date(n.created_at).toLocaleString();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <li
          onClick={onOpen}
          className={cn(
            "group relative flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent/60",
            unread && "bg-primary/5 dark:bg-primary/10",
            n.is_pinned && "border-l-2 border-l-primary pl-[10px]",
          )}
        >
          {/* Unread dot */}
          <span
            className={cn(
              "shrink-0 h-2 w-2 rounded-full",
              unread ? "bg-primary" : "bg-transparent",
            )}
          />
          {/* Kind icon */}
          <KindIcon className="shrink-0 h-3.5 w-3.5 text-muted-foreground" />

          {/* Title + meta + snippet */}
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <span className={cn("truncate", unread ? "font-semibold" : "font-medium")}>
              {n.title}
            </span>
            {n.firms?.firm_identifier && (
              <FirmCode code={n.firms.firm_identifier} name={n.firms.name ?? undefined} />
            )}
            {n.projects?.code && (
              <ProjectCode code={n.projects.code} name={n.projects.name ?? undefined} />
            )}
            {n.body && (
              <span className="hidden sm:inline truncate text-xs text-muted-foreground">
                {n.body}
              </span>
            )}
          </div>

          {/* Right-side timestamp + hover actions */}
          <div className="shrink-0 flex items-center gap-1">
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title={n.is_pinned ? "Unpin" : "Pin"}
                aria-label={n.is_pinned ? "Unpin notification" : "Pin notification"}
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin();
                }}
              >
                {n.is_pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title={unread ? "Mark read" : "Mark unread"}
                aria-label={unread ? "Mark as read" : "Mark as unread"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleRead();
                }}
              >
                {unread ? <MailOpen className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <span
              title={created}
              className="text-[10px] tabular-nums text-muted-foreground w-12 text-right"
            >
              {relativeTime(n.created_at)}
            </span>
          </div>
        </li>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={onOpen} disabled={!n.url}>
          <ExternalLink className="h-3.5 w-3.5 mr-2" /> Open
        </ContextMenuItem>
        <ContextMenuItem onClick={onToggleRead}>
          {unread ? (
            <>
              <MailOpen className="h-3.5 w-3.5 mr-2" /> Mark as read
            </>
          ) : (
            <>
              <Mail className="h-3.5 w-3.5 mr-2" /> Mark as unread
            </>
          )}
        </ContextMenuItem>
        <ContextMenuItem onClick={onTogglePin}>
          {n.is_pinned ? (
            <>
              <PinOff className="h-3.5 w-3.5 mr-2" /> Unpin
            </>
          ) : (
            <>
              <Pin className="h-3.5 w-3.5 mr-2" /> Pin
            </>
          )}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
