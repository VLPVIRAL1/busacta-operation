import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, FileText, Folder } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listDocumentAuditEvents,
  type DocumentAuditEvent,
} from "@/lib/ops/task-documents.functions";

const EVENT_LABEL: Record<string, string> = {
  uploaded: "Uploaded",
  created: "Created",
  renamed: "Renamed",
  moved: "Moved",
  visibility_changed: "Visibility changed",
  deleted: "Deleted",
};

function describe(ev: DocumentAuditEvent): string {
  switch (ev.event_type) {
    case "renamed":
      return `${ev.before?.filename ?? ev.before?.path ?? "—"} → ${
        ev.after?.filename ?? ev.after?.path ?? "—"
      }`;
    case "moved":
      return `${ev.before?.folder_path ?? ev.before?.path ?? "—"} → ${
        ev.after?.folder_path ?? ev.after?.path ?? "—"
      }`;
    case "visibility_changed": {
      const fromOv = ev.before?.client_visible_override;
      const toOv = ev.after?.client_visible_override;
      const fromV = ev.before?.is_client_visible;
      const toV = ev.after?.is_client_visible;
      if (typeof toOv !== "undefined") {
        const label = (v: unknown) =>
          v === null || typeof v === "undefined"
            ? "inherit folder"
            : v
              ? "shared (override)"
              : "internal (override)";
        return `${label(fromOv)} → ${label(toOv)}`;
      }
      return `${fromV ? "Shared" : "Internal"} → ${toV ? "Shared" : "Internal"}`;
    }
    case "uploaded":
      return `${ev.after?.filename ?? ""} in ${ev.after?.folder_path || "(root)"}`;
    case "created":
      return `${ev.after?.path ?? ""}`;
    case "deleted":
      return `${ev.before?.filename ?? ev.before?.path ?? ""}`;
    default:
      return "";
  }
}

export function DocumentAuditDialog({
  open,
  onOpenChange,
  taskId,
  nodeIds,
  title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  taskId: string;
  nodeIds?: string[];
  title: string;
}) {
  const listFn = useServerFn(listDocumentAuditEvents);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["doc-audit", taskId, [...(nodeIds ?? [])].sort().join(",")],
    enabled: open,
    queryFn: () =>
      listFn({
        data: { taskId, nodeIds: nodeIds?.length ? nodeIds : undefined, limit: 200 },
      }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>History — {title}</DialogTitle>
          <DialogDescription>
            Every change to this document or folder, in chronological order.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[480px] pr-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              Failed to load history. Please close and try again.
            </p>
          ) : !data || data.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No history yet.</p>
          ) : (
            <ol className="space-y-3">
              {data.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-lg border border-slate-200/70 bg-white/60 p-3 text-sm dark:border-slate-700/60 dark:bg-slate-900/40"
                >
                  <div className="flex items-center gap-2">
                    {ev.node_kind === "folder" ? (
                      <Folder className="h-4 w-4 text-amber-500" />
                    ) : (
                      <FileText className="h-4 w-4 text-slate-500" />
                    )}
                    <span className="font-medium">{ev.node_label ?? "—"}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {EVENT_LABEL[ev.event_type] ?? ev.event_type}
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {new Date(ev.occurred_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    by {ev.actor_name ?? "System"}
                    {describe(ev) && <> · {describe(ev)}</>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
