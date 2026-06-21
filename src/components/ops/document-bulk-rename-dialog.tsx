import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/shared/utils";
import { AlertTriangle } from "lucide-react";

type Item = { id: string; filename: string };
type Mode = "replace" | "prefix" | "suffix";

export function DocumentBulkRenameDialog({
  open,
  onOpenChange,
  items,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Item[];
  onConfirm: (renames: Array<{ fileId: string; name: string }>) => void;
}) {
  const [mode, setMode] = useState<Mode>("replace");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [affix, setAffix] = useState("");
  const [onlyChanges, setOnlyChanges] = useState(true);

  const findRef = useRef<HTMLInputElement>(null);
  const affixRef = useRef<HTMLInputElement>(null);

  // Autofocus appropriate input when opening or switching mode.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (mode === "replace") findRef.current?.focus();
      else affixRef.current?.focus();
    }, 30);
    return () => clearTimeout(t);
  }, [open, mode]);

  const renames = useMemo(() => {
    return items.map((it) => {
      let next = it.filename;
      if (mode === "replace") {
        if (find) {
          const safe = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          next = it.filename.split(new RegExp(safe, "g")).join(replace);
        }
      } else if (mode === "prefix" && affix) {
        next = affix + it.filename;
      } else if (mode === "suffix" && affix) {
        const dot = it.filename.lastIndexOf(".");
        next =
          dot > 0
            ? it.filename.slice(0, dot) + affix + it.filename.slice(dot)
            : it.filename + affix;
      }
      return { fileId: it.id, oldName: it.filename, name: next };
    });
  }, [items, mode, find, replace, affix]);

  // Detect collisions (case-insensitive): two distinct rows ending at the same name.
  const collisionSet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of renames) {
      const k = r.name.trim().toLowerCase();
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const s = new Set<string>();
    for (const [k, n] of counts) if (n > 1) s.add(k);
    return s;
  }, [renames]);

  const classified = renames.map((r) => {
    const trimmed = r.name.trim();
    const blank = trimmed.length === 0;
    const changed = !blank && r.name !== r.oldName;
    const collides = !blank && collisionSet.has(trimmed.toLowerCase());
    return { ...r, blank, changed, collides };
  });

  const changedCount = classified.filter((r) => r.changed && !r.collides).length;
  const unchangedCount = classified.filter((r) => !r.changed && !r.blank).length;
  const blankCount = classified.filter((r) => r.blank).length;
  const collisionCount = classified.filter((r) => r.collides).length;

  const visible = onlyChanges
    ? classified.filter((r) => r.changed || r.collides || r.blank)
    : classified;
  const canApply = changedCount > 0 && collisionCount === 0;

  const apply = () => {
    if (!canApply) return;
    onConfirm(
      classified
        .filter((r) => r.changed && !r.collides)
        .map(({ fileId, name }) => ({ fileId, name })),
    );
  };

  // Keyboard: Enter applies (if not in textarea), Cmd/Ctrl+Enter always applies.
  const onDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const target = e.target as HTMLElement;
      const isTextarea = target.tagName === "TEXTAREA";
      if (e.metaKey || e.ctrlKey || !isTextarea) {
        if (canApply) {
          e.preventDefault();
          apply();
        }
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-background" onKeyDown={onDialogKeyDown}>
        <DialogHeader>
          <DialogTitle>Bulk rename ({items.length})</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as Mode)}
            className="grid grid-cols-3 gap-2"
          >
            {(
              [
                { v: "replace", label: "Find & replace" },
                { v: "prefix", label: "Add prefix" },
                { v: "suffix", label: "Add suffix" },
              ] as const
            ).map((opt) => (
              <label
                key={opt.v}
                className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm text-foreground transition-colors ${
                  mode === opt.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}
              >
                <RadioGroupItem value={opt.v} /> {opt.label}
              </label>
            ))}
          </RadioGroup>
          {mode === "replace" ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Find</Label>
                <Input
                  ref={findRef}
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder="text to find"
                />
              </div>
              <div className="space-y-1">
                <Label>Replace with</Label>
                <Input
                  value={replace}
                  onChange={(e) => setReplace(e.target.value)}
                  placeholder="replacement"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <Label>{mode === "prefix" ? "Prefix" : "Suffix (before extension)"}</Label>
              <Input
                ref={affixRef}
                value={affix}
                onChange={(e) => setAffix(e.target.value)}
                placeholder={mode === "prefix" ? "2025_" : "_v2"}
              />
            </div>
          )}

          {/* Preview header / summary */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                {changedCount} will change
              </span>
              <span className="text-muted-foreground">· {unchangedCount} unchanged</span>
              {blankCount > 0 && (
                <span className="rounded bg-rose-50 px-1.5 py-0.5 font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                  {blankCount} blank
                </span>
              )}
              {collisionCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                  <AlertTriangle className="h-3 w-3" /> {collisionCount} name collisions
                </span>
              )}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Switch checked={onlyChanges} onCheckedChange={setOnlyChanges} />
              Only changes
            </label>
          </div>

          <div className="max-h-60 overflow-y-auto rounded-md border bg-slate-50/60 p-2 text-xs dark:bg-slate-900/40">
            <TooltipProvider delayDuration={150}>
              {visible.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground">No changes to preview.</div>
              ) : (
                visible.map((r) => (
                  <div key={r.fileId} className="flex items-center justify-between gap-2 py-0.5">
                    <span
                      className={cn(
                        "truncate",
                        r.changed && !r.collides
                          ? "text-muted-foreground"
                          : "text-muted-foreground/70",
                      )}
                    >
                      {r.oldName}
                    </span>
                    <span className="shrink-0 text-muted-foreground">→</span>
                    {r.blank ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="truncate font-medium text-rose-600 dark:text-rose-400">
                            (blank — skipped)
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Name is empty — this row will be skipped.</TooltipContent>
                      </Tooltip>
                    ) : r.collides ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 truncate font-medium text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="h-3 w-3" />
                            {r.name}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Another file would have the same name. Fix to apply.
                        </TooltipContent>
                      </Tooltip>
                    ) : r.changed ? (
                      <span className="truncate font-medium text-emerald-700 dark:text-emerald-300">
                        {r.name}
                      </span>
                    ) : (
                      <span className="truncate font-medium text-muted-foreground/70">
                        {r.name}
                      </span>
                    )}
                  </div>
                ))
              )}
            </TooltipProvider>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Enter to apply · Esc to close · Cmd/Ctrl+Enter always applies
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canApply} onClick={apply}>
            Apply {changedCount > 0 ? `(${changedCount})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
