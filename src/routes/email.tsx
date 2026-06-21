import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Mail, ScrollText, ShieldCheck, AlertTriangle } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { StatCard } from "@/components/shared/stat-card";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/email")({
  component: EmailHub,
  errorComponent: RouteErrorComponent,
});

function EmailHub() {
  // Lightweight stats from email_send_log (deduplicated by message_id, last 7d).
  const { data: stats, isLoading } = useQuery({
    queryKey: ["email-hub", "stats-7d"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("email_send_log" as never)
        .select("message_id, status, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) return { total: 0, sent: 0, failed: 0, suppressed: 0, available: false };
      const rows = (data ?? []) as Array<{ message_id: string | null; status: string }>;
      const latestByMsg = new Map<string, string>();
      for (const r of rows) {
        if (!r.message_id) continue;
        if (!latestByMsg.has(r.message_id)) latestByMsg.set(r.message_id, r.status);
      }
      const statuses = [...latestByMsg.values()];
      return {
        total: statuses.length,
        sent: statuses.filter((s) => s === "sent").length,
        failed: statuses.filter((s) => s === "dlq" || s === "failed" || s === "bounced").length,
        suppressed: statuses.filter((s) => s === "suppressed" || s === "complained").length,
        available: true,
      };
    },
  });

  return (
    <AuthGuard allow={["admin"]}>
      <AppShell crumbs={[{ label: "Email" }]}>
        <PageHeader
          title="Email"
          description="Authentication and app emails sent from your verified domain. Manage templates, monitor delivery, and review failures."
        />

        <div className="grid gap-4 lg:grid-cols-4">
          <StatCard label="Sent (7d)" value={stats?.sent} loading={isLoading} tone="ok" />
          <StatCard label="Failed (7d)" value={stats?.failed} loading={isLoading} tone="err" />
          <StatCard
            label="Suppressed (7d)"
            value={stats?.suppressed}
            loading={isLoading}
            tone="warn"
          />
          <StatCard label="Total (7d)" value={stats?.total} loading={isLoading} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2 mt-4">
          <Card className="glass border-border-subtle">
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Mail className="h-4 w-4" />
              <CardTitle className="text-base">Domain & Templates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Email domain setup, DNS verification, and template management live in Lovable Cloud
                → Emails. Once your domain is verified, auth and app emails are sent automatically
                from your branded address.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="outline" className="gap-1">
                  <ShieldCheck className="h-3 w-3" /> Auth emails: password reset, magic link,
                  verification
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Mail className="h-3 w-3" /> App emails: confirmations, notifications, receipts
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="glass border-border-subtle">
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <ScrollText className="h-4 w-4" />
              <CardTitle className="text-base">Delivery monitoring</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Every outgoing email is recorded in the send log with its final status. Use the log
                to investigate bounces, failures, and suppressions.
              </p>
              <Link
                to="/email/log"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                Open Send Log →
              </Link>
            </CardContent>
          </Card>
        </div>

        {!isLoading && stats?.available === false && (
          <Card className="glass border-border-subtle mt-4">
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base">Send log not yet provisioned</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                The <code>email_send_log</code> table isn't available yet. Set up email
                infrastructure in Lovable Cloud → Emails to start tracking deliveries.
              </CardDescription>
            </CardContent>
          </Card>
        )}
      </AppShell>
    </AuthGuard>
  );
}
