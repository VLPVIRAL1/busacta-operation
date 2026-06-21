import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

/**
 * Inline editor for a time_logs row's break + effective minutes.
 * Effective minutes default to (duration - break); admins/employees can override.
 */
export function EffectiveEditPopover({
  logId,
  durationMinutes,
  breakMinutes,
  effectiveOverride,
  invalidateKeys = [],
}: {
  logId: string;
  durationMinutes: number | null;
  breakMinutes: number;
  effectiveOverride: number | null;
  invalidateKeys?: unknown[][];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const dur = durationMinutes ?? 0;
  const computed = Math.max(dur - (breakMinutes ?? 0), 0);
  const [breakM, setBreakM] = useState(String(breakMinutes ?? 0));
  const [effM, setEffM] = useState(String(effectiveOverride ?? computed));

  // Bidirectional sync: editing one auto-updates the other so they always sum to the tracked duration.
  const onBreakChange = (raw: string) => {
    setBreakM(raw);
    const b = Math.max(0, Math.min(dur, Math.round(Number(raw) || 0)));
    const e = Math.max(0, dur - b);
    setEffM(String(e));
  };
  const onEffChange = (raw: string) => {
    setEffM(raw);
    const e = Math.max(0, Math.min(dur, Math.round(Number(raw) || 0)));
    const b = Math.max(0, dur - e);
    setBreakM(String(b));
  };

  const save = useMutation({
    mutationFn: async () => {
      const b = Math.max(0, Math.round(Number(breakM) || 0));
      const e = Math.max(0, Math.round(Number(effM) || 0));
      const expected = Math.max(dur - b, 0);
      const patch: Record<string, unknown> = { break_minutes: b };
      // Only set override if user changed it from the auto-computed value
      patch.effective_override = e === expected ? null : e;
      const { error } = await supabase
        .from("time_logs")
        .update(patch as never)
        .eq("id", logId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Effective time updated");
      setOpen(false);
      for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: k });
      qc.invalidateQueries({ queryKey: ["time-logs"] });
      qc.invalidateQueries({ queryKey: ["task-time-sheet"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="h-6 w-6">
          <Pencil className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="end">
        <div className="text-xs font-semibold">Adjust effective time</div>
        <div className="grid gap-2">
          <div>
            <Label className="text-[11px]">Tracked duration</Label>
            <div className="text-sm font-mono tabular-nums">
              {(dur / 60).toFixed(2)}h ({dur} min)
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Break (minutes)</Label>
            <Input
              type="number"
              min={0}
              max={dur}
              value={breakM}
              onChange={(e) => onBreakChange(e.target.value)}
              className="h-8"
            />
          </div>
          <div>
            <Label className="text-[11px]">Effective (minutes)</Label>
            <Input
              type="number"
              min={0}
              max={dur}
              value={effM}
              onChange={(e) => onEffChange(e.target.value)}
              className="h-8"
            />
            <div className="text-[10px] text-muted-foreground mt-1">
              Break + Effective always equals tracked ({dur} min). Editing one updates the other.
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-3 w-3 animate-spin" />} Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
