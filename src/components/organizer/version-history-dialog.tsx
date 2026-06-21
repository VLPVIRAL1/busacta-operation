import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { History, RotateCcw, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listTemplateVersions,
  restoreTemplateVersion,
  captureTemplateSnapshot,
} from "@/lib/organizer/versions.functions";

interface Props {
  templateId: string;
  currentVersion: number;
  onRestored: () => void;
}

export function VersionHistoryDialog({ templateId, currentVersion, onRestored }: Props) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fetchList = useServerFn(listTemplateVersions);
  const restoreFn = useServerFn(restoreTemplateVersion);
  const captureFn = useServerFn(captureTemplateSnapshot);

  const { data, isLoading } = useQuery({
    queryKey: ["organizer", "versions", templateId],
    queryFn: () => fetchList({ data: { template_id: templateId } }),
    enabled: open,
  });

  const restore = useMutation({
    mutationFn: (version_id: string) => restoreFn({ data: { version_id } }),
    onSuccess: (res) => {
      toast.success(`Restored version v${res.restored_version} into draft`);
      qc.invalidateQueries({ queryKey: ["organizer", "template", templateId] });
      onRestored();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const capture = useMutation({
    mutationFn: () => captureFn({ data: { template_id: templateId, note: "Manual snapshot" } }),
    onSuccess: () => {
      toast.success("Snapshot captured");
      qc.invalidateQueries({ queryKey: ["organizer", "versions", templateId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" title="Version history">
          <History className="h-4 w-4 mr-2" />
          History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Template version history</DialogTitle>
          <DialogDescription>
            Snapshots are captured automatically on publish. Restoring rolls the template back to a
            draft so you can review before re-publishing.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pr-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading versions…</div>
          ) : (data?.versions ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No snapshots yet. Publish the template or capture a snapshot to start a history.
            </div>
          ) : (
            <ul className="space-y-2">
              {(data?.versions ?? []).map((v) => {
                const isCurrent = v.version === currentVersion;
                const blockCount = Array.isArray(v.snapshot_json?.blocks)
                  ? v.snapshot_json.blocks.length
                  : 0;
                return (
                  <li key={v.id} className="border rounded p-3 flex items-start gap-3">
                    <Badge variant={isCurrent ? "default" : "outline"}>v{v.version}</Badge>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{v.note || "Snapshot"}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(v.created_at).toLocaleString()} · {blockCount} blocks
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restore.mutate(v.id)}
                      disabled={restore.isPending}
                    >
                      {restore.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      )}
                      Restore
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="ghost" onClick={() => capture.mutate()} disabled={capture.isPending}>
            {capture.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Capture snapshot now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
