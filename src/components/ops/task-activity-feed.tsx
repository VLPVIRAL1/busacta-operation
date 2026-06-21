import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ListChecks, MessageSquare, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { MentionTextarea, renderMentioned } from "@/components/ops/mention-textarea";
import { UserAvatar } from "@/components/shared/user-avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/shared/utils";

interface NoteRow {
  id: string;
  body: string;
  created_by: string | null;
  created_at: string;
}

interface ActionRow {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  created_by: string | null;
  created_at: string;
  end_at: string | null;
}

type FeedItem =
  | { kind: "note"; id: string; body: string; author: string | null; at: string }
  | {
      kind: "action";
      id: string;
      title: string;
      status: ActionRow["status"];
      author: string | null;
      at: string;
    };

export function TaskActivityFeed({ taskId, isInternal }: { taskId: string; isInternal: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);

  const notesKey = ["task-notes", taskId];
  const itemsKey = ["task-action-items", taskId];

  const { data: notes, isLoading: notesLoading } = useQuery({
    queryKey: notesKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_notes")
        .select("id, body, created_by, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NoteRow[];
    },
  });

  const { data: items, isLoading: itemsLoading } = useQuery({
    queryKey: itemsKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_action_items" as never)
        .select("id, title, status, created_by, created_at, end_at")
        .eq("task_id", taskId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ActionRow[];
    },
  });

  const feed = useMemo<FeedItem[]>(() => {
    const n: FeedItem[] = (notes ?? []).map((r) => ({
      kind: "note",
      id: r.id,
      body: r.body,
      author: r.created_by,
      at: r.created_at,
    }));
    const a: FeedItem[] = (items ?? []).map((r) => ({
      kind: "action",
      id: r.id,
      title: r.title,
      status: r.status,
      author: r.created_by,
      at: r.created_at,
    }));
    return [...n, ...a].sort((x, y) => (x.at < y.at ? 1 : -1));
  }, [notes, items]);

  const postNote = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (!text || !user) return;
      const { error } = await supabase
        .from("task_notes")
        .insert({ task_id: taskId, body: text, created_by: user.id });
      if (error) throw error;
      if (mentions.length > 0) {
        await supabase.from("notifications").insert(
          mentions.map((uid) => ({
            user_id: uid,
            kind: "mention",
            title: "You were mentioned in a note",
            body: text.slice(0, 140),
            task_id: taskId,
            url: `/ops/tasks/${taskId}`,
          })) as never,
        );
      }
    },
    onSuccess: () => {
      setBody("");
      setMentions([]);
      qc.invalidateQueries({ queryKey: notesKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const postAction = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (text.length < 3 || !user) {
        throw new Error("Action item must be at least 3 characters");
      }
      const { error } = await supabase.from("task_action_items" as never).insert({
        task_id: taskId,
        title: text,
        kind: "open_point",
        created_by: user.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      setMentions([]);
      qc.invalidateQueries({ queryKey: itemsKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from("task_action_items" as never)
        .update({
          status: done ? "done" : "todo",
          end_at: done ? new Date().toISOString() : null,
          completed_by: done ? (user?.id ?? null) : null,
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: itemsKey });
      const prev = qc.getQueryData<ActionRow[]>(itemsKey) ?? [];
      qc.setQueryData(
        itemsKey,
        prev.map((r) => (r.id === id ? { ...r, status: done ? "done" : "todo" } : r)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(itemsKey, ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: itemsKey }),
  });

  const remove = useMutation({
    mutationFn: async (entry: FeedItem) => {
      if (entry.kind === "note") {
        const { error } = await supabase.from("task_notes").delete().eq("id", entry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("task_action_items" as never)
          .update({ deleted_at: new Date().toISOString() } as never)
          .eq("id", entry.id);
        if (error) throw error;
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: notesKey });
      qc.invalidateQueries({ queryKey: itemsKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loading = notesLoading || itemsLoading;
  const canPost = !!body.trim() && !!user;

  return (
    <Card className="bg-card/60 backdrop-blur border-border/60">
      <CardContent className="p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Activity & Tasks</h3>
          <p className="text-xs text-muted-foreground">
            Capture an internal note or convert it into a tracked action item.
          </p>
        </div>

        <div className="space-y-2">
          <MentionTextarea
            value={body}
            onChange={setBody}
            onMentionsChange={setMentions}
            rows={3}
            placeholder="Write a note or describe an action item… use @ to mention teammates"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canPost || postNote.isPending}
              onClick={() => postNote.mutate()}
            >
              <MessageSquare className="h-4 w-4" /> Post as Note
            </Button>
            {isInternal && (
              <Button
                size="sm"
                disabled={!canPost || postAction.isPending}
                onClick={() => postAction.mutate()}
              >
                <ListChecks className="h-4 w-4" /> Add as Action Item
              </Button>
            )}
          </div>
        </div>

        <div className="border-t border-border/60 pt-3">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : feed.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-6">
              No activity yet — add the first note or action item above.
            </p>
          ) : (
            <ul className="space-y-2">
              {feed.map((entry) => (
                <li
                  key={`${entry.kind}-${entry.id}`}
                  className={cn(
                    "rounded-lg border border-border/60 bg-background/60 p-3 flex items-start gap-3",
                  )}
                >
                  {entry.kind === "action" ? (
                    <Checkbox
                      checked={entry.status === "done"}
                      onCheckedChange={(v) => toggleStatus.mutate({ id: entry.id, done: !!v })}
                      className="mt-0.5"
                    />
                  ) : (
                    <div className="mt-0.5">
                      {entry.author ? (
                        <UserAvatar userId={entry.author} size="sm" />
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-muted" />
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {entry.kind === "action" ? (
                        <Badge
                          variant="outline"
                          className="h-4 px-1.5 text-[10px] border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                        >
                          Action item
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                          Note
                        </Badge>
                      )}
                      {entry.author && entry.kind === "action" && (
                        <UserAvatar userId={entry.author} size="sm" showName />
                      )}
                      {entry.author && entry.kind === "note" && (
                        <UserAvatar userId={entry.author} size="sm" showName />
                      )}
                      <span>· {formatDistanceToNow(new Date(entry.at), { addSuffix: true })}</span>
                    </div>
                    {entry.kind === "note" ? (
                      <div className="mt-1 whitespace-pre-wrap text-sm">
                        {renderMentioned(entry.body)}
                      </div>
                    ) : (
                      <div
                        className={cn(
                          "mt-1 text-sm",
                          entry.status === "done" && "line-through text-muted-foreground",
                        )}
                      >
                        {entry.title}
                      </div>
                    )}
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      if (confirm(entry.kind === "note" ? "Delete note?" : "Delete action item?"))
                        remove.mutate(entry);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
