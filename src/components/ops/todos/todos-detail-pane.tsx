import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { FirmCode, ProjectCode, DirectClientCode } from "@/components/shared/entity-code";
import { ListChecks } from "lucide-react";

import { SubtaskList } from "@/components/ops/subtask-list";
import { TaskLinksPanel } from "@/components/ops/task-links-panel";
import { TaskActionItemsPanel } from "@/components/ops/task-action-items-panel";
import { DocumentManager } from "@/components/ops/document-manager";
import { ThreadChat } from "@/components/ops/communication/thread-chat";
import { MyDayToggle } from "@/components/ops/my-day-toggle";
import { TaskTimerControl } from "@/components/ops/timer-widget";
import { TaskWatchToggle } from "@/components/ops/task-watch-toggle";
import { TaskInformationForm } from "./task-information-form";

import { taskHeaderQuery } from "@/lib/queries/ops.queries";

/**
 * Right pane of the To-Do split view. Header mirrors the Communication Hub's
 * thread header (title + firm·project·client subtitle); the inline action row
 * sits on the same horizontal line as the tabs. All five tab bodies render
 * the existing Task View components verbatim — no duplication.
 */
export function TodosDetailPane({ taskId }: { taskId: string | null }) {
  if (!taskId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={<ListChecks className="h-8 w-8" />}
          title="Pick a task"
          description="Select a task from the list to see its details."
        />
      </div>
    );
  }
  return <TaskDetail taskId={taskId} />;
}

function TaskDetail({ taskId }: { taskId: string }) {
  const { data: meta, isLoading } = useQuery(taskHeaderQuery(taskId));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header — matches Communication Hub thread header */}
      <div className="border-b px-4 py-3">
        {isLoading || !meta ? (
          <Skeleton className="h-10 w-2/3" />
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            {meta.display_id && (
              <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                {meta.display_id}
              </Badge>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{meta.title}</div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                {meta.isDirect ? (
                  <DirectClientCode code={meta.firmCode} name={meta.firm} />
                ) : (
                  <>
                    <FirmCode code={meta.firmCode} name={meta.firm} />
                    {meta.project && <ProjectCode code={meta.projectCode} name={meta.project} />}
                    {meta.client && <span className="truncate">· {meta.client}</span>}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs + inline action row sharing the same horizontal line */}
      <Tabs defaultValue="subtasks" className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between gap-2 border-b px-4 pt-2">
          <TabsList className="bg-transparent gap-1 p-0 h-auto">
            <TabsTrigger
              value="subtasks"
              className="text-xs border-t-2 border-transparent rounded-b-none data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none"
            >
              Subtask &amp; Links
            </TabsTrigger>
            <TabsTrigger
              value="action-items"
              className="text-xs border-t-2 border-transparent rounded-b-none data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-300 data-[state=active]:shadow-none"
            >
              Clarification &amp; Action Items
            </TabsTrigger>
            <TabsTrigger
              value="files"
              className="text-xs border-t-2 border-transparent rounded-b-none data-[state=active]:border-violet-500 data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-700 dark:data-[state=active]:text-violet-300 data-[state=active]:shadow-none"
            >
              Files
            </TabsTrigger>
            <TabsTrigger
              value="communication"
              className="text-xs border-t-2 border-transparent rounded-b-none data-[state=active]:border-sky-500 data-[state=active]:bg-sky-500/10 data-[state=active]:text-sky-700 dark:data-[state=active]:text-sky-300 data-[state=active]:shadow-none"
            >
              Communication
            </TabsTrigger>
            <TabsTrigger
              value="info"
              className="text-xs border-t-2 border-transparent rounded-b-none data-[state=active]:border-amber-500 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-700 dark:data-[state=active]:text-amber-300 data-[state=active]:shadow-none"
            >
              Task Information
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1.5">
            <MyDayToggle taskId={taskId} showLabel />
            <Button asChild size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs">
              <Link to="/ops/tasks/$taskId" params={{ taskId }}>
                <ExternalLink className="h-3.5 w-3.5" />
                View Task
              </Link>
            </Button>
            <TaskTimerControl taskId={taskId} compact />
            <TaskWatchToggle taskId={taskId} compact />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <TabsContent value="subtasks" className="mt-0 space-y-6">
            <section>
              <h3 className="mb-2 text-sm font-semibold">Sub-tasks</h3>
              <SubtaskList taskId={taskId} />
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Related Links</h3>
              <TaskLinksPanel taskId={taskId} />
            </section>
          </TabsContent>

          <TabsContent value="action-items" className="mt-0">
            <TaskActionItemsPanel taskId={taskId} />
          </TabsContent>

          <TabsContent value="files" className="mt-0">
            <DocumentManager taskId={taskId} />
          </TabsContent>

          <TabsContent value="communication" className="mt-0 h-full">
            <div className="h-[calc(100vh-320px)] min-h-[400px]">
              <ThreadChat scope="task" id={taskId} hideHeader />
            </div>
          </TabsContent>

          <TabsContent value="info" className="mt-0">
            <TaskInformationForm taskId={taskId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
