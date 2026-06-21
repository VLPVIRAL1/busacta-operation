import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, PinOff, Trash2, Plus, Pencil } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/shared/delete-confirm-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichEditor, RichViewer } from "@/components/shared/rich-editor";
import { EmptyState } from "@/components/shared/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

interface NoteRow {
  id: string;
  body: string;
  is_pinned: boolean;
  created_by: string | null;
  created_at: string;
}

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, "").trim();

export function TaskNotesPanel({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const queryKey = ["task-notes", taskId];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NoteRow | null>(null);
  const [body, setBody] = useState("");

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_notes")
        .select("id, body, is_pinned, created_by, created_at")
        .eq("task_id", taskId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NoteRow[];
    },
  });

  const authorIds = useMemo(
    () => Array.from(new Set((data ?? []).map((n) => n.created_by).filter(Boolean) as string[])),
    [data],
  );
  const { data: authors } = useQuery({
    queryKey: ["note-authors", authorIds.join(",")],
    enabled: authorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", authorIds);
      return Object.fromEntries((data ?? []).map((p) => [p.id, p]));
    },
  });

  const reset = () => {
    setEditing(null);
    setBody("");
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!stripHtml(body) || !user) return;
      if (editing) {
        const { error } = await supabase.from("task_notes").update({ body }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("task_notes").insert({
          task_id: taskId,
          body,
          created_by: user.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePin = useMutation({
    mutationFn: async (n: NoteRow) => {
      const { error } = await supabase
        .from("task_notes")
        .update({ is_pinned: !n.is_pinned })
        .eq("id", n.id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Notes</h3>
          <p className="text-xs text-muted-foreground">Internal notes for this task.</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" /> Add note
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-20" />
      ) : (data ?? []).length === 0 ? (
        <EmptyState title="No notes yet" description="Click Add note to capture a thought." />
      ) : (
        <div className="space-y-2">
          {(data ?? []).map((n) => {
            const a = n.created_by ? authors?.[n.created_by] : null;
            const initials = (a?.full_name ?? a?.email ?? "?").slice(0, 2).toUpperCase();
            return (
              <Card
                key={n.id}
                className={
                  n.is_pinned ? "border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/10" : ""
                }
              >
                <CardContent className="p-3 flex items-start gap-3">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {a?.full_name ?? a?.email ?? "User"}
                      </span>{" "}
                      · {new Date(n.created_at).toLocaleString()}
                    </div>
                    <div className="mt-1">
                      <RichViewer html={n.body} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditing(n);
                        setBody(n.body);
                        setOpen(true);
                      }}
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => togglePin.mutate(n)}
                      title={n.is_pinned ? "Unpin" : "Pin"}
                    >
                      {n.is_pinned ? (
                        <PinOff className="h-3.5 w-3.5" />
                      ) : (
                        <Pin className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <DeleteConfirmDialog
                      entityLabel="Note"
                      entityName={n.body?.slice(0, 80)}
                      onConfirm={() => remove.mutate(n.id)}
                      trigger={
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit note" : "Add note"}</DialogTitle>
          </DialogHeader>
          <RichEditor
            value={body}
            onChange={setBody}
            placeholder="Write your note… toolbar for formatting, paste images directly."
            minHeight={240}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!stripHtml(body) || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
