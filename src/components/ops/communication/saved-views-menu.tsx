import { useState } from "react";
import { Bookmark, Plus, Trash2, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useSavedViews,
  useCreateSavedView,
  useDeleteSavedView,
  type SavedViewFilters,
} from "@/lib/ops/comm-saved-views";
import { useInboxFilters } from "./inbox-filter-context";

export function SavedViewsMenu() {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const { data: views = [] } = useSavedViews();
  const create = useCreateSavedView();
  const del = useDeleteSavedView();
  const filters = useInboxFilters();

  const currentSnapshot: SavedViewFilters = {
    types: filters.types,
    firmIds: filters.firmIds,
    stages: filters.stages,
    assigneeIds: filters.people.filter((p) => p.kind === "assignee").map((p) => p.id),
    reviewerIds: filters.people.filter((p) => p.kind === "reviewer").map((p) => p.id),
    view: filters.view,
    scope: filters.scope,
    search: filters.search,
  };

  const apply = (f: SavedViewFilters) => {
    if (f.types) filters.setTypes(f.types);
    if (f.firmIds !== undefined) filters.setFirmIds(f.firmIds);
    else if (f.firmId !== undefined) filters.setFirmIds(f.firmId === "all" ? [] : [f.firmId]);
    if (f.stages !== undefined) filters.setStages(f.stages);
    else if (f.stage !== undefined) filters.setStages(f.stage === "all" ? [] : [f.stage]);
    if (
      f.assigneeIds !== undefined ||
      f.reviewerIds !== undefined ||
      f.assigneeId !== undefined ||
      f.reviewerId !== undefined
    ) {
      filters.setPeople([
        ...(f.assigneeIds ?? (f.assigneeId ? [f.assigneeId] : [])).map((id) => ({
          kind: "assignee" as const,
          id,
        })),
        ...(f.reviewerIds ?? (f.reviewerId ? [f.reviewerId] : [])).map((id) => ({
          kind: "reviewer" as const,
          id,
        })),
      ]);
    }
    if (f.view !== undefined) filters.setView(f.view);
    if (f.scope !== undefined) filters.setScope(f.scope);
    if (f.search !== undefined) filters.setSearch(f.search);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" title="Saved views">
          <Bookmark className="h-3 w-3" /> Views
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold">Saved views</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1 text-[10px]"
            onClick={() => setCreating((v) => !v)}
          >
            <Plus className="h-3 w-3 mr-0.5" /> Save current
          </Button>
        </div>

        {creating && (
          <div className="space-y-1.5 mb-2 p-2 border rounded-md bg-muted/30">
            <Input
              placeholder="View name (e.g. Unread tasks I review)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-7 text-xs"
            />
            <div className="flex justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px]"
                onClick={() => {
                  setCreating(false);
                  setName("");
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-6 text-[11px]"
                disabled={!name.trim() || create.isPending}
                onClick={async () => {
                  await create.mutateAsync({ name, filters: currentSnapshot });
                  setName("");
                  setCreating(false);
                }}
              >
                <Check className="h-3 w-3 mr-0.5" /> Save
              </Button>
            </div>
          </div>
        )}

        <div className="max-h-64 overflow-y-auto space-y-0.5">
          {views.length === 0 ? (
            <div className="text-[11px] text-muted-foreground p-2 text-center">
              No saved views. Configure filters then save as a view.
            </div>
          ) : (
            views.map((v) => (
              <div
                key={v.id}
                className="group flex items-center gap-1 rounded hover:bg-muted px-1.5 py-1"
              >
                <button
                  type="button"
                  className="flex-1 min-w-0 text-left text-xs font-medium truncate"
                  onClick={() => apply(v.filters)}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  onClick={() => del.mutate(v.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
