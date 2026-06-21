import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCircle2, AlertCircle, Calendar } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { cn } from "@/lib/shared/utils";
import {
  fetchPublicReminderOwner,
  submitPublicReminder,
} from "@/lib/queries/global-dashboard.queries";

export const Route = createFileRoute("/r/$token")({
  component: PublicReminderPage,
});

function PublicReminderPage() {
  const { token } = Route.useParams();

  const { data: owner, isLoading } = useQuery({
    queryKey: ["public-reminder-owner", token],
    queryFn: () => fetchPublicReminderOwner(token),
    retry: false,
  });

  const [senderName, setSenderName] = useState("");
  const [body, setBody] = useState("");
  const [remindAt, setRemindAt] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      let remindIso: string | null = null;
      if (remindAt) {
        const [h, m] = time.split(":").map(Number);
        const d = new Date(remindAt);
        d.setHours(h || 9, m || 0, 0, 0);
        remindIso = d.toISOString();
      }
      await submitPublicReminder({
        token,
        body: body.trim(),
        bodyRich: null,
        senderName: senderName.trim(),
        remindAt: remindIso,
      });
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!owner) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-rose-500" />
        <h1 className="text-xl font-semibold">Link not found</h1>
        <p className="text-sm text-muted-foreground">
          This link may have been revoked or doesn't exist.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
        <h1 className="text-xl font-semibold">Reminder sent!</h1>
        <p className="text-sm text-muted-foreground">
          {owner.owner_name} will see your reminder in their inbox.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-md">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/15">
            <Bell className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">
              Send a reminder to {owner.owner_name}
            </h1>
            {owner.label && <p className="text-xs text-muted-foreground">{owner.label}</p>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sender">Your name</Label>
            <Input
              id="sender"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Your name (optional)"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="body">
              Reminder <span className="text-rose-500">*</span>
            </Label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What should they be reminded of?"
              rows={3}
              required
              className={cn(
                "w-full resize-none rounded-md border bg-background px-3 py-2 text-sm",
                "focus:outline-none focus:ring-2 focus:ring-ring",
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label>When (optional)</Label>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {remindAt ? format(remindAt, "MMM d, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarPicker
                    mode="single"
                    selected={remindAt}
                    onSelect={setRemindAt}
                    className="p-3 pointer-events-auto"
                  />
                  <div className="border-t p-2">
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </PopoverContent>
              </Popover>
              {remindAt && (
                <button
                  type="button"
                  onClick={() => setRemindAt(undefined)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {err && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
              {err}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy || !body.trim()}>
            {busy ? "Sending…" : "Send reminder"}
          </Button>
        </form>
      </div>
    </div>
  );
}
