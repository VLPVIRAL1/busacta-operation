import { useMemo } from "react";
import { Paperclip, Link2 } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import type { ThreadListItem } from "@/lib/email/threads.functions";

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function senderLabel(t: ThreadListItem): string {
  const from = t.participants.find((p) => p.role === "from");
  if (from) return from.name || from.address;
  return t.participants[0]?.name || t.participants[0]?.address || "Unknown";
}

export function ThreadFeed({
  threads,
  selectedId,
  onSelect,
  isLoading,
}: {
  threads: ThreadListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
}) {
  const empty = !isLoading && threads.length === 0;

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading messages…</div>;
  }
  if (empty) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No messages in this folder. Try syncing your mailbox.
      </div>
    );
  }

  return (
    <ul role="listbox" aria-label="Email threads" className="divide-y">
      {threads.map((t) => (
        <ThreadRow
          key={t.id}
          thread={t}
          selected={selectedId === t.id}
          onSelect={() => onSelect(t.id)}
        />
      ))}
    </ul>
  );
}

function ThreadRow({
  thread,
  selected,
  onSelect,
}: {
  thread: ThreadListItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const unread = thread.unread_count > 0;
  const sender = useMemo(() => senderLabel(thread), [thread]);
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onSelect}
        className={cn(
          "w-full text-left px-3 py-2.5 flex flex-col gap-1 hover:bg-muted/60 transition-colors",
          selected && "bg-muted",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {unread && (
            <span aria-label="Unread" className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
          )}
          <span
            className={cn(
              "text-sm truncate flex-1 min-w-0",
              unread ? "font-semibold" : "text-foreground/90",
            )}
          >
            {sender}
          </span>
          {thread.message_count > 1 && (
            <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
              {thread.message_count}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
            {formatTime(thread.last_message_at)}
          </span>
        </div>
        <div
          className={cn("text-xs truncate", unread ? "text-foreground" : "text-muted-foreground")}
        >
          {thread.subject || "(no subject)"}
        </div>
        <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
          {thread.has_attachments && <Paperclip className="h-3 w-3 shrink-0" />}
          {thread.linked_count > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-primary/80">
              <Link2 className="h-3 w-3" /> {thread.linked_count}
            </span>
          )}
          <span className="truncate">{thread.snippet || ""}</span>
        </div>
      </button>
    </li>
  );
}
