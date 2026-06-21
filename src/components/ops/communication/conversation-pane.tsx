import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink, MessagesSquare, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { TaskNotesPanel } from "@/components/ops/task-notes-panel";
import { TaskOpenPointsPanel } from "@/components/ops/task-open-points-panel";
import { GroupInfoDrawer } from "./group-info-drawer";
import { ThreadChat } from "./thread-chat";
import type { InboxSelection } from "./inbox-list-pane";

/**
 * Thin wrapper that resolves the inbox selection to the unified <ThreadChat>.
 * For task scope it adds a tabbed shell (Conversations / Notes / Open Points)
 * importing the existing Task View panels so they stay in sync.
 */
export function ConversationPane({
  selected,
  initialMessageId,
  onMessageJumpDone,
}: {
  selected: InboxSelection | null;
  initialMessageId?: string | null;
  onMessageJumpDone?: () => void;
}) {
  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={<MessagesSquare className="h-8 w-8" />}
          title="Pick a conversation"
          description="Select a chat from the inbox to start reading."
        />
      </div>
    );
  }
  if (selected.kind === "task")
    return (
      <TaskWrapper
        taskId={selected.id}
        initialMessageId={initialMessageId ?? null}
        onMessageJumpDone={onMessageJumpDone}
      />
    );
  return (
    <ChatWrapper
      threadId={selected.id}
      kind={selected.kind}
      initialMessageId={initialMessageId ?? null}
      onMessageJumpDone={onMessageJumpDone}
    />
  );
}

function ChatWrapper({
  threadId,
  kind,
  initialMessageId,
  onMessageJumpDone,
}: {
  threadId: string;
  kind: "dm" | "group";
  initialMessageId?: string | null;
  onMessageJumpDone?: () => void;
}) {
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div className="flex h-full flex-col min-h-0">
      <ThreadChat
        scope="chat"
        id={threadId}
        chatKind={kind}
        initialMessageId={initialMessageId ?? null}
        onInitialJumpDone={onMessageJumpDone}
        headerExtras={
          kind === "group" ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setShowInfo(true)}
            >
              <Info className="h-3.5 w-3.5 mr-1" /> Group info
            </Button>
          ) : null
        }
      />
      <GroupInfoDrawer
        threadId={kind === "group" ? threadId : null}
        open={showInfo}
        onOpenChange={setShowInfo}
      />
    </div>
  );
}

function TaskWrapper({
  taskId,
  initialMessageId,
  onMessageJumpDone,
}: {
  taskId: string;
  initialMessageId?: string | null;
  onMessageJumpDone?: () => void;
}) {
  const [tab, setTab] = useState<"conv" | "notes" | "open">("conv");

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as "conv" | "notes" | "open")}
      className="flex h-full flex-col min-h-0"
    >
      <div className="border-b px-3 pt-2 shrink-0">
        <TabsList className="bg-transparent gap-1 p-0">
          <TabsTrigger
            value="conv"
            className="border-t-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary"
          >
            Conversations
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="border-t-2 border-transparent data-[state=active]:border-amber-500 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-700 dark:data-[state=active]:text-amber-300"
          >
            Notes
          </TabsTrigger>
          <TabsTrigger
            value="open"
            className="border-t-2 border-transparent data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-300"
          >
            Open Points
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="conv" className="flex-1 flex flex-col min-h-0 mt-0">
        <ThreadChat
          scope="task"
          id={taskId}
          initialMessageId={initialMessageId ?? null}
          onInitialJumpDone={onMessageJumpDone}
          headerExtras={
            <Button asChild size="sm" className="h-7 text-xs">
              <Link to="/ops/tasks/$taskId" params={{ taskId }}>
                <ExternalLink className="h-3 w-3 mr-1" /> Open Task View
              </Link>
            </Button>
          }
        />
      </TabsContent>

      <TabsContent value="notes" className="flex-1 overflow-y-auto p-4 mt-0">
        <TaskNotesPanel taskId={taskId} />
      </TabsContent>

      <TabsContent value="open" className="flex-1 overflow-y-auto p-4 mt-0">
        <TaskOpenPointsPanel taskId={taskId} />
      </TabsContent>
    </Tabs>
  );
}
