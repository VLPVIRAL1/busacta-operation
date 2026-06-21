import { useEffect, useMemo, useState } from "react";
import {
  Laptop,
  MonitorSmartphone,
  Check,
  LogOut,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import type { ActiveDeviceDTO } from "@/lib/auth/active-devices.functions";

interface Props {
  open: boolean;
  currentDeviceId: string;
  currentDeviceLabel: string;
  devices: ActiveDeviceDTO[];
  defaultPickedId: string | null;
  pending?: boolean;
  /** True while devices are being fetched (first paint of the dialog). */
  loading?: boolean;
  /** Non-null when device fetch failed; user can retry. */
  loadError?: string | null;
  onRetry?: () => Promise<void> | void;
  /** Called when the user confirms; `revokeIds` are other sessions to sign out. */
  onContinue: (keepDeviceId: string, revokeIds: string[]) => Promise<void> | void;
  onCancel: () => Promise<void> | void;
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

export function MultiLoginScreen({
  open,
  currentDeviceId,
  currentDeviceLabel,
  devices,
  defaultPickedId,
  pending,
  loading,
  loadError,
  onRetry,
  onContinue,
  onCancel,
}: Props) {
  const [picked, setPicked] = useState<string | null>(defaultPickedId);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    setPicked(defaultPickedId);
  }, [defaultPickedId]);

  const sortedDevices = useMemo(
    () =>
      [...devices].sort((a, b) => {
        if (a.device_id === currentDeviceId) return -1;
        if (b.device_id === currentDeviceId) return 1;
        return a.last_seen_at < b.last_seen_at ? 1 : -1;
      }),
    [devices, currentDeviceId],
  );

  const otherCount = sortedDevices.filter((d) => d.device_id !== currentDeviceId).length;
  const onlyMe = !loading && !loadError && sortedDevices.length <= 1;
  const pickedIsCurrent = picked === currentDeviceId;

  // Auto-continue when there are no other sessions to choose from.
  useEffect(() => {
    if (!open || !onlyMe || pending) return;
    const t = window.setTimeout(() => {
      void onContinue(currentDeviceId, []);
    }, 800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onlyMe, currentDeviceId, pending]);

  const handleContinue = async () => {
    if (!picked) return;
    const revokeIds = pickedIsCurrent
      ? sortedDevices.filter((d) => d.device_id !== currentDeviceId).map((d) => d.device_id)
      : [];
    await onContinue(picked, revokeIds);
  };

  const requestCancel = () => {
    if (pending) return;
    setConfirmCancel(true);
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) requestCancel();
        }}
      >
        <DialogContent
          className="sm:max-w-xl overflow-hidden"
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            requestCancel();
          }}
          onInteractOutside={(e) => {
            e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate">Choose how to continue</span>
            </DialogTitle>
            <DialogDescription id="multi-login-desc">
              {loading ? (
                <>Loading your active sessions…</>
              ) : loadError ? (
                <>Couldn't load your other sessions — you can continue on this device.</>
              ) : onlyMe ? (
                <>
                  Signing you in on{" "}
                  <span className="font-semibold text-foreground">{currentDeviceLabel}</span>…
                </>
              ) : (
                <>
                  You're already signed in on {otherCount} other session
                  {otherCount === 1 ? "" : "s"}. Pick the one you want to keep using.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="space-y-2 py-2" aria-busy="true" aria-live="polite">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <Skeleton className="h-9 w-9 rounded-md" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {loadError && !loading && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Sessions unavailable</AlertTitle>
              <AlertDescription className="flex flex-col gap-2">
                <span className="text-xs opacity-90">{loadError}</span>
                {onRetry && (
                  <div>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => void onRetry()}
                      disabled={pending}
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      Retry
                    </Button>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {!loading && !loadError && onlyMe && (
            <div
              className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
              aria-live="polite"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Taking you to your dashboard…
            </div>
          )}

          {!loading && !loadError && !onlyMe && (
            <>
              <ul
                className="space-y-2 max-h-[50vh] overflow-y-auto pr-1"
                role="radiogroup"
                aria-label="Active sessions"
              >
                {sortedDevices.map((d) => {
                  const selected = picked === d.device_id;
                  const isCurrent = d.device_id === currentDeviceId;
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
                        className={`group flex w-full items-start gap-3 rounded-lg border p-3 text-left overflow-hidden transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
                          selected
                            ? "border-primary ring-2 ring-primary/40 bg-primary/5"
                            : "border-border hover:border-primary/50 hover:bg-accent"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
                            selected
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/40 bg-background"
                          }`}
                          aria-hidden
                        >
                          {selected && (
                            <span className="h-2 w-2 rounded-full bg-primary-foreground" />
                          )}
                        </span>
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
                            {isCurrent && (
                              <Badge variant="outline" className="gap-1 text-[10px]">
                                This computer
                              </Badge>
                            )}
                            {selected && (
                              <Badge variant="secondary" className="gap-1">
                                <Check className="h-3 w-3" />
                                {isCurrent ? "Continue here" : "Keep that session"}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            Last active {last}
                            {d.last_ip ? ` · ${d.last_ip}` : ""}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {picked && (
                <p className="text-xs text-muted-foreground pt-1" aria-live="polite">
                  {pickedIsCurrent
                    ? `Continuing here will sign out ${otherCount} other session${otherCount === 1 ? "" : "s"}.`
                    : "This browser will be signed out — your other session keeps working."}
                </p>
              )}
            </>
          )}

          <DialogFooter className="flex-wrap justify-end gap-2 sm:gap-2">
            {(loadError || (!loading && !onlyMe)) && (
              <Button type="button" variant="ghost" onClick={requestCancel} disabled={pending}>
                Cancel sign-in
              </Button>
            )}
            {loadError && (
              <Button
                type="button"
                onClick={() => void onContinue(currentDeviceId, [])}
                disabled={pending}
              >
                {pending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="mr-1.5 h-4 w-4" />
                )}
                Continue on this device
              </Button>
            )}
            {!loading && !loadError && !onlyMe && (
              <Button type="button" onClick={handleContinue} disabled={!picked || pending}>
                {pickedIsCurrent ? (
                  <>
                    <LogOut className="mr-1.5 h-4 w-4" />
                    {pending
                      ? "Continuing…"
                      : `Continue here${otherCount > 0 ? ` & sign out ${otherCount} other${otherCount === 1 ? "" : "s"}` : ""}`}
                  </>
                ) : (
                  <>
                    <Check className="mr-1.5 h-4 w-4" />
                    {pending ? "Switching…" : "Switch to that session"}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel sign-in?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll be signed out of this browser. You can sign in again any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmCancel(false);
                void onCancel();
              }}
            >
              Yes, cancel sign-in
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
