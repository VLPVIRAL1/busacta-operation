import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Star, MessagesSquare, ListChecks } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { fmtIST } from "@/lib/format/time";
import type { InboxSelection } from "./inbox-list-pane";

interface StarRow {
  scope: "task" | "chat";
  message_id: string;
  created_at: string;
}

interface ResolvedStar {
  scope: "task" | "chat";
  message_id: string;
  body: string;
  created_at: string;
  thread_id?: string | null;
  task_id?: string | null;
  selection: InboxSelection;
}

export function StarredMessagesDialog({
  open,
  onOpenChange,
  onJump,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onJump: (sel: InboxSelection, messageId: string) => void;
}) {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ["starred-messages", user?.id, open],
    enabled: !!user && open,
    queryFn: async (): Promise<ResolvedStar[]> => {
      const { data: stars } = await supabase
        .from("message_stars")
        .select("scope,message_id,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      const rows = (stars ?? []) as StarRow[];
      const chatIds = rows.filter((r) => r.scope === "chat").map((r) => r.message_id);
      const taskIds = rows.filter((r) => r.scope === "task").map((r) => r.message_id);

      const chatMap = new Map<string, { body: string; thread_id: string; created_at: string }>();
      if (chatIds.length) {
        const { data } = await supabase
          .from("chat_messages")
          .select("id,body,thread_id,created_at")
          .in("id", chatIds);
        for (const m of data ?? []) {
          chatMap.set(m.id as string, {
            body: m.body as string,
            thread_id: m.thread_id as string,
            created_at: m.created_at as string,
          });
        }
      }
      const taskMap = new Map<string, { body: string; task_id: string; created_at: string }>();
      if (taskIds.length) {
        const { data } = await supabase
          .from("task_messages")
          .select("id,body,task_id,created_at")
          .in("id", taskIds);
        for (const m of data ?? []) {
          taskMap.set(m.id as string, {
            body: m.body as string,
            task_id: m.task_id as string,
            created_at: m.created_at as string,
          });
        }
      }

      const threadIds = Array.from(new Set(Array.from(chatMap.values()).map((v) => v.thread_id)));
      const threadKind = new Map<string, "dm" | "group">();
      if (threadIds.length) {
        const { data } = await supabase.from("chat_threads").select("id,kind").in("id", threadIds);
        for (const t of data ?? []) threadKind.set(t.id as string, t.kind as "dm" | "group");
      }

      const out: ResolvedStar[] = [];
      for (const s of rows) {
        if (s.scope === "chat") {
          const m = chatMap.get(s.message_id);
          if (!m) continue;
          const kind = threadKind.get(m.thread_id) ?? "group";
          out.push({
            scope: "chat",
            message_id: s.message_id,
            body: m.body,
            created_at: m.created_at,
            thread_id: m.thread_id,
            selection: { kind, id: m.thread_id },
          });
        } else {
          const m = taskMap.get(s.message_id);
          if (!m) continue;
          out.push({
            scope: "task",
            message_id: s.message_id,
            body: m.body,
            created_at: m.created_at,
            task_id: m.task_id,
            selection: { kind: "task", id: m.task_id },
          });
        }
      }
      return out;
    },
  });

  const items = useMemo(() => q.data ?? [], [q.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Star className="h-4 w-4 text-amber-500" />
            Starred messages
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto space-y-1.5 pr-1">
          {q.isLoading ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Star className="h-7 w-7" />}
              title="No starred messages yet"
              description="Hover a message and tap the star to save it here."
            />
          ) : (
            items.map((it) => (
              <button
                key={`${it.scope}-${it.message_id}`}
                type="button"
                onClick={() => {
                  onJump(it.selection, it.message_id);
                  onOpenChange(false);
                }}
                className="w-full text-left rounded-md border p-2.5 hover:bg-muted/60 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1 text-[11px] text-muted-foreground">
                  {it.scope === "task" ? (
                    <ListChecks className="h-3 w-3" />
                  ) : (
                    <MessagesSquare className="h-3 w-3" />
                  )}
                  <span className="capitalize">{it.scope}</span>
                  <span>·</span>
                  <span>{fmtIST(it.created_at)}</span>
                </div>
                <div className="text-xs line-clamp-3 whitespace-pre-wrap break-words">
                  {it.body}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
