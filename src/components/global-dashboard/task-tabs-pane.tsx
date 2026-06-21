import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
  ListChecks,
  MessageSquareWarning,
  StickyNote,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { SubtaskList } from "@/components/ops/subtask-list";
import { TaskActionItemsPanel } from "@/components/ops/task-action-items-panel";
import { TaskNotesPanel } from "@/components/ops/task-notes-panel";
import { TaskDetailsPanel } from "@/components/ops/task-meta/task-details-panel";

/**
 * DRY Original: Global Dashboard task detail right pane.
 * Reuses the canonical Task View panels — never duplicates them.
 */
export function TaskTabsPane({ taskId }: { taskId: string }) {
  const { data: task, isLoading } = useQuery({
    queryKey: ["global-dashboard", "task-header", taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tasks")
        .select("id, title, status, display_id")
        .eq("id", taskId)
        .maybeSingle();
      return data;
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex items-start justify-between gap-3 border-b bg-card px-5 py-3">
        <div className="min-w-0">
          {isLoading ? (
            <Skeleton className="h-6 w-64" />
          ) : (
            <>
              {task?.display_id && (
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {task.display_id}
                </p>
              )}
              <h1 className="truncate text-lg font-semibold">{task?.title ?? "Task"}</h1>
              {task?.status && (
                <Badge variant="outline" className="mt-1 capitalize">
                  {String(task.status).replace(/_/g, " ")}
                </Badge>
              )}
            </>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/ops/tasks/$taskId" params={{ taskId }}>
            View task <ExternalLink className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      </header>

      <Tabs defaultValue="details" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 w-fit">
          <TabsTrigger value="details" className="gap-1.5">
            <SlidersHorizontal className="h-3.5 w-3.5" /> Details
          </TabsTrigger>
          <TabsTrigger value="subtasks" className="gap-1.5">
            <ListChecks className="h-3.5 w-3.5" /> Sub-tasks & Links
          </TabsTrigger>
          <TabsTrigger value="clarifications" className="gap-1.5">
            <MessageSquareWarning className="h-3.5 w-3.5" /> Clarifications & Action Items
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5">
            <StickyNote className="h-3.5 w-3.5" /> Notes
          </TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="min-h-0 flex-1 overflow-y-auto p-4">
          <TaskDetailsPanel taskId={taskId} />
        </TabsContent>
        <TabsContent value="subtasks" className="min-h-0 flex-1 overflow-y-auto p-4">
          <SubtaskList taskId={taskId} />
        </TabsContent>
        <TabsContent value="clarifications" className="min-h-0 flex-1 overflow-y-auto p-4">
          <TaskActionItemsPanel taskId={taskId} />
        </TabsContent>
        <TabsContent value="notes" className="min-h-0 flex-1 overflow-y-auto p-4">
          <TaskNotesPanel taskId={taskId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
