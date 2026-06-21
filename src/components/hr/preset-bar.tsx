import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bookmark, Save, Trash2, Star, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listMappingPresets,
  saveMappingPreset,
  updateMappingPreset,
  deleteMappingPreset,
  applyPresetToFile,
  type MappingPreset,
} from "@/lib/hr/mapping-presets";

export function PresetBar({
  mapping,
  fileHeaders,
  onApply,
  selectedPresetId,
  onSelectPreset,
}: {
  mapping: Record<string, string>;
  fileHeaders: string[];
  onApply: (mapping: Record<string, string>) => void;
  selectedPresetId: string | null;
  onSelectPreset: (id: string | null) => void;
}) {
  const qc = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [setAsDefault, setSetAsDefault] = useState(false);

  const presetsQ = useQuery({
    queryKey: ["attendance-mapping-presets"],
    queryFn: listMappingPresets,
  });
  const presets = presetsQ.data ?? [];
  const selected = presets.find((p) => p.id === selectedPresetId) ?? null;

  function applyPreset(p: MappingPreset) {
    const { applied, missing } = applyPresetToFile(p, fileHeaders);
    onApply(applied);
    onSelectPreset(p.id);
    if (missing.length > 0) {
      toast.warning(
        `Applied "${p.name}" — ${missing.length} mapped column(s) not found in this file: ${missing.map((m) => m.column).join(", ")}`,
      );
    } else {
      toast.success(`Applied preset "${p.name}"`);
    }
  }

  const save = useMutation({
    mutationFn: () =>
      saveMappingPreset({
        name,
        description: description || null,
        mapping,
        is_default: setAsDefault,
      }),
    onSuccess: (p) => {
      toast.success(`Saved preset "${p.name}"`);
      qc.invalidateQueries({ queryKey: ["attendance-mapping-presets"] });
      onSelectPreset(p.id);
      setSaveOpen(false);
      setName("");
      setDescription("");
      setSetAsDefault(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No preset selected");
      await updateMappingPreset(selected.id, { mapping });
    },
    onSuccess: () => {
      toast.success(`Updated "${selected?.name}"`);
      qc.invalidateQueries({ queryKey: ["attendance-mapping-presets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No preset selected");
      await deleteMappingPreset(selected.id);
    },
    onSuccess: () => {
      toast.success(`Deleted "${selected?.name}"`);
      qc.invalidateQueries({ queryKey: ["attendance-mapping-presets"] });
      onSelectPreset(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const makeDefault = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No preset selected");
      await updateMappingPreset(selected.id, { is_default: true });
    },
    onSuccess: () => {
      toast.success(`"${selected?.name}" is now the default`);
      qc.invalidateQueries({ queryKey: ["attendance-mapping-presets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-subtle bg-muted/30 p-2">
        <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Mapping preset</span>
        <Select
          value={selectedPresetId ?? "__none__"}
          onValueChange={(v) => {
            if (v === "__none__") {
              onSelectPreset(null);
              return;
            }
            const p = presets.find((x) => x.id === v);
            if (p) applyPreset(p);
          }}
        >
          <SelectTrigger className="h-8 w-full sm:w-64 text-xs">
            <SelectValue placeholder="— pick a preset —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— no preset —</SelectItem>
            {presets.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.is_default ? "★ " : ""}
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selected && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => applyPreset(selected)}
              title="Re-apply this preset to the current file"
            >
              <RotateCw className="h-3.5 w-3.5" /> Re-apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => update.mutate()}
              disabled={update.isPending}
              title="Overwrite this preset with the current mapping"
            >
              <Save className="h-3.5 w-3.5" /> Update
            </Button>
            {!selected.is_default && (
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => makeDefault.mutate()}
                disabled={makeDefault.isPending}
              >
                <Star className="h-3.5 w-3.5" /> Set default
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-destructive hover:text-destructive"
              onClick={() => {
                if (confirm(`Delete preset "${selected.name}"?`)) remove.mutate();
              }}
              disabled={remove.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}

        <Button size="sm" className="h-8 ml-auto" onClick={() => setSaveOpen(true)}>
          <Save className="h-3.5 w-3.5" /> Save as preset
        </Button>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save mapping preset</DialogTitle>
            <DialogDescription>
              Save the current header mapping so you can reuse it on the next biometric export with
              these columns.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="preset-name">Name</Label>
              <Input
                id="preset-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. ZKTeco monthly export"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="preset-desc">Description (optional)</Label>
              <Textarea
                id="preset-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="When to use this preset…"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border-subtle p-2">
              <div>
                <div className="text-sm font-medium">Set as default</div>
                <div className="text-xs text-muted-foreground">
                  Auto-applied when a new file is loaded.
                </div>
              </div>
              <Switch checked={setAsDefault} onCheckedChange={setSetAsDefault} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
              {save.isPending ? "Saving…" : "Save preset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
