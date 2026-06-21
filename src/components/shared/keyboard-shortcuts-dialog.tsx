import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type Shortcut = { keys: string; action: string };

/**
 * Shared keyboard cheat-sheet dialog. Feature areas (todos, task view,
 * open points, communication) pass their own {@link Shortcut} list; the
 * markup lives here so every cheat sheet stays visually consistent.
 */
export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
  shortcuts,
  title = "Keyboard shortcuts",
  description = "Shortcuts are disabled while typing in inputs.",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shortcuts: Shortcut[];
  title?: string;
  description?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ul className="divide-y text-sm">
          {shortcuts.map((s) => (
            <li key={s.keys} className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">{s.action}</span>
              <kbd className="inline-flex items-center rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
