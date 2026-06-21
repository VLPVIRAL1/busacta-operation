import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Inbox, MessageSquare, MoreVertical, MailMinus, MailPlus } from "lucide-react";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { PortalNav } from "@/components/portal/portal-nav";
import { PortalAccessDenied } from "@/components/portal/portal-access-denied";
import { toast } from "sonner";

export const Route = createFileRoute("/portal/inbox")({
  component: () => (
    <AppShell crumbs={[{ label: "Portal", to: "/portal" }, { label: "Inbox" }]}>
      <PortalNav />
      <PortalInboxPage />
    </AppShell>
  ),
  errorComponent: RouteErrorComponent,
});

/**
 * CLIENT PORTAL — Inbox.
 *
 * Lists tasks that have at least one client-visible message, ordered by
 * the latest shared message. ALL queries filter is_client_visible=true so
 * internal-only messages never appear, even in aggregate metadata.
 *
 * Realtime: subscribes to inserts on task_messages and invalidates the
 * inbox query when a new client-visible message arrives. RLS on
 * realtime.messages enforces firm membership server-side.
 */
function PortalInboxPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const email = user?.email ?? null;

  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ["portal-contact", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firm_contacts")
        .select("id, firm_id, portal_enabled")
        .ilike("email", email!)
        .eq("portal_enabled", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const firmId = contact?.firm_id ?? null;

  const { data: messages, isLoading } = useQuery({
    queryKey: ["portal-inbox", firmId],
    enabled: !!firmId,
    refetchInterval: 30_000, // polling fallback if realtime channel drops
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_messages")
        .select(
          "id, body, created_at, task_id, is_client_visible, deleted_at, tasks(id, title, client_entities(name, projects(id, name, firm_id)))",
        )
        .eq("is_client_visible", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      // Defense in depth: cross-filter by firm.
      const rows = (data ?? []).filter(
        (m: {
          tasks?: { client_entities?: { projects?: { firm_id?: string } | null } | null } | null;
        }) => m?.tasks?.client_entities?.projects?.firm_id === firmId,
      );
      // Collapse to one entry per task — keep the most recent shared message.
      const byTask = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        if (!byTask.has(r.task_id)) byTask.set(r.task_id, r);
      }
      return Array.from(byTask.values());
    },
  });

  // Realtime: invalidate inbox when a new client-visible message lands.
  useEffect(() => {
    if (!firmId) return;
    const channel = supabase
      .channel(`portal-inbox-${firmId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "task_messages",
          filter: "is_client_visible=eq.true",
        },
        () => queryClient.invalidateQueries({ queryKey: ["portal-inbox", firmId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [firmId, queryClient]);

  if (contactLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (!contact) {
    return <PortalAccessDenied variant="no-access" />;
  }

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Tasks with recent shared updates from your accounting team."
      />
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (messages ?? []).length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-10 w-10" />}
          title="No shared messages yet"
          description="When your accountant posts an update visible to you, it will appear here."
        />
      ) : (
        <div className="space-y-3">
          {messages!.map((m) => {
            const t = m?.tasks as {
              id: string;
              title?: string;
              client_entities?: {
                name?: string;
                projects?: { id: string; name?: string } | null;
              } | null;
            } | null;
            const ce = t?.client_entities;
            return (
              <PortalInboxRow
                key={m.id}
                taskId={m.task_id}
                title={t?.title ?? "Task"}
                projectName={ce?.projects?.name ?? null}
                entityName={ce?.name ?? null}
                body={m.body}
                createdAt={m.created_at}
                onMutated={() =>
                  queryClient.invalidateQueries({ queryKey: ["portal-inbox", firmId] })
                }
              />
            );
          })}
        </div>
      )}
    </>
  );
}

function PortalInboxRow({
  taskId,
  title,
  projectName,
  entityName,
  body,
  createdAt,
  onMutated,
}: {
  taskId: string;
  title: string;
  projectName: string | null;
  entityName: string | null;
  body: string;
  createdAt: string;
  onMutated: () => void;
}) {
  const markUnread = useMutation({
    mutationFn: async (unread: boolean) => {
      const fn = unread ? "mark_unread" : "clear_unread_override";
      const { error } = await (
        supabase as unknown as {
          rpc: (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<{ error: { message: string } | null }>;
        }
      ).rpc(fn, { _scope: "task", _target_id: taskId });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, unread) => {
      onMutated();
      toast.success(unread ? "Marked as unread" : "Marked as read");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="relative">
      <Link to="/portal/tasks/$taskId" params={{ taskId }} className="block">
        <Card className="glass border-border-subtle transition-shadow hover:shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{title}</span>
              {projectName && <span>· {projectName}</span>}
              {entityName && <span>· {entityName}</span>}
              <Badge variant="secondary" className="ml-2 gap-1 text-[10px]">
                Shared
              </Badge>
              <span className="ml-auto pr-8">{new Date(createdAt).toLocaleString()}</span>
            </div>
            <p className="mt-2 text-sm whitespace-pre-wrap line-clamp-2">{body}</p>
          </CardContent>
        </Card>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute right-2 top-2 h-7 w-7"
            aria-label="Row actions"
            onClick={(e) => e.preventDefault()}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => markUnread.mutate(true)}>
            <MailPlus className="mr-2 h-4 w-4" /> Mark as unread
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => markUnread.mutate(false)}>
            <MailMinus className="mr-2 h-4 w-4" /> Mark as read
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
