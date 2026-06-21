import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Save, Trash2, Lock, Globe, Bookmark } from "lucide-react";
import {
  saveTaskView,
  deleteTaskView,
  taskViewsQuery,
  type TaskViewConfig,
  type TaskViewRow,
} from "@/lib/queries/ops.queries";
import { useAuth } from "@/lib/auth/auth-context";

export interface ViewSwitcherProps {
  currentViewId: string | null;
  currentConfig: TaskViewConfig;
  onApply: (id: string | null, cfg: TaskViewConfig) => void;
}

export function TodosViewSwitcher({ currentViewId, currentConfig, onApply }: ViewSwitcherProps) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: views = [] } = useQuery(taskViewsQuery());

  const current = useMemo(
    () => views.find((v) => v.id === currentViewId) ?? null,
    [views, currentViewId],
  );
  const privateViews = views.filter((v) => v.scope === "private" && v.owner_id === user?.id);
  const publicViews = views.filter((v) => v.scope === "public");

  const mSave = useMutation({
    mutationFn: async (input: { id?: string; name: string; scope: "private" | "public" }) => {
      if (!user) throw new Error("Not signed in");
      return saveTaskView({
        id: input.id,
        name: input.name,
        scope: input.scope,
        config: currentConfig,
        ownerId: user.id,
      });
    },
    onSuccess: (id, vars) => {
      toast.success("View saved");
      qc.invalidateQueries({ queryKey: ["task-views"] });
      onApply(id, currentConfig);
      void vars;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mDelete = useMutation({
    mutationFn: deleteTaskView,
    onSuccess: () => {
      toast.success("View deleted");
      qc.invalidateQueries({ queryKey: ["task-views"] });
      if (current) onApply(null, currentConfig);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function pick(v: TaskViewRow | null) {
    if (!v) {
      onApply(null, {});
      return;
    }
    onApply(v.id, v.config ?? {});
  }

  const canEditCurrent = !!current && current.owner_id === user?.id;

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 relative"
            title={current ? `Quick View: ${current.name}` : "Quick Views"}
            aria-label="Quick Views"
          >
            <Bookmark className={`h-3.5 w-3.5 ${current ? "fill-current" : ""}`} />
            {views.length > 0 && (
              <span className="absolute -top-1 -right-1 text-[9px] leading-none bg-muted text-muted-foreground rounded-full px-1 py-0.5 min-w-[14px] text-center">
                {views.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem onSelect={() => pick(null)}>
            <Check className={`h-3.5 w-3.5 mr-2 ${!current ? "opacity-100" : "opacity-0"}`} />
            All Tasks (default)
          </DropdownMenuItem>
          {privateViews.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                <Lock className="h-3 w-3" /> My Views
              </DropdownMenuLabel>
              {privateViews.map((v) => (
                <DropdownMenuItem
                  key={v.id}
                  onSelect={() => pick(v)}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Check
                      className={`h-3.5 w-3.5 ${current?.id === v.id ? "opacity-100" : "opacity-0"}`}
                    />
                    {v.name}
                  </span>
                </DropdownMenuItem>
              ))}
            </>
          )}
          {publicViews.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground flex items-center gap-1">
                <Globe className="h-3 w-3" /> Shared Views
              </DropdownMenuLabel>
              {publicViews.map((v) => (
                <DropdownMenuItem key={v.id} onSelect={() => pick(v)}>
                  <Check
                    className={`h-3.5 w-3.5 mr-2 ${current?.id === v.id ? "opacity-100" : "opacity-0"}`}
                  />
                  {v.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canEditCurrent && (
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() =>
            mSave.mutate({ id: current!.id, name: current!.name, scope: current!.scope })
          }
          disabled={mSave.isPending}
          title="Save changes to this Quick View"
          aria-label="Save Quick View"
        >
          <Save className="h-3.5 w-3.5" />
        </Button>
      )}

      {canEditCurrent && (
        <ManageViewDialog
          view={current!}
          onChanged={(updated) => {
            qc.invalidateQueries({ queryKey: ["task-views"] });
            if (updated) onApply(current!.id, updated.config);
          }}
          onDelete={() => mDelete.mutate(current!.id)}
        />
      )}
    </div>
  );
}

function ManageViewDialog({
  view,
  onChanged,
  onDelete,
}: {
  view: TaskViewRow;
  onChanged: (updated: TaskViewRow | null) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(view.name);
  const [scope, setScope] = useState<"private" | "public">(view.scope);
  const { user } = useAuth();

  useEffect(() => {
    setName(view.name);
    setScope(view.scope);
  }, [view]);

  const mUpdate = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      await saveTaskView({ id: view.id, name, scope, config: view.config, ownerId: user.id });
    },
    onSuccess: () => {
      toast.success("View updated");
      onChanged({ ...view, name, scope });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title="Manage this view">
          Manage
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage view</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Public</Label>
              <p className="text-xs text-muted-foreground">Visible to all users.</p>
            </div>
            <Switch
              checked={scope === "public"}
              onCheckedChange={(c) => setScope(c ? "public" : "private")}
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1">
              {view.scope === "public" ? (
                <Globe className="h-3 w-3" />
              ) : (
                <Lock className="h-3 w-3" />
              )}
              {view.scope}
            </Badge>
            <span>Created {new Date(view.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <Button variant="destructive" size="sm" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => mUpdate.mutate()} disabled={mUpdate.isPending}>
              {mUpdate.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
