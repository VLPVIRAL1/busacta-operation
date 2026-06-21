import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Link2, Loader2, Send, Trash2, KeyRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  createFileRequestLink,
  listFileRequestLinks,
  revokeFileRequestLink,
  rotateFileRequestPassword,
  type FileRequestLinkRow,
} from "@/lib/ops/file-requests.functions";

export function FileRequestDialog({
  taskId,
  open,
  onOpenChange,
}: {
  taskId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const queryKey = ["file-request-links", taskId];
  const listFn = useServerFn(listFileRequestLinks);
  const createFn = useServerFn(createFileRequestLink);
  const revokeFn = useServerFn(revokeFileRequestLink);
  const rotateFn = useServerFn(rotateFileRequestPassword);

  const [message, setMessage] = useState("");
  const [hours, setHours] = useState(168);
  // Map of link.id → freshly-generated password to display once.
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const { data: links, isLoading } = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { taskId } }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          taskId,
          message: message.trim() || undefined,
          expiresInHours: hours,
          maxUploads: 25,
        },
      }),
    onSuccess: (row) => {
      toast.success("Upload link created");
      setMessage("");
      setRevealed((prev) => ({ ...prev, [row.id]: (row as { password: string }).password }));
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Link revoked");
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rotate = useMutation({
    mutationFn: (id: string) => rotateFn({ data: { id } }),
    onSuccess: (r, id) => {
      toast.success("Password rotated");
      setRevealed((prev) => ({ ...prev, [id]: r.password }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function linkUrl(token: string) {
    if (typeof window === "undefined") return `/portal/upload/${token}`;
    return `${window.location.origin}/portal/upload/${token}`;
  }

  async function copyText(value: string, label = "Copied") {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label);
    } catch {
      toast.error("Couldn't copy — copy it manually.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Request files from client
          </DialogTitle>
          <DialogDescription>
            Creates a secure, password-protected link your client can use to upload documents — no
            account required. Share the link AND the one-time password with the client. Uploaded
            files land in this task's default folder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="frd-message">Message for the client (optional)</Label>
            <Textarea
              id="frd-message"
              rows={2}
              maxLength={500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please upload your bank statements for Q3…"
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="frd-hours">Expires in (hours)</Label>
              <Input
                id="frd-hours"
                type="number"
                min={1}
                max={720}
                value={hours}
                onChange={(e) => setHours(Math.max(1, Math.min(720, Number(e.target.value) || 1)))}
                className="w-32"
              />
            </div>
            <Button onClick={() => create.mutate()} disabled={create.isPending} className="ml-auto">
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Create link
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active links
          </div>
          {isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !links || links.length === 0 ? (
            <p className="text-sm text-muted-foreground">No links yet.</p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {links.map((l: FileRequestLinkRow) => {
                const expired = new Date(l.expires_at).getTime() < Date.now();
                const dead = !!l.revoked_at || expired || l.upload_count >= l.max_uploads;
                const pwd = revealed[l.id];
                return (
                  <li key={l.id} className="rounded-md border bg-card p-2 text-sm space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Input readOnly value={linkUrl(l.token)} className="h-8 text-xs font-mono" />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => copyText(linkUrl(l.token), "Link copied")}
                        title="Copy link"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {!l.revoked_at && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => revoke.mutate(l.id)}
                          title="Revoke"
                          disabled={revoke.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {l.has_password && (
                      <div className="flex items-center gap-2 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-1">
                        <KeyRound className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300" />
                        {pwd ? (
                          <>
                            <code className="flex-1 text-xs font-mono tracking-wider">{pwd}</code>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => copyText(pwd, "Password copied")}
                              title="Copy password"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </>
                        ) : (
                          <span className="flex-1 text-[11px] text-muted-foreground italic">
                            Password set — shown only once. Rotate to generate a new one.
                          </span>
                        )}
                        {!l.revoked_at && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => rotate.mutate(l.id)}
                            disabled={rotate.isPending}
                            title="Rotate password"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {l.upload_count}/{l.max_uploads} uploads
                      </span>
                      <span>·</span>
                      <span>
                        {l.revoked_at
                          ? "Revoked"
                          : expired
                            ? "Expired"
                            : `Expires ${new Date(l.expires_at).toLocaleString()}`}
                      </span>
                      {l.message && <span className="italic">"{l.message}"</span>}
                      {dead && <span className="font-medium text-destructive">inactive</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
