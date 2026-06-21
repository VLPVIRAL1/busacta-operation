import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { CategoryOption } from "./file-meta-controls";

export type CategoryDeleteResult =
  | { mode: "untag" }
  | { mode: "reassign"; reassignToCategoryId: string };

export function CategoryDeleteDialog({
  open,
  onOpenChange,
  category,
  otherCategories,
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  category: { id: string; name: string } | null;
  otherCategories: CategoryOption[];
  pending?: boolean;
  onConfirm: (result: CategoryDeleteResult) => void | Promise<void>;
}) {
  const hasOthers = otherCategories.length > 0;
  const [mode, setMode] = useState<"untag" | "reassign">("untag");
  const [targetId, setTargetId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setMode("untag");
      setTargetId(hasOthers ? otherCategories[0]?.id : undefined);
    }
  }, [open, hasOthers, otherCategories]);

  const disabled = pending || !category || (mode === "reassign" && (!hasOthers || !targetId));

  const submit = () => {
    if (!category) return;
    if (mode === "reassign") {
      if (!targetId) return;
      void onConfirm({ mode: "reassign", reassignToCategoryId: targetId });
    } else {
      void onConfirm({ mode: "untag" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            Delete category
          </DialogTitle>
          <DialogDescription>
            {category ? (
              <>
                Delete{" "}
                <span className="font-medium text-foreground">&ldquo;{category.name}&rdquo;</span>{" "}
                from this project. Choose what happens to files currently tagged with it.
              </>
            ) : (
              "Choose what happens to files currently tagged with this category."
            )}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={mode}
          onValueChange={(v) => setMode(v as "untag" | "reassign")}
          className="gap-3"
        >
          <label
            htmlFor="cat-del-untag"
            className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent/40"
          >
            <RadioGroupItem id="cat-del-untag" value="untag" className="mt-0.5" />
            <div className="space-y-1">
              <div className="text-sm font-medium">Remove this tag from all files</div>
              <p className="text-xs text-muted-foreground">
                Files stay where they are — they just lose this category.
              </p>
            </div>
          </label>

          <label
            htmlFor="cat-del-reassign"
            className={
              "flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent/40 " +
              (!hasOthers ? "opacity-50 pointer-events-none" : "")
            }
          >
            <RadioGroupItem
              id="cat-del-reassign"
              value="reassign"
              disabled={!hasOthers}
              className="mt-0.5"
            />
            <div className="flex-1 space-y-2">
              <div className="text-sm font-medium">Reassign files to another category</div>
              <p className="text-xs text-muted-foreground">
                {hasOthers
                  ? "Every file tagged with the deleted category will receive the chosen one instead."
                  : "No other categories exist in this project yet."}
              </p>
              {hasOthers && mode === "reassign" && (
                <div className="space-y-1">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Reassign to
                  </Label>
                  <Select value={targetId} onValueChange={setTargetId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Pick a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: c.color }}
                            />
                            {c.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </label>
        </RadioGroup>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={submit} disabled={disabled}>
            {pending ? "Deleting…" : "Delete category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
