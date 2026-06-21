import { Mail, RefreshCw, AlertCircle, Pause, CheckCircle2, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { disconnectEmailAccount, type ConnectedAccount } from "@/lib/email/accounts.functions";

const STATUS_META: Record<
  ConnectedAccount["sync_status"],
  { label: string; icon: typeof CheckCircle2 }
> = {
  idle: { label: "Up to date", icon: CheckCircle2 },
  syncing: { label: "Syncing", icon: RefreshCw },
  error: { label: "Error", icon: AlertCircle },
  paused: { label: "Paused", icon: Pause },
};

export function AccountHealthCard({ account }: { account: ConnectedAccount }) {
  const queryClient = useQueryClient();
  const disconnect = useServerFn(disconnectEmailAccount);
  const Status = STATUS_META[account.sync_status];

  const disconnectMutation = useMutation({
    mutationFn: () => disconnect({ data: { accountId: account.id } }),
    onSuccess: () => {
      toast.success(`Disconnected ${account.email_address}`);
      queryClient.invalidateQueries({ queryKey: ["email", "accounts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 flex items-start gap-3">
      <div className="rounded-md bg-muted p-2">
        <Mail className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium truncate">{account.email_address}</div>
          <Badge variant="outline" className="text-xs uppercase">
            {account.provider}
          </Badge>
          <Badge variant="secondary" className="gap-1 text-xs">
            <Status.icon className="h-3 w-3" />
            {Status.label}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {account.last_synced_at
            ? `Last synced ${new Date(account.last_synced_at).toLocaleString()}`
            : "Never synced"}
        </div>
        {account.sync_error ? (
          <div className="text-xs text-destructive mt-1">{account.sync_error}</div>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (confirm(`Disconnect ${account.email_address}? Cached emails will be removed.`)) {
            disconnectMutation.mutate();
          }
        }}
        disabled={disconnectMutation.isPending}
        title="Disconnect account"
        aria-label="Disconnect account"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </Card>
  );
}
