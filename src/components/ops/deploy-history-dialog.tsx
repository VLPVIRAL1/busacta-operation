import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTemplateDeployments } from "@/lib/ops/folder-templates.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { History } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scope?: { templateId?: string; projectId?: string; taskId?: string; firmId?: string };
  title?: string;
};

export function DeployHistoryDialog({
  open,
  onOpenChange,
  scope = {},
  title = "Deployment history",
}: Props) {
  const listFn = useServerFn(listTemplateDeployments);
  const { data, isLoading } = useQuery({
    queryKey: ["folder-template-deployments", scope],
    queryFn: () => listFn({ data: { ...scope, limit: 100 } as any }),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> {title}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {isLoading ? (
            <>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </>
          ) : !data || data.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              No deployments yet.
            </div>
          ) : (
            data.map((d) => (
              <div key={d.id} className="rounded-md border p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium truncate">{d.template_name_snapshot}</div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge
                      variant={d.mode === "replace" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {d.mode}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {d.scope}
                    </Badge>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                  <span>{d.actor_name ?? "System"}</span>
                  <span>{formatDistanceToNow(new Date(d.occurred_at), { addSuffix: true })}</span>
                  <span>Folders created: {d.folders_created}</span>
                  {d.folders_skipped > 0 && <span>skipped: {d.folders_skipped}</span>}
                  {d.scope === "project" && <span>{d.tasks_touched} task(s)</span>}
                  {d.target_path && <span>path: /{d.target_path}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
