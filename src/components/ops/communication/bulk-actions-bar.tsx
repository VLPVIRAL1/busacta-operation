import { useState } from "react";
import { Archive, BellOff, CheckCheck, MailOpen, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import { useInboxSelection } from "./inbox-selection-context";
import {
  useToggleArchive,
  useMarkUnread,
  useSetNotificationPref,
  type InboxKind,
} from "@/lib/ops/communication.queries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function BulkActionsBar() {
  const { count, selected, clear, enabled } = useInboxSelection();
  const archive = useToggleArchive();
  const markUnread = useMarkUnread();
  const setPref = useSetNotificationPref();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  if (!enabled || count === 0) return null;

  const items = Array.from(selected.values());

  const runAll = async (
    label: string,
    fn: (it: { kind: InboxKind; id: string }) => Promise<unknown>,
  ) => {
    setBusy(label);
    try {
      const results = await Promise.allSettled(items.map(fn));
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const fail = results.length - ok;
      toast[fail ? "warning" : "success"](
        `${label}: ${ok}/${results.length}${fail ? ` (${fail} failed)` : ""}`,
      );
      clear();
    } finally {
      setBusy(null);
    }
  };

  const onArchive = () =>
    runAll("Archived", (it) => archive.mutateAsync({ kind: it.kind, targetId: it.id }));

  const onMarkRead = () =>
    runAll("Marked read", (it) =>
      markUnread.mutateAsync({ kind: it.kind, targetId: it.id, unread: false }),
    );

  const onMarkUnread = () =>
    runAll("Marked unread", (it) =>
      markUnread.mutateAsync({ kind: it.kind, targetId: it.id, unread: true }),
    );

  const onMute = () =>
    runAll("Muted", (it) =>
      setPref.mutateAsync({ kind: it.kind, targetId: it.id, level: "muted" }),
    );

  const onMarkSeen = async () => {
    setBusy("Marked seen");
    try {
      const now = new Date().toISOString();
      for (const it of items) {
        if (it.kind === "task") {
          await supabase
            .from("message_reads")
            .upsert(
              { user_id: user!.id, scope: "task", scope_id: it.id, last_read_at: now },
              { onConflict: "user_id,scope,scope_id" },
            );
        } else {
          await supabase
            .from("chat_thread_members")
            .update({ last_read_at: now })
            .eq("thread_id", it.id)
            .eq("user_id", user!.id);
        }
      }
      qc.invalidateQueries({ queryKey: ["inbox"] });
      toast.success(`Cleared unread for ${items.length}`);
      clear();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const Btn = ({
    onClick,
    icon: Icon,
    label,
    danger,
  }: {
    onClick: () => void;
    icon: typeof Archive;
    label: string;
    danger?: boolean;
  }) => (
    <Button
      size="sm"
      variant="ghost"
      onClick={onClick}
      disabled={busy !== null}
      className={cn("h-7 gap-1 px-2 text-xs", danger && "text-destructive hover:text-destructive")}
    >
      {busy === label ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
      {label}
    </Button>
  );

  return (
    <div className="flex items-center gap-1 border-b bg-primary/5 px-2 py-1.5 text-xs">
      <span className="font-medium">{count} selected</span>
      <div className="ml-2 flex flex-wrap items-center gap-0.5">
        <Btn onClick={onMarkSeen} icon={CheckCheck} label="Mark seen" />
        <Btn onClick={onMarkRead} icon={CheckCheck} label="Marked read" />
        <Btn onClick={onMarkUnread} icon={MailOpen} label="Marked unread" />
        <Btn onClick={onMute} icon={BellOff} label="Muted" />
        <Btn onClick={onArchive} icon={Archive} label="Archived" />
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={clear}
        className="ml-auto h-7 w-7"
        title="Clear selection"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
