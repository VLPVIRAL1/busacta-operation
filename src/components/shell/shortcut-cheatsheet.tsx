import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SHORTCUTS, SHORTCUT_GROUPS } from "@/lib/keyboard/shortcut-registry";
import { shouldIgnoreGlobalKey, isModalOpen } from "@/lib/keyboard/is-typing-target";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border bg-muted px-1.5 font-mono text-[11px] font-semibold text-foreground/80">
      {children}
    </kbd>
  );
}

function renderKeys(keys: string) {
  const parts = keys.split(/(\s\/\s|\s+then\s+|\+|\s)/g).filter(Boolean);
  return parts.map((p, i) => {
    if (p === " / " || p.trim() === "then" || p === "+" || p === " ") {
      return (
        <span key={i} className="px-1 text-muted-foreground">
          {p.trim() || "·"}
        </span>
      );
    }
    return <Kbd key={i}>{p}</Kbd>;
  });
}

/**
 * Press "?" anywhere to open. Mounted globally in AppShell.
 */
export function ShortcutCheatsheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalKey(e)) return;
      if (isModalOpen()) return;
      // "?" — Shift + /
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <Kbd>?</Kbd> any time to toggle this cheatsheet. Shortcuts are disabled while
            typing in inputs or while a dialog is open.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2 pt-2">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group}>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {group}
              </h3>
              <ul className="space-y-1.5">
                {SHORTCUTS.filter((s) => s.group === group).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground/90">{s.label}</span>
                    <span className="flex items-center gap-1 shrink-0">{renderKeys(s.keys)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
