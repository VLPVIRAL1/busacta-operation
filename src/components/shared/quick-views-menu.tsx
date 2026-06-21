import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Plus, Trash2, Check, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/shared/utils";
import { useUserPref } from "@/lib/ops/user-prefs";

export interface QuickView<T> {
  id: string;
  name: string;
  snapshot: T;
}

export interface QuickViewsMenuProps<T> {
  storageKey: string;
  current: T;
  onApply: (snapshot: T) => void;
  /** Optional equality test — when provided, the matching saved view is highlighted. */
  equals?: (a: T, b: T) => boolean;
  /** Optional legacy localStorage key whose payload should be migrated once. */
  legacyKey?: string;
  /** Map a legacy SavedFilter row to the new snapshot shape. Return null to skip. */
  migrateLegacy?: (legacyItem: unknown) => T | null;
  /** Disable "Add current" when filters are empty. */
  isEmpty?: (current: T) => boolean;
  /** When set, also persist the list per-user in user_ui_prefs under this scope. */
  userPrefScope?: string;
}

function load<T>(
  storageKey: string,
  legacyKey?: string,
  migrate?: (it: unknown) => T | null,
): QuickView<T>[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    if (legacyKey && migrate) {
      const legacy = window.localStorage.getItem(legacyKey);
      if (legacy) {
        const items = JSON.parse(legacy);
        if (Array.isArray(items)) {
          const mig: QuickView<T>[] = [];
          for (const it of items) {
            const snap = migrate(it?.filters ?? it?.snapshot ?? it);
            if (!snap) continue;
            mig.push({
              id: it?.id ?? crypto.randomUUID(),
              name: it?.name ?? "Untitled",
              snapshot: snap,
            });
          }
          window.localStorage.setItem(storageKey, JSON.stringify(mig));
          return mig;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

function persist<T>(storageKey: string, rows: QuickView<T>[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

/**
 * Generic, user-defined Quick Views menu.
 *
 * Replaces page-specific "Saved filters" menus. Users can Add the current
 * filter state, Rename, Update-to-current, and Delete saved views. No
 * predefined presets — the list starts empty.
 */
export function QuickViewsMenu<T>({
  storageKey,
  current,
  onApply,
  equals,
  legacyKey,
  migrateLegacy,
  isEmpty,
  userPrefScope,
}: QuickViewsMenuProps<T>) {
  const [items, setItems] = useState<QuickView<T>[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [name, setName] = useState("");

  // Per-user backend mirror (optional). Falls back to no-op when not signed in.
  const enabled = !!userPrefScope;
  const pref = useUserPref<QuickView<T>[] | null>(userPrefScope ?? `__qv:${storageKey}`, null);

  // Hold the (often inline, unstable) migrate callback in a ref so the seed
  // effect can depend only on the stable storage keys. Depending on
  // `migrateLegacy` directly caused an infinite render loop: callers pass an
  // inline arrow (new identity every render) → effect re-ran every render →
  // setItems(load()) returned a fresh array each time → re-render → loop.
  const migrateLegacyRef = useRef(migrateLegacy);
  migrateLegacyRef.current = migrateLegacy;

  useEffect(() => {
    // Seed from localStorage immediately for offline parity.
    setItems(load<T>(storageKey, legacyKey, migrateLegacyRef.current));
  }, [storageKey, legacyKey]);

  // When the per-user pref resolves, prefer it over local seed.
  useEffect(() => {
    if (!enabled) return;
    if (!pref.ready) return;
    if (Array.isArray(pref.value)) {
      setItems(pref.value);
      persist(storageKey, pref.value);
    }
  }, [enabled, pref.ready, pref.value, storageKey]);

  const persistAll = (next: QuickView<T>[]) => {
    persist(storageKey, next);
    if (enabled) pref.setValue(next);
  };

  const activeId = useMemo(() => {
    if (!equals) return null;
    return items.find((i) => equals(i.snapshot, current))?.id ?? null;
  }, [items, current, equals]);

  const save = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const next = [...items, { id: crypto.randomUUID(), name: trimmed, snapshot: current }];
    setItems(next);
    persistAll(next);
    toast.success(`Quick view "${trimmed}" saved`);
  };

  const updateToCurrent = (id: string) => {
    const next = items.map((it) => (it.id === id ? { ...it, snapshot: current } : it));
    setItems(next);
    persistAll(next);
    toast.success("Quick view updated");
  };

  const rename = (id: string, label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const next = items.map((it) => (it.id === id ? { ...it, name: trimmed } : it));
    setItems(next);
    persistAll(next);
  };

  const remove = (id: string) => {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    persistAll(next);
  };

  const addDisabled = isEmpty ? isEmpty(current) : false;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 relative"
            title="Quick Views"
            aria-label="Quick Views"
          >
            <Bookmark className="h-3.5 w-3.5" />
            {items.length > 0 && (
              <span className="absolute -top-1 -right-1 text-[9px] leading-none bg-muted text-muted-foreground rounded-full px-1 py-0.5 min-w-[14px] text-center">
                {items.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>Quick Views</DropdownMenuLabel>
          {items.length === 0 ? (
            <div className="px-2 py-3 text-xs italic text-muted-foreground">
              No saved views yet. Set up filters, then add one.
            </div>
          ) : (
            items.map((it) => {
              const active = it.id === activeId;
              return (
                <DropdownMenuItem
                  key={it.id}
                  onSelect={(e) => {
                    e.preventDefault();
                    onApply(it.snapshot);
                    toast.success(`Applied "${it.name}"`);
                  }}
                  className={cn("flex items-center gap-1.5", active && "bg-accent")}
                >
                  <Check className={cn("h-3.5 w-3.5", active ? "text-primary" : "opacity-0")} />
                  <span className="flex-1 truncate">{it.name}</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      updateToCurrent(it.id);
                    }}
                    title="Update to current filters"
                  >
                    <Save className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setName(it.name);
                      setRenameId(it.id);
                    }}
                    title="Rename"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      remove(it.id);
                    }}
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuItem>
              );
            })
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setName("");
              setAddOpen(true);
            }}
            disabled={addDisabled}
          >
            <Plus className="h-3.5 w-3.5 mr-2" /> Add current as Quick View…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Quick View</DialogTitle>
          </DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mine + Overdue"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                save(name);
                setAddOpen(false);
              }
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                save(name);
                setAddOpen(false);
              }}
              disabled={!name.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameId !== null} onOpenChange={(o) => !o && setRenameId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Quick View</DialogTitle>
          </DialogHeader>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameId) {
                rename(renameId, name);
                setRenameId(null);
              }
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameId(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (renameId) {
                  rename(renameId, name);
                  setRenameId(null);
                }
              }}
              disabled={!name.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
