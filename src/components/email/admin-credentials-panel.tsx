import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, AlertTriangle, Copy, ExternalLink, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { getEmailProviderStatus } from "@/lib/email/connect.functions";

const REQUIRED_SECRETS = [
  {
    key: "MS_GRAPH_CLIENT_ID",
    label: "Application (client) ID",
    where: "Azure portal → Entra ID → App registrations → your app → Overview",
  },
  {
    key: "MS_GRAPH_CLIENT_SECRET",
    label: "Client secret value",
    where:
      "Azure portal → your app → Certificates & secrets → New client secret (copy the Value, not the ID)",
  },
  {
    key: "MS_GRAPH_REDIRECT_URI",
    label: "Redirect URI",
    where: "Must match the Authentication → Redirect URIs entry in Azure exactly.",
  },
] as const;

export function EmailAdminCredentialsPanel() {
  const status = useServerFn(getEmailProviderStatus);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["email", "provider-status"],
    queryFn: () => status(),
  });

  const expectedRedirect =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/email/oauth/microsoft/callback`
      : "";

  const ms = data?.microsoft;
  const allSet = ms?.configured ?? false;

  const copy = (txt: string, label: string) => {
    navigator.clipboard.writeText(txt);
    toast.success(`${label} copied`);
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Microsoft 365 credentials</h3>
            <p className="text-xs text-muted-foreground">
              Required server secrets for OAuth sign-in.
            </p>
          </div>
        </div>
        {isLoading ? null : allSet ? (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Configured
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Missing
          </Badge>
        )}
      </div>

      {!allSet && !isLoading ? (
        <div className="text-xs rounded-md border border-dashed p-3 bg-muted/40 space-y-2">
          <p className="font-medium text-foreground">How to set these up</p>
          <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
            <li>
              Open{" "}
              <a
                className="underline inline-flex items-center gap-0.5"
                href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
                target="_blank"
                rel="noreferrer"
              >
                Entra admin center <ExternalLink className="h-3 w-3" />
              </a>{" "}
              → App registrations → <b>New registration</b>.
            </li>
            <li>
              Supported account types:{" "}
              <i>Accounts in any organizational directory and personal Microsoft accounts</i>.
            </li>
            <li>
              Under <b>Redirect URI</b> (Web), paste the URL shown below.
            </li>
            <li>
              <b>API permissions → Add → Microsoft Graph → Delegated</b>:{" "}
              <code className="text-[10px]">Mail.ReadWrite</code>,{" "}
              <code className="text-[10px]">Mail.Send</code>,{" "}
              <code className="text-[10px]">MailboxSettings.Read</code>,{" "}
              <code className="text-[10px]">offline_access</code>,{" "}
              <code className="text-[10px]">User.Read</code>.
            </li>
            <li>
              <b>Certificates &amp; secrets → New client secret</b> → copy the Value.
            </li>
            <li>
              Paste the three values into your environment secrets using the exact names below, then
              click <b>Recheck</b>.
            </li>
          </ol>
        </div>
      ) : null}

      <Separator />

      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Redirect URI to register in Azure</div>
        <div className="flex items-center gap-2 p-2 rounded-md border bg-muted/40">
          <code className="text-xs flex-1 truncate">{expectedRedirect}</code>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => copy(expectedRedirect, "Redirect URI")}
            aria-label="Copy redirect URI"
            title="Copy"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
        {ms?.redirectUri && ms.redirectUri !== expectedRedirect ? (
          <p className="text-xs text-amber-600">
            Heads up: configured MS_GRAPH_REDIRECT_URI is <code>{ms.redirectUri}</code> — Azure must
            be registered with the URI above.
          </p>
        ) : null}
      </div>

      <Separator />

      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">Required secrets</div>
        <div className="space-y-1.5">
          {REQUIRED_SECRETS.map((s) => {
            const set =
              s.key === "MS_GRAPH_CLIENT_ID"
                ? ms?.hasClientId
                : s.key === "MS_GRAPH_CLIENT_SECRET"
                  ? ms?.hasClientSecret
                  : ms?.hasRedirectUri;
            return (
              <div
                key={s.key}
                className="flex items-start gap-2 p-2 rounded-md border bg-card text-xs"
              >
                <div className="mt-0.5">
                  {set ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="font-mono text-[11px]">{s.key}</code>
                    <span className="text-muted-foreground">— {s.label}</span>
                  </div>
                  <div className="text-muted-foreground mt-0.5">{s.where}</div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => copy(s.key, s.key)}
                  aria-label={`Copy ${s.key}`}
                  title="Copy name"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Paste these into your deployment environment secrets (Cloudflare Workers). They are stored
          server-side only and never reach the browser.
        </p>
      </div>

      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Recheck
        </Button>
      </div>
    </Card>
  );
}
