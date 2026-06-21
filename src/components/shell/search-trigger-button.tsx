import { Search } from "lucide-react";
import { cn } from "@/lib/shared/utils";

/**
 * Dummy search input that lives in the AppShell top bar. Clicking it
 * dispatches a global `lov:open-command-palette` event that
 * <CommandPalette/> listens for. Discoverable for mouse-heavy users
 * while keeping the real palette as a cmdk dialog.
 */
export function SearchTriggerButton({ className }: { className?: string }) {
  const open = () => {
    window.dispatchEvent(new CustomEvent("lov:open-command-palette"));
  };
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Open command palette and search clients"
      title="Search clients · ⌘K"
      className={cn(
        "hidden md:inline-flex h-8 w-56 lg:w-72 items-center gap-2 rounded-md border border-input bg-background/60 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">Search clients…</span>
      <kbd className="ml-auto inline-flex h-5 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        ⌘K
      </kbd>
    </button>
  );
}
