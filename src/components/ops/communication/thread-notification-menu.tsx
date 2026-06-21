import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, AtSign, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/shared/utils";

type Level = "all" | "mentions" | "none";
type Kind = "dm" | "group" | "task" | "chat";

interface Pref {
  level: Level;
  muted_until: string | null;
}

export function ThreadNotificationMenu({ kind, threadId }: { kind: Kind; threadId: string }) {
  const [open, setOpen] = useState(false);
  const [pref, setPref] = useState<Pref>({ level: "all", muted_until: null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_thread_pref", {
        _kind: kind,
        _thread_id: threadId,
      });
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : null;
      if (row) {
        setPref({
          level: (row.level as Level) ?? "all",
          muted_until: (row.muted_until as string | null) ?? null,
        });
      } else {
        setPref({ level: "all", muted_until: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, threadId, open]);

  const isMuted = !!pref.muted_until && new Date(pref.muted_until).getTime() > Date.now();

  const save = async (level: Level, muted_until: string | null) => {
    // Optimistic update — apply instantly, roll back on error.
    const previous = pref;
    setPref({ level, muted_until });
    setLoading(true);
    try {
      const { error } = await supabase.rpc("set_thread_pref", {
        _kind: kind,
        _thread_id: threadId,
        _level: level,
        ...(muted_until ? { _muted_until: muted_until } : {}),
      });
      if (error) throw error;
      toast.success("Notification preference updated");
      setOpen(false);
    } catch (e) {
      setPref(previous); // rollback
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const muteFor = (hours: number) => {
    const d = new Date(Date.now() + hours * 3600 * 1000);
    return d.toISOString();
  };
  const muteUntilTomorrow = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  };

  const Icon = isMuted
    ? BellOff
    : pref.level === "none"
      ? BellOff
      : pref.level === "mentions"
        ? AtSign
        : Bell;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-7 p-0"
          title="Notifications for this conversation"
          aria-label="Notification settings"
        >
          <Icon className={cn("h-3.5 w-3.5", isMuted && "text-muted-foreground")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1.5" align="end">
        <div className="px-2 pt-1.5 pb-1 text-[11px] font-semibold text-muted-foreground">
          Notify me about
        </div>
        <MenuRow
          icon={<BellRing className="h-3.5 w-3.5" />}
          label="All messages"
          active={pref.level === "all" && !isMuted}
          disabled={loading}
          onClick={() => save("all", null)}
        />
        <MenuRow
          icon={<AtSign className="h-3.5 w-3.5" />}
          label="Mentions only"
          active={pref.level === "mentions" && !isMuted}
          disabled={loading}
          onClick={() => save("mentions", null)}
        />
        <MenuRow
          icon={<BellOff className="h-3.5 w-3.5" />}
          label="Nothing"
          active={pref.level === "none" && !isMuted}
          disabled={loading}
          onClick={() => save("none", null)}
        />

        <Separator className="my-1.5" />
        <div className="px-2 pb-1 text-[11px] font-semibold text-muted-foreground">Mute for</div>
        <MenuRow label="1 hour" disabled={loading} onClick={() => save(pref.level, muteFor(1))} />
        <MenuRow label="8 hours" disabled={loading} onClick={() => save(pref.level, muteFor(8))} />
        <MenuRow
          label="Until tomorrow 9am"
          disabled={loading}
          onClick={() => save(pref.level, muteUntilTomorrow())}
        />
        {isMuted && (
          <>
            <Separator className="my-1.5" />
            <MenuRow label="Unmute" disabled={loading} onClick={() => save(pref.level, null)} />
            <div className="px-2 pb-1 pt-0.5 text-[10px] text-muted-foreground">
              Muted until {new Date(pref.muted_until!).toLocaleString()}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function MenuRow({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50",
        active && "bg-muted font-medium",
      )}
    >
      {icon ?? <span className="w-3.5" />}
      <span className="flex-1 truncate">{label}</span>
      {active && <Check className="h-3 w-3 text-primary" />}
    </button>
  );
}
