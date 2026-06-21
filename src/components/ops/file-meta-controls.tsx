import { useEffect, useState } from "react";
import { Check, Pencil, Tag, Trash2, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/shared/utils";

export type CategoryOption = {
  id: string;
  name: string;
  color: string;
};

export function CategoryChip({
  category,
  onClick,
  className,
}: {
  category: CategoryOption | null | undefined;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}) {
  if (!category) {
    if (!onClick) return null;
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-600",
          className,
        )}
      >
        <Tag className="h-2.5 w-2.5" /> Categorize
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
        className,
      )}
      title={`Category: ${category.name}`}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: category.color }}
        aria-hidden
      />
      <span className="max-w-[10ch] truncate">{category.name}</span>
    </button>
  );
}

export function CategoryChips({
  categoryIds,
  categoryMap,
  onClick,
  className,
}: {
  categoryIds: string[];
  categoryMap: Map<string, CategoryOption>;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
}) {
  const resolved = categoryIds
    .map((id) => categoryMap.get(id))
    .filter((c): c is CategoryOption => !!c);
  if (resolved.length === 0) {
    if (!onClick) return null;
    return <CategoryChip category={null} onClick={onClick} className={className} />;
  }
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {resolved.map((c) => (
        <CategoryChip key={c.id} category={c} onClick={onClick} />
      ))}
    </span>
  );
}

export type CategoryDeleteRequest = {
  categoryId: string;
  name: string;
};

export function CategoryPickerPopover({
  open,
  onOpenChange,
  categories,
  currentCategoryId,
  currentCategoryIds,
  onPick,
  onToggle,
  onClear,
  onCreate,
  onRename,
  onRequestDelete,
  creating = false,
  loading = false,
  trigger,
  multi = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: CategoryOption[];
  currentCategoryId?: string | null;
  currentCategoryIds?: string[];
  onPick?: (categoryId: string) => void;
  onToggle?: (categoryId: string) => void;
  onClear?: () => void;
  onCreate?: (name: string) => Promise<void> | void;
  onRename?: (categoryId: string, name: string) => Promise<void> | void;
  onRequestDelete?: (request: CategoryDeleteRequest) => void;
  creating?: boolean;
  loading?: boolean;
  trigger: React.ReactNode;
  multi?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renamePending, setRenamePending] = useState(false);
  useEffect(() => {
    if (!open) {
      setFilter("");
      setRenamingId(null);
      setRenameValue("");
    }
  }, [open]);
  const q = filter.trim().toLowerCase();
  const list = q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  const selectedSet = new Set<string>(
    multi ? (currentCategoryIds ?? []) : currentCategoryId ? [currentCategoryId] : [],
  );
  const trimmed = filter.trim();
  const normalized = trimmed.toLowerCase();
  const exactMatch =
    trimmed.length > 0 && categories.some((c) => c.name.trim().toLowerCase() === normalized);
  const canCreate = !!onCreate && trimmed.length > 0 && !exactMatch;
  const doCreate = async () => {
    if (!onCreate || !trimmed) return;
    await onCreate(trimmed);
    setFilter("");
  };
  const startRename = (c: CategoryOption, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(c.id);
    setRenameValue(c.name);
  };
  const commitRename = async (c: CategoryOption) => {
    if (!onRename) return;
    const next = renameValue.trim();
    if (!next || next === c.name) {
      setRenamingId(null);
      return;
    }
    // Block duplicates against siblings (case-insensitive).
    const dup = categories.some(
      (other) => other.id !== c.id && other.name.trim().toLowerCase() === next.toLowerCase(),
    );
    if (dup) {
      // Let server respond definitively; surface inline by not closing.
      setRenamePending(true);
      try {
        await onRename(c.id, next);
        setRenamingId(null);
      } finally {
        setRenamePending(false);
      }
      return;
    }
    setRenamePending(true);
    try {
      await onRename(c.id, next);
      setRenamingId(null);
    } finally {
      setRenamePending(false);
    }
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <Input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canCreate && !creating) {
              e.preventDefault();
              void doCreate();
            }
          }}
          placeholder={onCreate ? "Search or type to create…" : "Search category…"}
          className="h-8 text-xs"
        />
        <div className="mt-2 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="space-y-1.5 px-1 py-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-5/6" />
              <Skeleton className="h-6 w-2/3" />
            </div>
          ) : list.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              {categories.length === 0
                ? onCreate
                  ? "No categories yet — type a name above and press Enter."
                  : "No categories defined yet."
                : "No matches."}
            </p>
          ) : (
            list.map((c) => {
              const isActive = selectedSet.has(c.id);
              const isRenaming = renamingId === c.id;
              if (isRenaming) {
                return (
                  <div
                    key={c.id}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    <Input
                      autoFocus
                      value={renameValue}
                      disabled={renamePending}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commitRename(c);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          setRenamingId(null);
                        }
                      }}
                      className="h-6 flex-1 text-xs"
                    />
                    <button
                      type="button"
                      disabled={renamePending}
                      onClick={(e) => {
                        e.stopPropagation();
                        void commitRename(c);
                      }}
                      className="rounded p-1 text-indigo-600 hover:bg-accent disabled:opacity-50"
                      title="Save"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={renamePending}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(null);
                      }}
                      className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-50"
                      title="Cancel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              }
              return (
                <div
                  key={c.id}
                  className={cn(
                    "group flex w-full items-center gap-1 rounded px-2 py-1.5 text-xs hover:bg-accent",
                    isActive && "bg-accent",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (multi) onToggle?.(c.id);
                      else onPick?.(c.id);
                    }}
                    className="flex flex-1 items-center justify-between gap-2 text-left"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="truncate">{c.name}</span>
                    </span>
                    {isActive && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                  </button>
                  {onRename && (
                    <button
                      type="button"
                      onClick={(e) => startRename(c, e)}
                      className="rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover:opacity-100"
                      title="Rename category"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                  {onRequestDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestDelete({ categoryId: c.id, name: c.name });
                      }}
                      className="rounded p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-rose-600 group-hover:opacity-100"
                      title="Delete category"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
        {!loading && canCreate && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              disabled={creating}
              onClick={doCreate}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-indigo-600 hover:bg-accent disabled:opacity-50"
            >
              <Tag className="h-3.5 w-3.5" />
              {creating ? "Creating…" : <>Create &ldquo;{trimmed}&rdquo;</>}
            </button>
          </>
        )}
        {!loading && !!onCreate && trimmed.length > 0 && exactMatch && (
          <>
            <div className="my-1 h-px bg-border" />
            <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
              &ldquo;{trimmed}&rdquo; already exists.
            </p>
          </>
        )}
        {onClear && selectedSet.size > 0 && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={onClear}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" /> Clear {multi ? "all categories" : "category"}
            </button>
          </>
        )}
        {multi && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex w-full items-center justify-center gap-2 rounded px-2 py-1.5 text-xs font-medium text-indigo-600 hover:bg-accent"
            >
              Done
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function DescriptionDialog({
  open,
  onOpenChange,
  filename,
  initialValue,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  filename: string;
  initialValue: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);
  const tooLong = value.length > 500;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate">Description — {filename}</DialogTitle>
          <DialogDescription>
            Add context that team members and clients can see beside this file (max 500 characters).
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Signed Form 8879 — final version returned by client on Mar 14."
          rows={4}
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span className={cn(tooLong && "text-destructive")}>{value.length} / 500</span>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={tooLong}
            onClick={() => {
              onSave(value.trim());
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
