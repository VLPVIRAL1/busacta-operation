import { useEffect, useMemo, useState } from "react";
import { Loader2, Square } from "lucide-react";
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

/**
 * Blueprint: Hourly projects bill from "Effective Hours", not raw elapsed time.
 * When stopping a timer, the employee confirms the effective hours billed
 * for this session. Default = elapsed (rounded to nearest minute) so the
 * dialog is a one-click confirm for typical sessions.
 */
export function EffectiveHoursStopDialog({
  open,
  onOpenChange,
  startedAt,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  startedAt: string | undefined;
  pending: boolean;
  onConfirm: (effectiveMinutes: number) => void;
}) {
  const elapsedMin = useMemo(() => {
    if (!startedAt) return 0;
    return Math.max(1, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  }, [startedAt, open]);

  const [hours, setHours] = useState<string>("");
  const [minutes, setMinutes] = useState<string>("");

  useEffect(() => {
    if (open) {
      const h = Math.floor(elapsedMin / 60);
      const m = elapsedMin % 60;
      setHours(String(h));
      setMinutes(String(m));
    }
  }, [open, elapsedMin]);

  const totalMin = Math.max(0, (Number(hours) || 0) * 60 + (Number(minutes) || 0));
  const valid = totalMin >= 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!pending) onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm effective hours</DialogTitle>
          <DialogDescription>
            Hourly projects are invoiced from <strong>Effective Hours</strong> — not raw elapsed
            time. Confirm what should be billed for this session.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="eff-h">Hours</Label>
            <Input
              id="eff-h"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="eff-m">Minutes</Label>
            <Input
              id="eff-m"
              type="number"
              min="0"
              max="59"
              step="1"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Elapsed: {Math.floor(elapsedMin / 60)}h {elapsedMin % 60}m. Adjust if you took breaks or
          paused work.
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(totalMin)}
            disabled={pending || !valid}
            className="gap-2"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
            Stop &amp; Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
