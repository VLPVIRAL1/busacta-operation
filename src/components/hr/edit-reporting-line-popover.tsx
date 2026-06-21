// Dialog for managing who an employee reports to — supports multiple managers.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, X, Plus } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listDescendantIds, setManagers, type OrgNode } from "@/lib/hr/hierarchy.functions";

export function EditReportingLinePopover({
  node,
  allNodes,
  onClose,
}: {
  node: OrgNode;
  allNodes: OrgNode[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listDescendantIds);
  const setFn = useServerFn(setManagers);

  // Working copy of selected manager IDs.
  const [selectedIds, setSelectedIds] = useState<string[]>(node.manager_ids);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Fetch descendants to exclude from the picker (prevent cycles).
  const descQ = useQuery({
    queryKey: ["hr", "descendants", node.id],
    queryFn: async () => listFn({ data: { employeeId: node.id } }),
  });

  const excluded = useMemo(() => {
    const set = new Set<string>([node.id]);
    (descQ.data?.ids ?? []).forEach((id) => set.add(id));
    selectedIds.forEach((id) => set.add(id)); // already selected
    return set;
  }, [descQ.data, node.id, selectedIds]);

  const nodeById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);

  const candidates = useMemo(
    () => allNodes.filter((n) => !excluded.has(n.id)),
    [allNodes, excluded],
  );

  const addManager = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setPickerOpen(false);
  };

  const removeManager = (id: string) => {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  };

  const save = useMutation({
    mutationFn: () => setFn({ data: { employeeId: node.id, managerIds: selectedIds } }),
    onSuccess: () => {
      toast.success("Reporting line updated");
      qc.invalidateQueries({ queryKey: ["hr", "org-tree"] });
      qc.invalidateQueries({ queryKey: ["hr", "descendants"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Edit reporting line</DialogTitle>
          <DialogDescription>
            Choose who <span className="font-medium">{node.full_name ?? "this employee"}</span>{" "}
            reports to. One person can report to multiple managers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current managers */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Reports to
            </p>
            {selectedIds.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No manager — top of hierarchy</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedIds.map((id) => {
                  const n = nodeById.get(id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1.5 pr-1 text-xs">
                      {n?.full_name ?? n?.email ?? id.slice(0, 8)}
                      {n?.position_title && (
                        <span className="text-muted-foreground">· {n.position_title}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeManager(id)}
                        className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                        aria-label="Remove manager"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add manager picker */}
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={descQ.isLoading}>
                {descQ.isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Add manager
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search by name or title…" className="h-9" />
                <CommandList>
                  <CommandEmpty>No eligible managers found.</CommandEmpty>
                  <CommandGroup>
                    {candidates.map((c) => (
                      <CommandItem
                        key={c.id}
                        value={[c.full_name, c.email, c.position_title].filter(Boolean).join(" ")}
                        onSelect={() => addManager(c.id)}
                        className="cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {c.full_name ?? c.email ?? c.id.slice(0, 8)}
                          </div>
                          {c.position_title && (
                            <div className="text-[11px] text-muted-foreground truncate">
                              {c.position_title}
                              {c.department ? ` · ${c.department}` : ""}
                            </div>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {selectedIds.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Leaving managers empty places this person at the top of the hierarchy with no
              reporting line.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
