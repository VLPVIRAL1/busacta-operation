import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { listConnectedAccounts } from "@/lib/email/accounts.functions";
import { AccountHealthCard } from "@/components/email/account-health-card";
import { ConnectAccountDialog } from "@/components/email/connect-account-dialog";
import { EmailAdminCredentialsPanel } from "@/components/email/admin-credentials-panel";

export const Route = createFileRoute("/email/settings")({
  component: () => (
    <AuthGuard>
      <AppShell
        crumbs={[
          { label: "Email", to: "/email" },
          { label: "Inbox", to: "/email/hub" },
          { label: "Settings" },
        ]}
      >
        <SettingsPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function SettingsPage() {
  const list = useServerFn(listConnectedAccounts);
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["email", "accounts"],
    queryFn: () => list(),
  });

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" aria-label="Back to Email Inbox">
            <Link to="/email/hub">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-lg font-semibold">Email connections</h1>
            <p className="text-xs text-muted-foreground">
              Connect, monitor and disconnect your mailboxes.
            </p>
          </div>
        </div>
        <ConnectAccountDialog />
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (accounts?.length ?? 0) === 0 ? (
        <div className="text-sm text-muted-foreground border border-dashed rounded-md p-6 text-center">
          No mailboxes connected yet.
        </div>
      ) : (
        <div className="space-y-2">
          {accounts!.map((a) => (
            <AccountHealthCard key={a.id} account={a} />
          ))}
        </div>
      )}

      <EmailAdminCredentialsPanel />
    </div>
  );
}
