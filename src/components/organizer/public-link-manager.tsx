import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Link2, Loader2, Plus, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  createPublicLink,
  deletePublicLink,
  listPublicLinks,
  revokePublicLink,
} from "@/lib/organizer/public-links.functions";

function publicUrl(token: string): string {
  if (typeof window === "undefined") return `/o/${token}`;
  return `${window.location.origin}/o/${token}`;
}

export function PublicLinkManagerDialog({
  templateId,
  templateName,
  open,
  onOpenChange,
}: {
  templateId: string;
  templateName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listPublicLinks);
  const create = useServerFn(createPublicLink);
  const revoke = useServerFn(revokePublicLink);
  const del = useServerFn(deletePublicLink);

  const linksQ = useQuery({
    queryKey: ["organizer", "public-links", templateId],
    queryFn: () => list({ data: { template_id: templateId } }),
    enabled: open,
  });

  const [label, setLabel] = useState("");
  const [requireIdentity, setRequireIdentity] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const [maxSubs, setMaxSubs] = useState("");
  const [password, setPassword] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          template_id: templateId,
          label: label.trim() || null,
          require_identity: requireIdentity,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          max_submissions: maxSubs ? Number(maxSubs) : null,
          password: password.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Public link created");
      setLabel("");
      setExpiresAt("");
      setMaxSubs("");
      setPassword("");
      qc.invalidateQueries({
        queryKey: ["organizer", "public-links", templateId],
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      toast.success("Link revoked");
      qc.invalidateQueries({
        queryKey: ["organizer", "public-links", templateId],
      });
    },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Link deleted");
      qc.invalidateQueries({
        queryKey: ["organizer", "public-links", templateId],
      });
    },
  });

  const links = useMemo(() => linksQ.data?.links ?? [], [linksQ.data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Public share links
          </DialogTitle>
          <DialogDescription>
            Generate a shareable URL for "{templateName}" — perfect for clients who don't yet have a
            BusAcTa Operations account.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label>Label (internal)</Label>
            <Input
              placeholder="e.g. Q1 2026 onboarding link"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Expires at (optional)</Label>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Max submissions (optional)</Label>
            <Input
              type="number"
              min={1}
              placeholder="Unlimited"
              value={maxSubs}
              onChange={(e) => setMaxSubs(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Password (optional)</Label>
            <Input
              type="text"
              placeholder="At least 4 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label className="text-sm">Ask for name & email</Label>
              <p className="text-xs text-muted-foreground">Captures who filled it in.</p>
            </div>
            <Switch checked={requireIdentity} onCheckedChange={setRequireIdentity} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-1" />
            )}
            Create link
          </Button>
        </div>

        <Separator />

        <div>
          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Active & past links
          </Label>
          <ScrollArea className="h-64 mt-1 rounded-md border">
            {linksQ.isLoading ? (
              <p className="p-3 text-sm text-muted-foreground">Loading…</p>
            ) : links.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No public links yet.</p>
            ) : (
              <ul className="divide-y">
                {links.map((l) => {
                  const url = publicUrl(l.token);
                  const isRevoked = !!l.revoked_at;
                  const isExpired = l.expires_at && new Date(l.expires_at).getTime() < Date.now();
                  const isFull =
                    l.max_submissions !== null && l.submission_count >= l.max_submissions;
                  const active = !isRevoked && !isExpired && !isFull;
                  return (
                    <li key={l.id} className="p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {l.label || "Untitled link"}
                            </span>
                            <Badge
                              variant={active ? "default" : "secondary"}
                              className="text-[10px]"
                            >
                              {isRevoked
                                ? "Revoked"
                                : isExpired
                                  ? "Expired"
                                  : isFull
                                    ? "Full"
                                    : "Active"}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {l.submission_count} submission
                              {l.submission_count === 1 ? "" : "s"}
                              {l.max_submissions !== null ? ` / ${l.max_submissions}` : ""}
                            </span>
                          </div>
                          <code className="block truncate text-[11px] text-muted-foreground">
                            {url}
                          </code>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Copy URL"
                          onClick={() => {
                            navigator.clipboard.writeText(url);
                            toast.success("Copied");
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {active && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Revoke"
                            onClick={() => revokeMut.mutate(l.id)}
                          >
                            <ShieldOff className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Delete"
                          onClick={() => delMut.mutate(l.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                      {(l.expires_at || l.password_hash) && (
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {l.expires_at && (
                            <span>Expires {new Date(l.expires_at).toLocaleString()}</span>
                          )}
                          {l.password_hash && (
                            <span className="inline-flex items-center gap-1">
                              <Check className="h-3 w-3" /> Password-protected
                            </span>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
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

export function PublicLinkManagerButton({
  templateId,
  templateName,
  size = "sm",
  variant = "ghost",
}: {
  templateId: string;
  templateName: string;
  size?: "sm" | "icon" | "default";
  variant?: "ghost" | "outline" | "default" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size={size}
        variant={variant}
        onClick={() => setOpen(true)}
        title="Public share links"
        aria-label="Public share links"
      >
        <Link2 className="h-4 w-4" />
      </Button>
      {open && (
        <PublicLinkManagerDialog
          templateId={templateId}
          templateName={templateName}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}
