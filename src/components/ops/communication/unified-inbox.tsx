import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient, useIsFetching } from "@tanstack/react-query";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { InboxListPane, type InboxSelection } from "./inbox-list-pane";
import { ConversationPane } from "./conversation-pane";
import { ComposeDialog } from "@/components/ops/direct-messages-page";
import { useAuth } from "@/lib/auth/auth-context";
import { InboxFilterProvider } from "./inbox-filter-context";
import { InboxToolbar } from "./inbox-toolbar";
import { supabase } from "@/integrations/supabase/client";
import { useInboxRealtime } from "@/lib/ops/comm-realtime";
import { useOfflineDrain } from "@/lib/ops/comm-offline-queue";
import { InboxSelectionProvider } from "./inbox-selection-context";
import { StarredMessagesDialog } from "./starred-messages-dialog";

export function UnifiedInbox({
  initial,
  initialMessageId,
  onSelectionChange,
  onMessageJumpDone,
}: {
  initial?: InboxSelection | null;
  initialMessageId?: string | null;
  onSelectionChange?: (sel: InboxSelection | null) => void;
  onMessageJumpDone?: () => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<InboxSelection | null>(initial ?? null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [starredOpen, setStarredOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setStarredOpen(true);
    window.addEventListener("comm:open-starred", onOpen);
    return () => window.removeEventListener("comm:open-starred", onOpen);
  }, []);

  // Realtime fan-out: any new chat/task message bumps the inbox summary.
  useInboxRealtime(user?.id ?? null);

  // Offline send queue: replays queued messages when network returns.
  useOfflineDrain();

  // Presence heartbeat: ping every 30s while tab is visible.
  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const beat = (status: "online" | "away") => {
      if (stopped) return;
      void supabase.rpc("presence_heartbeat", { _status: status });
    };
    beat("online");
    const id = window.setInterval(() => {
      beat(document.visibilityState === "visible" ? "online" : "away");
    }, 30_000);
    const onVis = () => beat(document.visibilityState === "visible" ? "online" : "away");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user]);

  // Track whether any communication-scoped query is currently fetching.
  const fetching = useIsFetching({
    predicate: (q) => {
      const k = q.queryKey?.[0];
      return (
        k === "inbox" ||
        k === "conv-messages" ||
        k === "task-conv-messages" ||
        k === "conv-thread" ||
        k === "conv-members"
      );
    },
  });

  const handleRefresh = () => {
    void queryClient.invalidateQueries({
      predicate: (q) => {
        const k = q.queryKey?.[0];
        return (
          k === "inbox" ||
          k === "conv-messages" ||
          k === "task-conv-messages" ||
          k === "conv-thread" ||
          k === "conv-members"
        );
      },
    });
  };

  const handleSelect = (sel: InboxSelection) => {
    setSelected(sel);
    onSelectionChange?.(sel);
  };

  return (
    <>
      <InboxFilterProvider>
        <InboxSelectionProvider>
          <div className="flex h-full min-h-0 flex-1 flex-col">
            <ResizableTwoPane
              storageKey="comm-unified-inbox"
              defaultLeft={30}
              minLeft={22}
              maxLeft={55}
              leftToolbar={<InboxToolbar />}
              left={
                <div className="h-[calc(100vh-160px)] min-h-[420px] rounded-lg border bg-card/40 backdrop-blur-sm overflow-hidden">
                  <InboxListPane
                    selected={selected}
                    onSelect={handleSelect}
                    onNewConversation={() => setComposeOpen(true)}
                    onRefresh={handleRefresh}
                    refreshing={fetching > 0}
                  />
                </div>
              }
              right={
                <div className="h-[calc(100vh-160px)] min-h-[420px] rounded-lg border bg-card/40 backdrop-blur-sm overflow-hidden">
                  <ConversationPane
                    selected={selected}
                    initialMessageId={initialMessageId ?? null}
                    onMessageJumpDone={onMessageJumpDone}
                  />
                </div>
              }
            />
          </div>
        </InboxSelectionProvider>
      </InboxFilterProvider>

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        currentUserId={user?.id ?? null}
        onCreated={(threadId) => {
          setComposeOpen(false);
          const sel: InboxSelection = { kind: "group", id: threadId };
          handleSelect(sel);
          void navigate({
            to: "/ops/communication",
            search: { scope: undefined, id: undefined },
          });
        }}
      />

      <StarredMessagesDialog
        open={starredOpen}
        onOpenChange={setStarredOpen}
        onJump={(sel, messageId) => {
          handleSelect(sel);
          const scope = sel.kind === "task" ? "task" : sel.kind === "group" ? "group" : "dm";
          void navigate({
            to: "/ops/communication",
            search: { scope, id: sel.id, msg: messageId } as Record<string, unknown>,
            replace: true,
          });
        }}
      />
    </>
  );
}
