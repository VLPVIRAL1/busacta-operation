import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Mail, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { checkEsignEmailDns, type EmailDnsResult } from "@/lib/esign/email-dns.functions";

const STATUS_META = {
  ok: {
    Icon: CheckCircle2,
    badge: "default" as const,
    color: "text-emerald-600 dark:text-emerald-400",
  },
  warn: {
    Icon: AlertTriangle,
    badge: "secondary" as const,
    color: "text-amber-600 dark:text-amber-400",
  },
  fail: { Icon: XCircle, badge: "destructive" as const, color: "text-red-600 dark:text-red-400" },
};

export function EmailDeliveryCheck() {
  const checkFn = useServerFn(checkEsignEmailDns);
  const [result, setResult] = useState<EmailDnsResult | null>(null);

  const mut = useMutation({
    mutationFn: () => checkFn({ data: {} }),
    onSuccess: (r) => setResult(r),
  });

  const overall = result?.overall;
  const overallMeta = overall ? STATUS_META[overall] : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">Email delivery</CardTitle>
          {overallMeta && (
            <Badge variant={overallMeta.badge} className="text-xs">
              {overall === "ok" ? "Ready" : overall === "warn" ? "Verifying" : "Action required"}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => mut.mutate()}
          disabled={mut.isPending}
          title="Re-check DNS for the email sender subdomain"
          aria-label="Re-check DNS"
        >
          {mut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span className="ml-1.5">{result ? "Re-check" : "Verify DNS"}</span>
        </Button>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {!result && !mut.isPending && (
          <p className="text-sm text-muted-foreground">
            Run a check to verify the outgoing-email subdomain is delegated correctly. Until DNS is
            live, signer emails queue but don&apos;t deliver.
          </p>
        )}
        {mut.error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {mut.error instanceof Error ? mut.error.message : String(mut.error)}
          </p>
        )}
        {result && (
          <>
            <div className="text-xs text-muted-foreground">
              Sender subdomain: <code className="font-mono">{result.sender_subdomain}</code>
            </div>
            <ul className="space-y-2">
              {result.checks.map((c, i) => {
                const meta = STATUS_META[c.status];
                const Icon = meta.Icon;
                return (
                  <li key={i} className="flex gap-2 items-start text-sm">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{c.label}</div>
                      <div className="text-xs text-muted-foreground">{c.detail}</div>
                      {c.fix && (
                        <div className="text-xs mt-1 p-2 rounded bg-muted/60 border">
                          <span className="font-medium">Fix:</span> {c.fix}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {result.next_steps.length > 0 && (
              <div className="pt-2 border-t">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Next steps
                </div>
                <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
                  {result.next_steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
