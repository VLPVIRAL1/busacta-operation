import { BellOff, Bell, AtSign, Clock, MailMinus, MailPlus, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useMarkUnread,
  useSetNotificationPref,
  useSnoozeThread,
  type InboxRow,
  type NotifLevel,
  type SnoozePreset,
} from "@/lib/ops/communication.queries";

const SNOOZE_PRESETS: Array<{ id: SnoozePreset; label: string }> = [
  { id: "1h", label: "1 hour" },
  { id: "3h", label: "3 hours" },
  { id: "tomorrow", label: "Tomorrow 9 AM" },
  { id: "next_week", label: "Next Monday" },
];

const NOTIF_LEVELS: Array<{ id: NotifLevel; label: string; icon: React.ReactNode }> = [
  { id: "all", label: "All messages", icon: <Bell className="h-3.5 w-3.5" /> },
  { id: "mentions", label: "Mentions only", icon: <AtSign className="h-3.5 w-3.5" /> },
  { id: "muted", label: "Muted", icon: <BellOff className="h-3.5 w-3.5" /> },
];

export function RowActionsMenu({ row }: { row: InboxRow }) {
  const snooze = useSnoozeThread();
  const pref = useSetNotificationPref();
  const mark = useMarkUnread();
  const snoozed = !!row.snoozedUntil;
  const forcedUnread = row.unread > 0; // visual hint only

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={(e) => e.stopPropagation()}
          aria-label="Row actions"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
          {row.title}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={() => mark.mutate({ kind: row.kind, targetId: row.id, unread: !forcedUnread })}
        >
          {forcedUnread ? (
            <>
              <MailMinus className="h-3.5 w-3.5 mr-2" /> Mark as read
            </>
          ) : (
            <>
              <MailPlus className="h-3.5 w-3.5 mr-2" /> Mark as unread
            </>
          )}
        </DropdownMenuItem>

        {snoozed ? (
          <DropdownMenuItem
            onSelect={() => snooze.mutate({ kind: row.kind, targetId: row.id, until: null })}
          >
            <Clock className="h-3.5 w-3.5 mr-2" /> Unsnooze
          </DropdownMenuItem>
        ) : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Clock className="h-3.5 w-3.5 mr-2" /> Snooze…
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {SNOOZE_PRESETS.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={() => snooze.mutate({ kind: row.kind, targetId: row.id, preset: p.id })}
                >
                  {p.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            {row.notificationLevel === "muted" ? (
              <BellOff className="h-3.5 w-3.5 mr-2" />
            ) : row.notificationLevel === "mentions" ? (
              <AtSign className="h-3.5 w-3.5 mr-2" />
            ) : (
              <Bell className="h-3.5 w-3.5 mr-2" />
            )}
            Notifications
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {NOTIF_LEVELS.map((l) => (
              <DropdownMenuItem
                key={l.id}
                onSelect={() => pref.mutate({ kind: row.kind, targetId: row.id, level: l.id })}
                className={row.notificationLevel === l.id ? "bg-accent" : ""}
              >
                <span className="mr-2">{l.icon}</span>
                {l.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
