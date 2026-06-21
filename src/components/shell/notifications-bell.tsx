import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Pin, PinOff, MailOpen, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";

interface NotificationRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  is_pinned: boolean;
  created_at: string;
}

export function NotificationsBell() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id, kind, title, body, url, read_at, is_pinned, created_at")
        .eq("user_id", user!.id)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30);
      return (data ?? []) as NotificationRow[];
    },
  });

  // Realtime: refresh inbox and show a toast when a new notification lands.
  useRealtimeChannel(user ? `notif-${user.id}` : null, (channel) => {
    const uid = user!.id;
    return channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
      (payload) => {
        qc.invalidateQueries({ queryKey: ["notifications", uid] });
        qc.invalidateQueries({ queryKey: ["notifications-inbox-infinite", uid] });
        if (payload.eventType === "INSERT") {
          const n = payload.new as NotificationRow;
          toast(n.title, {
            description: n.body ?? undefined,
            action: n.url
              ? { label: "View", onClick: () => window.location.assign(n.url!) }
              : undefined,
          });
        }
      },
    );
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const setRead = useMutation({
    mutationFn: async ({ id, read }: { id: string; read: boolean }) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: read ? new Date().toISOString() : null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const setPinned = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_pinned: pinned })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] }),
  });

  const unread = (data ?? []).filter((n) => !n.read_at).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <DropdownMenuLabel className="flex items-center justify-between px-3 py-2">
          <span>Notifications</span>
          {unread > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />
        <ScrollArea className="max-h-96">
          {isLoading ? (
            <div className="space-y-2 px-3 py-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-full" />
                </div>
              ))}
            </div>
          ) : (data ?? []).length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              You're all caught up.
            </div>
          ) : (
            <ul className="py-1">
              {(data ?? []).map((n) => (
                <li
                  key={n.id}
                  className={`group relative ${n.is_pinned ? "border-l-2 border-l-primary" : ""}`}
                >
                  {n.url ? (
                    <Link
                      to={n.url}
                      onClick={() => !n.read_at && setRead.mutate({ id: n.id, read: true })}
                      className="flex flex-col gap-0.5 px-3 py-2 pr-16 hover:bg-accent"
                    >
                      <NotifContent n={n} />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => !n.read_at && setRead.mutate({ id: n.id, read: true })}
                      className="flex w-full flex-col gap-0.5 px-3 py-2 pr-16 text-left hover:bg-accent"
                    >
                      <NotifContent n={n} />
                    </button>
                  )}
                  <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title={n.is_pinned ? "Unpin" : "Pin"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPinned.mutate({ id: n.id, pinned: !n.is_pinned });
                      }}
                    >
                      {n.is_pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title={n.read_at ? "Mark unread" : "Mark read"}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRead.mutate({ id: n.id, read: !n.read_at });
                      }}
                    >
                      {n.read_at ? <Mail className="h-3 w-3" /> : <MailOpen className="h-3 w-3" />}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        <DropdownMenuSeparator className="m-0" />
        <Link
          to="/ops/notifications"
          className="block px-3 py-2 text-center text-xs font-medium text-primary hover:bg-accent"
        >
          View all notifications →
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotifContent({ n }: { n: NotificationRow }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate flex items-center gap-1.5">
          {n.is_pinned && <Pin className="h-3 w-3 text-primary fill-primary" />}
          {n.title}
        </span>
        {!n.read_at && (
          <Badge variant="default" className="h-4 px-1 text-[9px]">
            new
          </Badge>
        )}
      </div>
      {n.body && <span className="text-xs text-muted-foreground line-clamp-2">{n.body}</span>}
      <span className="text-[10px] text-muted-foreground/80">
        {new Date(n.created_at).toLocaleString()} · {n.kind}
      </span>
    </>
  );
}
