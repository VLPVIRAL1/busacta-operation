import { useEffect, useMemo, useState } from "react";
import { Laptop, MonitorSmartphone, AlertTriangle, LogOut, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ActiveDevice } from "@/lib/auth/device-id";
import { formatDistanceToNow } from "date-fns";

interface Props {
  open: boolean;
  devices: ActiveDevice[];
  newDeviceLabel: string;
  onRevokeAndContinue: (deviceIdToRevoke: string) => Promise<void> | void;
  onCancel: () => void;
  pending?: boolean;
}

function summarizeUA(ua: string | null | undefined): string {
  if (!ua) return "Unknown browser";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X|Macintosh/.test(ua)
      ? "macOS"
      : /iPhone|iPad|iOS/.test(ua)
        ? "iOS"
        : /Android/.test(ua)
          ? "Android"
          : /Linux/.test(ua)
            ? "Linux"
            : "Unknown OS";
  return `${browser} · ${os}`;
}

export function DeviceLimitDialog({
  open,
  devices,
  newDeviceLabel,
  onRevokeAndContinue,
  onCancel,
  pending,
}: Props) {
  // Preselect the oldest active device so the primary button is enabled on mount.
  const oldestId = useMemo(() => {
    if (!devices.length) return null;
    return (
      [...devices].sort((a, b) => (a.last_seen_at < b.last_seen_at ? -1 : 1))[0]?.device_id ?? null
    );
  }, [devices]);
  const [picked, setPicked] = useState<string | null>(oldestId);
  useEffect(() => {
    setPicked(oldestId);
  }, [oldestId]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !pending) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <span className="truncate">You're already signed in on 3 devices</span>
          </DialogTitle>
          <DialogDescription>
            Each user can be signed in on up to 3 computers at a time. To finish signing in on{" "}
            <span className="font-semibold text-foreground">{newDeviceLabel}</span>, pick a device
            below to sign out.
          </DialogDescription>
        </DialogHeader>

        <ul
          className="space-y-2 max-h-[50vh] overflow-y-auto pr-1"
          role="radiogroup"
          aria-label="Active devices"
        >
          {devices.map((d) => {
            const selected = picked === d.device_id;
            const last = (() => {
              try {
                return formatDistanceToNow(new Date(d.last_seen_at), { addSuffix: true });
              } catch {
                return "recently";
              }
            })();
            const summary = summarizeUA(d.user_agent);
            const isMobile = /iphone|android|mobile/i.test(d.user_agent ?? "");
            return (
              <li key={d.device_id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={pending}
                  onClick={() => setPicked(d.device_id)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left overflow-hidden transition ${
                    selected
                      ? "border-primary ring-2 ring-primary/40 bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-accent"
                  }`}
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                    {isMobile ? (
                      <MonitorSmartphone className="h-4 w-4" aria-hidden />
                    ) : (
                      <Laptop className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="truncate text-sm font-semibold">
                        {d.label ?? "Unknown device"}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {summary}
                      </span>
                      {selected && (
                        <Badge variant="secondary" className="gap-1">
                          <Check className="h-3 w-3" />
                          Will sign out
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      Last active {last}
                      {d.last_ip ? ` · ${d.last_ip}` : ""}
                    </div>
                    {d.user_agent && (
                      <details
                        className="mt-1.5 text-[11px] text-muted-foreground/80"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <summary className="cursor-pointer select-none hover:text-foreground">
                          Show technical details
                        </summary>
                        <div className="mt-1 rounded bg-muted/60 p-2 font-mono break-all">
                          {d.user_agent}
                        </div>
                      </details>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <DialogFooter className="flex-wrap justify-end gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Dismiss
          </Button>
          <Button
            type="button"
            onClick={() => picked && onRevokeAndContinue(picked)}
            disabled={!picked || pending}
          >
            <LogOut className="mr-1.5 h-4 w-4" />
            {pending ? "Switching…" : "Sign out other device"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
