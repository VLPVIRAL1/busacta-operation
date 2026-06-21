import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, CheckCircle2, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { RichEditor, RichViewer } from "@/components/shared/rich-editor";
import { useAuth } from "@/lib/auth/auth-context";
import {
  openPointsForScopeQuery,
  createOpenPoint,
  setOpenPointStatus,
  deleteOpenPoint,
  addOpenPointReply,
  type OpenPointAdmin as OpenPoint,
} from "@/lib/queries/portal.queries";

type Scope = { firm_id?: string; project_id?: string };

const STATUS: Record<
  OpenPoint["status"],
  { tone: "default" | "secondary" | "outline"; label: string }
> = {
  open: { tone: "outline", label: "Open" },
  answered: { tone: "secondary", label: "Client replied" },
  resolved: { tone: "default", label: "Resolved" },
};

const stripHtml = (html: string) => html.replace(/<[^>]*>/g, "").trim();

/** Internal authoring of client-facing open points (questions) + reply thread. */
export function OpenPointsPanel(scope: Scope) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const isInternal = role === "admin" || role === "employee";
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const key = ["open-points", scope];

  const { data, isLoading } = useQuery(openPointsForScopeQuery(scope));

  const create = useMutation({
    mutationFn: async () => {
      if (!user) return;
      await createOpenPoint(scope, { title: title.trim(), body, createdBy: user.id });
    },
    onSuccess: () => {
      toast.success("Open point raised");
      setOpen(false);
      setTitle("");
      setBody("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OpenPoint["status"] }) => {
      await setOpenPointStatus(id, status, user?.id ?? null);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteOpenPoint(id);
    },
    onSuccess: () => {
      toast.success("Open point deleted");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendReply = useMutation({
    mutationFn: async (pointId: string) => {
      if (!user) return;
      await addOpenPointReply(pointId, user.id, replyText.trim());
    },
    onSuccess: () => {
      setReplyFor(null);
      setReplyText("");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="h-full min-h-0 flex flex-col">
      <CardContent className="p-4 flex flex-col h-full min-h-0 gap-3">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-semibold">Open points</h3>
            <p className="text-xs text-muted-foreground">
              Questions for the client. They appear in the client portal and clients can reply.
            </p>
          </div>
          {isInternal && (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New point
            </Button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scroll-modern -mx-1 px-1">
          {isLoading ? (
            <Skeleton className="h-20" />
          ) : (data ?? []).length === 0 ? (
            <EmptyState
              title="No open points"
              description="Raise a question for the client here."
            />
          ) : (
            <div className="space-y-2">
              {(data ?? []).map((p) => (
                <div key={p.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{p.title}</span>
                        <Badge variant={STATUS[p.status].tone} className="text-[10px]">
                          {STATUS[p.status].label}
                        </Badge>
                      </div>
                      {p.body && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          <RichViewer html={p.body} />
                        </div>
                      )}
                    </div>
                    {isInternal && (
                      <div className="flex shrink-0 gap-1">
                        {p.status === "resolved" ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Reopen"
                            onClick={() => setStatus.mutate({ id: p.id, status: "open" })}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-emerald-600"
                            title="Mark resolved"
                            onClick={() => setStatus.mutate({ id: p.id, status: "resolved" })}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          title="Delete"
                          onClick={() => {
                            if (confirm("Delete this open point?")) remove.mutate(p.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {p.open_point_replies.length > 0 && (
                    <ul className="space-y-1.5 border-l-2 border-border pl-3">
                      {p.open_point_replies.map((r) => (
                        <li key={r.id} className="text-xs">
                          <div className="whitespace-pre-wrap break-words">{r.body}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {isInternal &&
                    p.status !== "resolved" &&
                    (replyFor === p.id ? (
                      <div className="flex items-end gap-2">
                        <Textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          rows={2}
                          className="text-sm"
                          placeholder="Reply to the client…"
                        />
                        <Button
                          size="sm"
                          disabled={!replyText.trim() || sendReply.isPending}
                          onClick={() => sendReply.mutate(p.id)}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => {
                          setReplyFor(p.id);
                          setReplyText("");
                        }}
                      >
                        Reply
                      </Button>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setTitle("");
              setBody("");
            }
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>New open point</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>
                  Question <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short summary of what you need…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Details</Label>
                <RichEditor
                  value={body}
                  onChange={setBody}
                  placeholder="Add any context for the client…"
                  minHeight={180}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? "Saving…" : "Raise point"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
