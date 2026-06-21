import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Inbox, Settings, RefreshCw, Mail, Filter } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { listConnectedAccounts, type ConnectedAccount } from "@/lib/email/accounts.functions";
import { listThreads } from "@/lib/email/threads.functions";
import { syncAccountNow } from "@/lib/email/sync.functions";
import { ConnectAccountDialog } from "@/components/email/connect-account-dialog";
import { AccountSwitcher } from "@/components/email/account-switcher";
import { FolderRail, type EmailFolder } from "@/components/email/folder-rail";
import { ThreadFeed } from "@/components/email/thread-feed";
import { ThreadReader } from "@/components/email/thread-reader";
import { toast } from "sonner";

export const Route = createFileRoute("/email/hub")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "Email", to: "/email" }, { label: "Inbox" }]} fullBleed>
        <EmailHubPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function EmailHubPage() {
  const list = useServerFn(listConnectedAccounts);
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["email", "accounts"],
    queryFn: () => list(),
  });

  const hasAccounts = (accounts?.length ?? 0) > 0;

  if (isLoading) {
    return (
      <div className="h-full grid place-items-center text-sm text-muted-foreground">
        Loading mailboxes…
      </div>
    );
  }

  if (!hasAccounts) {
    return (
      <div className="h-full flex flex-col">
        <Header right={<ConnectAccountDialog />} />
        <div className="flex-1 overflow-y-auto p-6">
          <EmptyState />
        </div>
      </div>
    );
  }

  return <InboxShell accounts={accounts!} />;
}

function Header({ right, children }: { right?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-2 px-3 py-2 border-b shrink-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Inbox className="h-4 w-4 text-muted-foreground shrink-0" />
        <h1 className="text-sm font-semibold shrink-0">Email Hub</h1>
        {children}
      </div>
      <div className="flex items-center gap-1.5">
        {right}
        <Button
          asChild
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          title="Settings"
          aria-label="Settings"
        >
          <Link to="/email/settings">
            <Settings className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </header>
  );
}

function InboxShell({ accounts }: { accounts: ConnectedAccount[] }) {
  const list = useServerFn(listThreads);
  const syncFn = useServerFn(syncAccountNow);
  const queryClient = useQueryClient();

  const [activeId, setActiveId] = useState<string>(() => accounts[0]!.id);
  const [folder, setFolder] = useState<EmailFolder>("inbox");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Clamp activeId in case accounts list changes.
  useEffect(() => {
    if (!accounts.find((a) => a.id === activeId)) setActiveId(accounts[0]!.id);
  }, [accounts, activeId]);

  const threadsKey = useMemo(
    () => ["email", "threads", activeId, folder, unreadOnly] as const,
    [activeId, folder, unreadOnly],
  );

  const {
    data: threads,
    isLoading: threadsLoading,
    isFetching: threadsFetching,
  } = useQuery({
    queryKey: threadsKey,
    queryFn: () =>
      list({
        data: {
          accountId: activeId,
          folder,
          unreadOnly,
        },
      }),
    enabled: !!activeId,
  });

  // Reset selection when switching account/folder.
  useEffect(() => {
    setSelectedThreadId(null);
  }, [activeId, folder]);

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await syncFn({ data: { accountId: activeId } });
      toast.success(
        `Sync complete — ${result.upserted} message${result.upserted === 1 ? "" : "s"} processed`,
      );
      queryClient.invalidateQueries({ queryKey: ["email", "threads"] });
      queryClient.invalidateQueries({ queryKey: ["email", "accounts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <Header
        right={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={handleSync}
              disabled={isSyncing}
              title="Sync this mailbox now"
              aria-label="Sync mailbox"
            >
              <RefreshCw className={isSyncing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              <span className="hidden md:inline">Sync</span>
            </Button>
            <Button
              type="button"
              variant={unreadOnly ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => setUnreadOnly((v) => !v)}
              title="Show unread only"
              aria-pressed={unreadOnly}
            >
              <Filter className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Unread</span>
            </Button>
            <ConnectAccountDialog />
          </>
        }
      >
        <div className="ml-2 min-w-0">
          <AccountSwitcher accounts={accounts} activeId={activeId} onChange={setActiveId} />
        </div>
      </Header>

      <div className="flex-1 flex min-h-0">
        <aside className="w-44 border-r shrink-0 overflow-y-auto hidden md:block">
          <FolderRail active={folder} onChange={setFolder} />
        </aside>
        <div className="flex-1 min-w-0">
          <ResizableTwoPane
            storageKey="emails-inbox"
            defaultLeft={38}
            minLeft={25}
            maxLeft={65}
            hideToolbar
            left={
              <div className="h-full overflow-y-auto border-r min-h-0">
                <ThreadFeed
                  threads={threads ?? []}
                  selectedId={selectedThreadId}
                  onSelect={setSelectedThreadId}
                  isLoading={threadsLoading || (threadsFetching && !threads)}
                />
              </div>
            }
            right={
              <div className="h-full min-h-0">
                <ThreadReader threadId={selectedThreadId} />
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="max-w-xl mx-auto text-center space-y-4 py-12">
      <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
        <Mail className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">No mailboxes connected</h2>
        <p className="text-sm text-muted-foreground">
          Connect Microsoft 365 or Gmail to triage your inbox here and link threads to Firms,
          Projects and Tasks.
        </p>
      </div>
      <Card className="p-4 text-left text-xs text-muted-foreground bg-muted/40 border-dashed">
        Your inbox stays private. Other employees can only see an email after you explicitly link
        the thread to a shared Task, Project or Firm.
      </Card>
      <ConnectAccountDialog />
    </div>
  );
}
