import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/email/log")({
  component: SendLogPage,
  errorComponent: RouteErrorComponent,
});

type Row = {
  message_id: string | null;
  template_name: string | null;
  recipient_email: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

function SendLogPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["email-send-log", "recent"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("email_send_log" as never)
        .select("message_id, template_name, recipient_email, status, error_message, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) return [] as Row[];
      const rows = (data ?? []) as Row[];
      // Deduplicate by message_id (latest only)
      const seen = new Set<string>();
      const out: Row[] = [];
      for (const r of rows) {
        const key = r.message_id ?? `${r.recipient_email}-${r.created_at}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(r);
      }
      return out.slice(0, 100);
    },
  });

  return (
    <AuthGuard allow={["admin"]}>
      <AppShell crumbs={[{ label: "Email", to: "/email" }, { label: "Send Log" }]}>
        <PageHeader
          title="Email Send Log"
          description="Latest 100 outgoing emails from the last 30 days, deduplicated by message id."
          actions={
            <Link to="/email" className="inline-flex items-center gap-1 text-sm hover:underline">
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Email
            </Link>
          }
        />

        <Card className="glass border-border-subtle">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !data || data.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground text-center">
                No emails recorded in the last 30 days.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left px-3 py-2">Sent</th>
                      <th className="text-left px-3 py-2">Template</th>
                      <th className="text-left px-3 py-2">Recipient</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((r, i) => (
                      <tr key={i} className="border-t border-border-subtle">
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">{r.template_name ?? "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">{r.recipient_email ?? "—"}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={r.status} />
                        </td>
                        <td
                          className="px-3 py-2 text-xs text-rose-600 dark:text-rose-400 max-w-md truncate"
                          title={r.error_message ?? ""}
                        >
                          {r.error_message ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </AppShell>
    </AuthGuard>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    sent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    pending: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    dlq: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    failed: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    bounced: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    suppressed: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    complained: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  };
  return (
    <Badge variant="outline" className={map[status] ?? ""}>
      {status}
    </Badge>
  );
}
