import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plug,
  Save,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Mail,
  Upload,
  Play,
  ClipboardList,
  BarChart2,
  List,
  Activity,
  Database,
  RotateCcw,
  XCircle,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  migrateTaskAttachmentsToSharePoint,
  getFirmProjectsSharePointStatus,
  getProjectFileStats,
  triggerDeltaSync,
  getProjectsListProvisioningStatus,
  enqueueProjectListsProvisioning,
  getSharePointSyncStatus,
  triggerInitialSync,
  resetProjectSync,
  type MigrationResult,
  type ProjectFileStat,
  type TriggerSyncResult,
  type ProjectListProvisioningStatus,
  type SyncStatusRow,
} from "@/lib/sharepoint/sharepoint.functions";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { AdminGuide } from "@/components/admin/admin-guide";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  getIntegrationConfig,
  saveIntegrationConfig,
  testIntegrationConnection,
} from "@/lib/sharepoint/integrations.functions";
import {
  getMicrosoftEmailOAuthConfig,
  saveMicrosoftEmailOAuthConfig,
  testMicrosoftEmailOAuthConfig,
} from "@/lib/email/connect.functions";

export const Route = createFileRoute("/admin/integrations")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/integration", search: { tab: "microsoft" } });
  },
});

export function IntegrationsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const body = (
    <div className="grid gap-4 max-w-3xl">
      <AdminGuide pageName="microsoft-integration" title="Microsoft Setup Guide">
        <p className="font-semibold text-foreground mb-2">
          One Azure App Registration, one Client ID, one Client Secret — powers both SharePoint and
          Email OAuth. No separate secrets needed. Paste the same credentials into both cards below.
        </p>

        <p className="font-medium mt-3 mb-1">Step 1 — Create the App Registration</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>
            Open{" "}
            <a
              className="underline text-primary"
              href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade"
              target="_blank"
              rel="noreferrer"
            >
              Azure Portal → New App Registration
            </a>
          </li>
          <li>
            Name it anything (e.g. <strong>BusAcTa Operations</strong>)
          </li>
          <li>
            Supported account types →{" "}
            <strong>Accounts in any organizational directory + personal Microsoft accounts</strong>
          </li>
          <li>
            Redirect URI → Platform: <strong>Web</strong> → paste:{" "}
            <code className="text-[11px] bg-muted px-1 rounded">
              https://offshoreaccounting.us/api/public/email/oauth/microsoft/callback
            </code>
          </li>
          <li>
            Click <strong>Register</strong>
          </li>
        </ol>

        <p className="font-medium mt-3 mb-1">
          Step 2 — Fix token version (required for multi-tenant)
        </p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>
            Go to <strong>Manifest</strong> in the left menu
          </li>
          <li>
            Find{" "}
            <code className="text-[11px] bg-muted px-1 rounded">"requestedAccessTokenVersion"</code>{" "}
            → set it to <code className="text-[11px] bg-muted px-1 rounded">2</code>
          </li>
          <li>
            Click <strong>Save</strong>
          </li>
        </ol>

        <p className="font-medium mt-3 mb-1">Step 3 — Add API Permissions</p>
        <p className="text-muted-foreground mb-1">
          Go to{" "}
          <a
            className="underline text-primary"
            href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/cba77cb8-6f5f-420e-baf1-886efe65b96e"
            target="_blank"
            rel="noreferrer"
          >
            API Permissions
          </a>{" "}
          → Add a permission → Microsoft Graph:
        </p>
        <div className="grid grid-cols-2 gap-x-4 text-[11px]">
          <div>
            <p className="font-medium text-foreground">Delegated (Email OAuth)</p>
            <ul className="list-disc pl-3 space-y-0.5 text-muted-foreground">
              <li>email</li>
              <li>Mail.Read</li>
              <li>Mail.ReadWrite</li>
              <li>Mail.Send</li>
              <li>MailboxSettings.Read</li>
              <li>offline_access</li>
              <li>openid</li>
              <li>profile</li>
              <li>User.Read</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-foreground">Application (SharePoint)</p>
            <ul className="list-disc pl-3 space-y-0.5 text-muted-foreground">
              <li>Files.ReadWrite.All</li>
              <li>Sites.ReadWrite.All</li>
            </ul>
            <p className="font-medium text-foreground mt-2">Then click:</p>
            <p className="text-muted-foreground">
              <strong>Grant admin consent</strong> button at the top of the permissions list
            </p>
          </div>
        </div>

        <p className="font-medium mt-3 mb-1">Step 4 — Create a Client Secret</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>
            Go to <strong>Certificates &amp; secrets → New client secret</strong>
          </li>
          <li>
            Set an expiry → click <strong>Add</strong>
          </li>
          <li>
            Copy the <strong>Value</strong> column immediately — NOT the Secret ID (GUID). Value
            looks like <code className="text-[11px] bg-muted px-1 rounded">abc123~Xyz...</code>, not
            a GUID. It disappears on page reload — if lost, delete and create a new secret.
          </li>
        </ol>

        <p className="font-medium mt-3 mb-1">Step 5 — Collect your credentials</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>
            <strong>Tenant ID</strong> — App Registration →{" "}
            <a
              className="underline text-primary"
              href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Overview/appId/cba77cb8-6f5f-420e-baf1-886efe65b96e"
              target="_blank"
              rel="noreferrer"
            >
              Overview
            </a>{" "}
            → Directory (tenant) ID
          </li>
          <li>
            <strong>Client ID</strong> — same Overview page → Application (client) ID
          </li>
          <li>
            <strong>Client Secret</strong> — the Value you copied in Step 4
          </li>
          <li>
            <strong>Tenant Domain</strong> — the short name of your M365 tenant, visible in
            SharePoint URLs as{" "}
            <code className="text-[11px] bg-muted px-1 rounded">
              https://[tenant-domain].sharepoint.com
            </code>
          </li>
        </ul>

        <p className="font-medium mt-3 mb-1">Step 6 — Create SharePoint sites &amp; libraries</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>
            In <strong>SharePoint Admin</strong>, create one site per B2B firm. Share the site URL
            with the BusAcTa admin.
          </li>
          <li>
            For each project, create a <strong>Document Library</strong> inside the firm's site.
            Recommended naming:{" "}
            <code className="text-[11px] bg-muted px-1 rounded">YYYY Service Type</code> — e.g.{" "}
            <em>2026 Tax Preparation</em>, <em>2026 Bookkeeping</em>. Libraries cannot be renamed
            after creation without breaking BusAcTa's stored URL.
          </li>
          <li>
            In each firm's settings in BusAcTa, paste the SharePoint site URL → BusAcTa resolves the
            site ID automatically.
          </li>
          <li>
            In each project's settings in BusAcTa, paste the Document Library URL → BusAcTa resolves
            the drive ID automatically.
          </li>
        </ol>

        <p className="font-medium mt-3 mb-1">Step 7 — Fill in the cards below &amp; Save</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>
            <strong>SharePoint card</strong> — Tenant ID + Client ID + Secret + Tenant Domain →
            Enable → Save → Test connection
          </li>
          <li>
            <strong>Email OAuth card</strong> — Client ID + Secret + Redirect URI → Enable → Save
          </li>
          <li>
            Users can then connect their mailbox from{" "}
            <strong>Email Hub → Settings → Connect mailbox</strong>
          </li>
        </ul>
      </AdminGuide>

      <MicrosoftGraphCard />
      <Separator />
      <MicrosoftEmailOAuthCard />
      <Separator />
      <SharePointMigrationCard />
      <Separator />
      <SharePointStatsCard />
      <Separator />
      <SharePointSyncStatusCard />
      <Separator />
      <SharePointListsCard />
    </div>
  );

  if (embedded) return body;

  return (
    <AuthGuard allow={["super_admin", "admin"]}>
      <AppShell crumbs={[{ label: "Admin", to: "/admin/team" }, { label: "Integrations" }]}>
        <PageHeader
          title="Integrations"
          description="Connect external services. Credentials are stored securely in the database — no environment variables needed."
        />
        {body}
      </AppShell>
    </AuthGuard>
  );
}

type FormState = {
  tenant_id: string;
  client_id: string;
  client_secret: string;
  tenant_domain: string;
  onenote_site_url: string;
  training_folder_path: string;
  is_active: boolean;
  sharepoint_enabled: boolean;
  sharepoint_lists_enabled: boolean;
  onenote_enabled: boolean;
};

const EMPTY: FormState = {
  tenant_id: "",
  client_id: "",
  client_secret: "",
  tenant_domain: "",
  onenote_site_url: "",
  training_folder_path: "",
  is_active: false,
  sharepoint_enabled: true,
  sharepoint_lists_enabled: true,
  onenote_enabled: true,
};

function MicrosoftGraphCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getIntegrationConfig);
  const saveFn = useServerFn(saveIntegrationConfig);
  const testFn = useServerFn(testIntegrationConnection);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "integrations", "microsoft_graph"],
    queryFn: () => getFn({ data: { integration_key: "microsoft_graph" } }),
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [secretPlaceholder, setSecretPlaceholder] = useState("");

  useEffect(() => {
    if (data) {
      setForm({
        tenant_id: String(data.config?.tenant_id ?? ""),
        client_id: String(data.config?.client_id ?? ""),
        client_secret: "",
        tenant_domain: String(data.config?.tenant_domain ?? ""),
        onenote_site_url: String(data.config?.onenote_site_url ?? ""),
        training_folder_path: String(data.config?.training_folder_path ?? ""),
        is_active: data.is_active,
        // Absent flag = enabled (back-compat with configs saved before toggles).
        sharepoint_enabled: data.config?.sharepoint_enabled !== false,
        sharepoint_lists_enabled: data.config?.sharepoint_lists_enabled !== false,
        onenote_enabled: data.config?.onenote_enabled !== false,
      });
      setSecretPlaceholder(String(data.config?.client_secret ?? ""));
      setDirty(false);
    }
  }, [data]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          integration_key: "microsoft_graph",
          tenant_id: form.tenant_id.trim(),
          client_id: form.client_id.trim(),
          client_secret: form.client_secret,
          tenant_domain: form.tenant_domain.trim(),
          onenote_site_url: form.onenote_site_url.trim(),
          training_folder_path: form.training_folder_path.trim(),
          is_active: form.is_active,
          sharepoint_enabled: form.sharepoint_enabled,
          sharepoint_lists_enabled: form.sharepoint_lists_enabled,
          onenote_enabled: form.onenote_enabled,
        },
      }),
    onSuccess: () => {
      toast.success("Integration saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "integrations", "microsoft_graph"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: () => testFn({ data: { integration_key: "microsoft_graph" } }),
    onSuccess: (res) => {
      if (res.ok)
        toast.success(`Connected${res.tenantDisplayName ? ` — ${res.tenantDisplayName}` : ""}`);
      else toast.error(`Test failed: ${res.error}`);
      qc.invalidateQueries({ queryKey: ["admin", "integrations", "microsoft_graph"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <Skeleton className="h-96" />;
  }

  const status = data?.last_test_status;
  const isConfigured =
    !!form.tenant_id &&
    !!form.client_id &&
    (!!secretPlaceholder || !!form.client_secret) &&
    !!form.tenant_domain;

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Plug className="h-4 w-4" />
        <CardTitle className="text-base">Microsoft Graph / SharePoint</CardTitle>
        <div className="ml-auto flex items-center gap-2">
          {form.is_active ? (
            <Badge variant="default" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> Enabled
            </Badge>
          ) : (
            <Badge variant="secondary">Disabled</Badge>
          )}
          {status === "ok" && (
            <Badge variant="outline" className="gap-1 text-emerald-600">
              <CheckCircle2 className="h-3 w-3" /> Last test OK
            </Badge>
          )}
          {status === "failed" && (
            <Badge variant="outline" className="gap-1 text-destructive">
              <AlertTriangle className="h-3 w-3" /> Last test failed
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Powers SharePoint folder hierarchy mirroring and bidirectional metadata sync for the
          Document Hub. Create an Azure App Registration with{" "}
          <code className="text-xs">Sites.ReadWrite.All</code> and{" "}
          <code className="text-xs">Files.ReadWrite.All</code> application permissions, then paste
          the values below. SharePoint sites and Document Libraries are created manually in
          SharePoint Admin — BusAcTa resolves IDs automatically from the URLs you paste.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tenant ID" hint="Azure AD directory (tenant) ID">
            <Input
              value={form.tenant_id}
              onChange={(e) => set("tenant_id", e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </Field>
          <Field label="Client ID" hint="App registration's Application (client) ID">
            <Input
              value={form.client_id}
              onChange={(e) => set("client_id", e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </Field>
          <Field
            label="Client Secret"
            hint={
              secretPlaceholder
                ? "Leave blank to keep the saved secret"
                : "Generate one in the App registration"
            }
          >
            <Input
              type="password"
              value={form.client_secret}
              onChange={(e) => set("client_secret", e.target.value)}
              placeholder={secretPlaceholder || "Enter secret"}
            />
          </Field>
          <Field
            label="Tenant Domain"
            hint='Your M365 tenant short name — the part before ".sharepoint.com" (e.g. "contoso")'
          >
            <Input
              value={form.tenant_domain}
              onChange={(e) => set("tenant_domain", e.target.value)}
              placeholder="contoso"
            />
          </Field>
          <Field
            label="OneNote SharePoint Site"
            hint="SharePoint site URL where employee Daily Note notebooks are created. The app stores one notebook per employee here — no separate service account needed."
            className="sm:col-span-2"
          >
            <Input
              type="url"
              value={form.onenote_site_url}
              onChange={(e) => set("onenote_site_url", e.target.value)}
              placeholder="https://contoso.sharepoint.com/sites/Notes"
            />
          </Field>
          <Field
            label="Training Library Folder"
            hint='SharePoint folder path for training videos & PDFs. Defaults to "Training" if left blank.'
            className="sm:col-span-2"
          >
            <Input
              value={form.training_folder_path}
              onChange={(e) => set("training_folder_path", e.target.value)}
              placeholder="Training"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border-subtle p-3">
          <div>
            <Label className="text-sm">Enable integration</Label>
            <p className="text-xs text-muted-foreground">
              When enabled, the worker will start provisioning SharePoint sites/folders for new
              firms, projects, and tasks.
            </p>
          </div>
          <Switch
            checked={form.is_active}
            onCheckedChange={(v) => set("is_active", v)}
            disabled={!isConfigured && !form.is_active}
          />
        </div>

        {/* Per-feature sync switches — let admins disable a single feature
            (e.g. OneNote) without tearing down the whole integration. */}
        <div className="space-y-2 rounded-md border border-border-subtle p-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Sync features</Label>
            {!form.is_active && (
              <span className="text-[11px] text-muted-foreground">
                (apply once the integration is enabled)
              </span>
            )}
          </div>
          <SyncFeatureToggle
            label="SharePoint document sync"
            description="Folder hierarchy + file sync for project Document Libraries."
            checked={form.sharepoint_enabled}
            onChange={(v) => set("sharepoint_enabled", v)}
          />
          <SyncFeatureToggle
            label="SharePoint backup Lists"
            description="Per-project Tasks / Messages / Audit / Documents mirror lists."
            checked={form.sharepoint_lists_enabled}
            onChange={(v) => set("sharepoint_lists_enabled", v)}
          />
          <SyncFeatureToggle
            label="OneNote daily-notes sync"
            description="Pushes each employee's Daily Note to their OneNote notebook. Turn off if you see OneNote 401 / permission errors."
            checked={form.onenote_enabled}
            onChange={(v) => set("onenote_enabled", v)}
          />
        </div>

        {data?.last_test_error && status === "failed" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <div className="font-medium mb-1">Last test error</div>
            <code className="break-all">{data.last_test_error}</code>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          <Button
            variant="outline"
            onClick={() => test.mutate()}
            disabled={test.isPending || !isConfigured || dirty}
            title={dirty ? "Save changes first" : "Test connection"}
          >
            <RefreshCw className={`h-4 w-4 ${test.isPending ? "animate-spin" : ""}`} />{" "}
            {test.isPending ? "Testing…" : "Test connection"}
          </Button>
          {data?.last_tested_at && (
            <span className="self-center text-xs text-muted-foreground">
              Last tested {new Date(data.last_tested_at).toLocaleString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SyncFeatureToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5${className ? ` ${className}` : ""}`}>
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

type EmailOAuthForm = {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  is_active: boolean;
};

const EMAIL_OAUTH_EMPTY: EmailOAuthForm = {
  client_id: "",
  client_secret: "",
  redirect_uri: "",
  is_active: false,
};

function MicrosoftEmailOAuthCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMicrosoftEmailOAuthConfig);
  const saveFn = useServerFn(saveMicrosoftEmailOAuthConfig);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "integrations", "microsoft_email_oauth"],
    queryFn: () => getFn(),
  });

  const [form, setForm] = useState<EmailOAuthForm>(EMAIL_OAUTH_EMPTY);
  const [dirty, setDirty] = useState(false);
  const [secretPlaceholder, setSecretPlaceholder] = useState("");

  useEffect(() => {
    if (data !== undefined) {
      setForm({
        client_id: data?.client_id ?? "",
        client_secret: "",
        redirect_uri: data?.redirect_uri ?? "",
        is_active: data?.is_active ?? false,
      });
      setSecretPlaceholder(data?.client_secret_masked ?? "");
      setDirty(false);
    }
  }, [data]);

  const set = <K extends keyof EmailOAuthForm>(k: K, v: EmailOAuthForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          client_id: form.client_id.trim(),
          client_secret: form.client_secret || undefined,
          redirect_uri: form.redirect_uri.trim(),
          is_active: form.is_active,
        },
      }),
    onSuccess: () => {
      toast.success("Email OAuth credentials saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "integrations", "microsoft_email_oauth"] });
      qc.invalidateQueries({ queryKey: ["email", "provider-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isConfigured =
    !!form.client_id && (!!secretPlaceholder || !!form.client_secret) && !!form.redirect_uri;

  const testFn = useServerFn(testMicrosoftEmailOAuthConfig);
  const test = useMutation({
    mutationFn: () => testFn(),
    onSuccess: (res) => {
      if (res.ok) toast.success(`Connected — ${res.message}`);
      else toast.error(`Test failed: ${res.message}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Mail className="h-4 w-4" />
        <CardTitle className="text-base">Microsoft 365 — Email OAuth (Mailbox Connect)</CardTitle>
        <div className="ml-auto">
          {form.is_active ? (
            <Badge variant="default" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> Enabled
            </Badge>
          ) : (
            <Badge variant="secondary">Disabled</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Allows users to connect their Microsoft 365 / Outlook mailboxes from{" "}
          <strong>Email Hub → Settings</strong>. Credentials are stored in the database — no
          environment variables needed. Create an Azure App Registration with delegated permissions{" "}
          <code className="text-xs">Mail.ReadWrite</code>,{" "}
          <code className="text-xs">Mail.Send</code>,{" "}
          <code className="text-xs">MailboxSettings.Read</code>,{" "}
          <code className="text-xs">offline_access</code>,{" "}
          <code className="text-xs">User.Read</code>.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Application (Client) ID"
            hint="Azure portal → App registrations → your app → Overview"
            className="sm:col-span-2"
          >
            <Input
              value={form.client_id}
              onChange={(e) => set("client_id", e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </Field>
          <Field
            label="Client Secret"
            hint={
              secretPlaceholder
                ? "Leave blank to keep the saved secret"
                : "Certificates & secrets → New client secret → copy the Value"
            }
            className="sm:col-span-2"
          >
            <Input
              type="password"
              value={form.client_secret}
              onChange={(e) => set("client_secret", e.target.value)}
              placeholder={secretPlaceholder || "Enter secret value"}
            />
          </Field>
          <Field
            label="Redirect URI"
            hint="Must match exactly what is registered under Authentication → Redirect URIs in Azure"
            className="sm:col-span-2"
          >
            <Input
              value={form.redirect_uri}
              onChange={(e) => set("redirect_uri", e.target.value)}
              placeholder="https://yourdomain.com/api/public/email/oauth/microsoft/callback"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border-subtle p-3">
          <div>
            <Label className="text-sm">Enable mailbox connections</Label>
            <p className="text-xs text-muted-foreground">
              When enabled, users can connect their Microsoft 365 inbox from Email Hub.
            </p>
          </div>
          <Switch
            checked={form.is_active}
            onCheckedChange={(v) => set("is_active", v)}
            disabled={!isConfigured && !form.is_active}
          />
        </div>

        {form.is_active && form.redirect_uri && (
          <p className="text-xs text-muted-foreground rounded-md border border-dashed p-2">
            Redirect URI registered in Azure must be exactly:{" "}
            <code className="break-all">{form.redirect_uri}</code>
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <Save className="h-4 w-4" />
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          <Button
            variant="outline"
            onClick={() => test.mutate()}
            disabled={test.isPending || !isConfigured || dirty}
            title={dirty ? "Save changes first" : "Test connection"}
          >
            <RefreshCw className={`h-4 w-4 ${test.isPending ? "animate-spin" : ""}`} />
            {test.isPending ? "Testing…" : "Test connection"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── SharePoint Migration Card ────────────────────────────────────────────────

function SharePointMigrationCard() {
  const migrateFn = useServerFn(migrateTaskAttachmentsToSharePoint);
  const getFirmsFn = useServerFn(getFirmProjectsSharePointStatus);

  const [firmId, setFirmId] = useState<string>("all");
  const [result, setResult] = useState<MigrationResult | null>(null);

  // Load firms that have SharePoint configured so user can filter
  const { data: firms = [] } = useQuery({
    queryKey: ["admin", "sp-firms"],
    queryFn: async () => {
      // Get all firms with SP configured by querying a placeholder firm_id
      // We can't call getFirmProjectsSharePointStatus without a firm_id,
      // so we fetch directly from the projects table via a supabase call.
      // For simplicity, we let the user type "all" or pick from a list
      // populated by a separate query in the future.
      return [] as Array<{ id: string; name: string }>;
    },
    staleTime: 60_000,
  });

  const migrate = useMutation({
    mutationFn: (dryRun: boolean) =>
      migrateFn({
        data: {
          firm_id: firmId !== "all" ? firmId : undefined,
          dry_run: dryRun,
        },
      }),
    onSuccess: (res) => {
      setResult(res);
      if (res.dry_run) {
        toast.success(`Dry run: ${res.folders_created} folders ready to provision`);
      } else {
        toast.success(
          `Migration complete: ${res.folders_created} folders, ${res.files_migrated} files, ${res.errors.length} errors`,
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Upload className="h-4 w-4" />
        <CardTitle className="text-base">Migrate Files to SharePoint</CardTitle>
        {migrate.isPending && (
          <Badge variant="secondary" className="ml-auto gap-1">
            <RefreshCw className="h-3 w-3 animate-spin" /> Running…
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Provisions a SharePoint folder for every task, then uploads any existing Supabase Storage
          attachments into it. Tasks with no files still get their folder created. Only projects
          with a configured Document Library are processed; others are skipped. Run a{" "}
          <strong>Dry Run</strong> first to preview counts without writing anything.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-sm">Firm</Label>
            <Select value={firmId} onValueChange={setFirmId}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All firms</SelectItem>
                {firms.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => migrate.mutate(true)}
              disabled={migrate.isPending}
            >
              <ClipboardList className="h-4 w-4" />
              {migrate.isPending && migrate.variables === true ? "Running…" : "Dry Run"}
            </Button>
            <Button onClick={() => migrate.mutate(false)} disabled={migrate.isPending}>
              <Play className="h-4 w-4" />
              {migrate.isPending && migrate.variables === false ? "Migrating…" : "Start Migration"}
            </Button>
          </div>
        </div>

        {result && (
          <div className="rounded-md border bg-muted/30 p-4 space-y-3">
            {/* ── Dry run ── */}
            {result.dry_run && (
              <>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  Dry run — nothing was written
                  <Badge variant="outline" className="ml-auto text-xs">
                    {result.total_tasks} tasks scanned
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-2">
                    <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                      {result.folders_created}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Folders to create</div>
                  </div>
                  <div className="rounded bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-2">
                    <div className="text-lg font-semibold text-blue-700 dark:text-blue-400">
                      {result.files_migrated}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Files to upload</div>
                  </div>
                  <div className="rounded bg-muted border p-2">
                    <div className="text-lg font-semibold">{result.skipped}</div>
                    <div className="text-[11px] text-muted-foreground">Skipped (no library)</div>
                  </div>
                </div>
              </>
            )}

            {/* ── Real run — jobs queued ── */}
            {!result.dry_run && (
              <>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Jobs queued — processing in background
                  <Badge variant="outline" className="ml-auto text-xs">
                    {result.total_tasks} tasks
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  The SharePoint worker picks up jobs automatically. Folder creation runs first;
                  file uploads follow once each folder is ready. Use <strong>Calculate</strong> in
                  the statistics card below to track progress.
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-2">
                    <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                      {result.folders_queued ?? 0}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Folder jobs</div>
                  </div>
                  <div className="rounded bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-2">
                    <div className="text-lg font-semibold text-blue-700 dark:text-blue-400">
                      {result.files_queued ?? 0}
                    </div>
                    <div className="text-[11px] text-muted-foreground">File jobs</div>
                  </div>
                  <div className="rounded bg-muted border p-2">
                    <div className="text-lg font-semibold">{result.skipped}</div>
                    <div className="text-[11px] text-muted-foreground">Skipped (no library)</div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── SharePoint File Statistics Card ─────────────────────────────────────────

function statusBadge(stat: ProjectFileStat) {
  if (!stat.sharepoint_configured) {
    return (
      <Badge variant="secondary" className="text-[10px]">
        — No library
      </Badge>
    );
  }
  if (stat.sharepoint_file_count === 0 && stat.supabase_file_count === 0) {
    return (
      <Badge variant="outline" className="text-[10px]">
        No files
      </Badge>
    );
  }
  if (stat.sharepoint_file_count === 0 && stat.supabase_file_count > 0) {
    return (
      <Badge variant="destructive" className="text-[10px] gap-1">
        <AlertTriangle className="h-3 w-3" /> Not migrated
      </Badge>
    );
  }
  if (stat.sharepoint_file_count < stat.supabase_file_count) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-300">
        <AlertTriangle className="h-3 w-3" /> Partial
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-300">
      <CheckCircle2 className="h-3 w-3" /> Synced
    </Badge>
  );
}

function SharePointStatsCard() {
  const statsFn = useServerFn(getProjectFileStats);
  const syncFn = useServerFn(triggerDeltaSync);
  const [stats, setStats] = useState<ProjectFileStat[] | null>(null);
  const [lastSync, setLastSync] = useState<TriggerSyncResult | null>(null);

  const calculate = useMutation({
    mutationFn: () => statsFn({ data: {} }),
    onSuccess: (rows) => {
      setStats(rows);
      toast.success(`Loaded stats for ${rows.length} project${rows.length !== 1 ? "s" : ""}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sync = useMutation({
    mutationFn: () => syncFn({ data: {} }),
    onSuccess: (r) => {
      setLastSync(r);
      toast.success(
        `Sync complete — ${r.documents_upserted} file${r.documents_upserted !== 1 ? "s" : ""} synced` +
          (r.folders_reconciled > 0
            ? `, ${r.folders_reconciled} folder${r.folders_reconciled !== 1 ? "s" : ""} linked`
            : ""),
      );
      // Refresh stats so counts update immediately
      calculate.mutate();
    },
    onError: (e: Error) => toast.error(`Sync failed: ${e.message}`),
  });

  const totalSupabase = stats?.reduce((s, r) => s + r.supabase_file_count, 0) ?? 0;
  const totalSharePoint = stats?.reduce((s, r) => s + r.sharepoint_file_count, 0) ?? 0;
  const busy = calculate.isPending || sync.isPending;

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <BarChart2 className="h-4 w-4" />
        <CardTitle className="text-base">SharePoint File Statistics</CardTitle>
        {busy && (
          <Badge variant="secondary" className="ml-auto gap-1">
            <RefreshCw className="h-3 w-3 animate-spin" />
            {sync.isPending ? "Syncing…" : "Calculating…"}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Shows per-project file counts across both storage layers. SharePoint is the source of
          truth. <strong>Sync Now</strong> performs a full re-scan of every configured drive and
          links any SharePoint folders to their matching BusAcTa tasks — use this when files saved
          directly in SharePoint are not appearing in the app.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => calculate.mutate()} disabled={busy} variant="outline">
            <BarChart2 className="h-4 w-4" />
            {calculate.isPending ? "Calculating…" : "Calculate"}
          </Button>
          <Button onClick={() => sync.mutate()} disabled={busy}>
            <RefreshCw className={`h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
            {sync.isPending ? "Syncing…" : "Sync Now"}
          </Button>
          {lastSync && !sync.isPending && (
            <span className="text-xs text-muted-foreground">
              Last sync: {lastSync.documents_upserted} file
              {lastSync.documents_upserted !== 1 ? "s" : ""} synced
              {lastSync.folders_reconciled > 0
                ? `, ${lastSync.folders_reconciled} folder${lastSync.folders_reconciled !== 1 ? "s" : ""} linked`
                : ""}
            </span>
          )}
          {stats && !lastSync && (
            <span className="text-xs text-muted-foreground">
              {stats.length} project{stats.length !== 1 ? "s" : ""} — {totalSupabase} Supabase /{" "}
              {totalSharePoint} SharePoint
            </span>
          )}
        </div>

        {stats && stats.length === 0 && (
          <p className="text-sm text-muted-foreground">No projects found.</p>
        )}

        {stats && stats.length > 0 && (
          <div className="rounded-md border overflow-hidden text-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Project</th>
                  <th className="text-right px-3 py-2 font-medium">Supabase</th>
                  <th className="text-right px-3 py-2 font-medium">SharePoint</th>
                  <th className="text-right px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stats.map((s) => {
                  const rowCls = !s.sharepoint_configured
                    ? ""
                    : s.sharepoint_file_count === 0 && s.supabase_file_count > 0
                      ? "bg-destructive/5"
                      : s.sharepoint_file_count < s.supabase_file_count
                        ? "bg-amber-50 dark:bg-amber-950/20"
                        : s.sharepoint_file_count > 0
                          ? "bg-emerald-50/50 dark:bg-emerald-950/10"
                          : "";
                  return (
                    <tr key={s.project_id} className={rowCls}>
                      <td className="px-3 py-2 font-medium truncate max-w-xs">{s.project_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.supabase_file_count}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-blue-700 dark:text-blue-400 font-medium">
                        {s.sharepoint_file_count}
                      </td>
                      <td className="px-3 py-2 text-right">{statusBadge(s)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── SharePoint Sync Status Card ─────────────────────────────────────────────
// Per-project table: Library | Initial sync | Subscription | Last delta | Files
// "Sync Now" enqueues initial_sync (if not done) or delta_sync_drive.
// "Reset Sync" hard-deletes document metadata and re-seeds from scratch.

function syncStatusBadge(row: SyncStatusRow) {
  if (!row.library_configured) {
    return (
      <Badge variant="secondary" className="text-[10px]">
        No library
      </Badge>
    );
  }
  if (!row.initial_sync_done) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-300">
        <AlertTriangle className="h-3 w-3" /> Pending
      </Badge>
    );
  }
  if (row.subscription_status === "active") {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-300">
        <Activity className="h-3 w-3" /> Live
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] gap-1 text-blue-600 border-blue-300">
      <CheckCircle2 className="h-3 w-3" /> Synced
    </Badge>
  );
}

function SharePointSyncStatusCard() {
  const qc = useQueryClient();
  const getStatusFn = useServerFn(getSharePointSyncStatus);
  const triggerInitialFn = useServerFn(triggerInitialSync);
  const resetFn = useServerFn(resetProjectSync);

  const [resetTarget, setResetTarget] = useState<SyncStatusRow | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const {
    data: rows = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["admin", "sp-sync-status"],
    queryFn: () => getStatusFn({ data: {} }),
    staleTime: 30_000,
  });

  const syncNow = useMutation({
    mutationFn: async (row: SyncStatusRow) => {
      setActioningId(row.project_id);
      return triggerInitialFn({ data: { project_id: row.project_id } });
    },
    onSuccess: (_, row) => {
      toast.success(`Sync job queued for "${row.project_name}"`);
      setActioningId(null);
      refetch();
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setActioningId(null);
    },
  });

  const resetSync = useMutation({
    mutationFn: (row: SyncStatusRow) => resetFn({ data: { project_id: row.project_id } }),
    onSuccess: (_, row) => {
      toast.success(`Sync reset for "${row.project_name}" — initial sync queued`);
      setResetTarget(null);
      qc.invalidateQueries({ queryKey: ["admin", "sp-sync-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Card className="glass border-border-subtle">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Database className="h-4 w-4" />
          <CardTitle className="text-base">SharePoint Sync Status</CardTitle>
          {isLoading && (
            <Badge variant="secondary" className="ml-auto gap-1">
              <RefreshCw className="h-3 w-3 animate-spin" /> Loading…
            </Badge>
          )}
          {!isLoading && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 gap-1 text-xs"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Live view of the two-way sync state for every project with a SharePoint library. Use{" "}
            <strong>Sync Now</strong> to enqueue a full re-scan, or <strong>Reset Sync</strong> to
            wipe the local document mirror and start over — SharePoint files are never deleted.
          </p>

          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          )}

          {!isLoading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No projects found with SharePoint libraries configured.
            </p>
          )}

          {!isLoading && rows.length > 0 && (
            <div className="rounded-md border overflow-hidden text-sm">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">Project</th>
                    <th className="text-center px-2 py-2 font-medium">Library</th>
                    <th className="text-center px-2 py-2 font-medium">Initial sync</th>
                    <th className="text-center px-2 py-2 font-medium">Subscription</th>
                    <th className="text-left px-3 py-2 font-medium">Last delta</th>
                    <th className="text-right px-3 py-2 font-medium">Files</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(rows as SyncStatusRow[]).map((row) => {
                    const isActioning =
                      actioningId === row.project_id ||
                      (resetSync.isPending && resetTarget?.project_id === row.project_id);
                    return (
                      <tr key={row.project_id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium truncate max-w-[180px]">
                          {row.project_name}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {row.library_configured ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {row.initial_sync_done ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-amber-500 mx-auto" />
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {row.subscription_status === "active" ? (
                            <Activity
                              className="h-4 w-4 text-emerald-500 mx-auto"
                              title={`Expires ${row.subscription_expires_at ? new Date(row.subscription_expires_at).toLocaleDateString() : "—"}`}
                            />
                          ) : row.subscription_status ? (
                            <AlertTriangle
                              className="h-4 w-4 text-amber-500 mx-auto"
                              title={row.subscription_status}
                            />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {row.last_synced_at
                            ? new Date(row.last_synced_at).toLocaleString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {row.file_count}
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px] gap-1"
                              disabled={!row.library_configured || isActioning}
                              onClick={() => syncNow.mutate(row)}
                              title="Queue a full re-scan of this project's SharePoint library"
                            >
                              {isActioning && syncNow.isPending ? (
                                <RefreshCw className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                              Sync Now
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[11px] gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={!row.library_configured || isActioning}
                              onClick={() => setResetTarget(row)}
                              title="Clear local document mirror and re-sync from SharePoint"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Reset
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reset confirmation dialog */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background border rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">
                  Reset sync for "{resetTarget.project_name}"?
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  This will permanently delete all locally cached document metadata for this project
                  and re-queue a full initial sync from SharePoint.{" "}
                  <strong>No files in SharePoint are deleted.</strong>
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setResetTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={resetSync.isPending}
                onClick={() => resetSync.mutate(resetTarget)}
              >
                {resetSync.isPending ? "Resetting…" : "Reset Sync"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── SharePoint Backup Lists Card ─────────────────────────────────────────────

function listsBadge(row: ProjectListProvisioningStatus) {
  const provisioned = [
    row.sp_list_id_tasks,
    row.sp_list_id_messages,
    row.sp_list_id_audit,
    row.sp_list_id_documents,
  ].filter(Boolean).length;

  if (!row.sharepoint_site_id) {
    return (
      <Badge variant="secondary" className="text-[10px]">
        — No site
      </Badge>
    );
  }
  if (provisioned === 4) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-300">
        <CheckCircle2 className="h-3 w-3" /> Provisioned
      </Badge>
    );
  }
  if (provisioned > 0) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-300">
        <AlertTriangle className="h-3 w-3" /> Partial ({provisioned}/4)
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="text-[10px] gap-1">
      <AlertTriangle className="h-3 w-3" /> Pending
    </Badge>
  );
}

function SharePointListsCard() {
  const listsFn = useServerFn(getProjectsListProvisioningStatus);
  const enqueueFn = useServerFn(enqueueProjectListsProvisioning);
  const qc = useQueryClient();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin", "sp-list-status"],
    queryFn: () => listsFn({ data: {} }),
    staleTime: 30_000,
  });

  const enqueueAll = useMutation({
    mutationFn: () => enqueueFn({ data: {} }),
    onSuccess: (r) => {
      toast.success(
        r.queued === 0
          ? "All projects already provisioned"
          : `Queued ${r.queued} project${r.queued !== 1 ? "s" : ""} for list provisioning`,
      );
      qc.invalidateQueries({ queryKey: ["admin", "sp-list-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enqueueOne = useMutation({
    mutationFn: (project_id: string) => enqueueFn({ data: { project_id } }),
    onSuccess: (r) => {
      toast.success(r.queued > 0 ? "Provisioning job queued" : "Already provisioned");
      qc.invalidateQueries({ queryKey: ["admin", "sp-list-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingCount = (rows ?? []).filter(
    (r) => r.sharepoint_site_id && !r.sp_list_id_tasks,
  ).length;

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <List className="h-4 w-4" />
        <CardTitle className="text-base">SharePoint Backup Lists</CardTitle>
        {enqueueAll.isPending && (
          <Badge variant="secondary" className="ml-auto gap-1">
            <RefreshCw className="h-3 w-3 animate-spin" /> Queueing…
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Four per-project SharePoint lists that mirror BusAcTa data in real time — Tasks, Messages,
          Audit Log, and Documents. Lists are provisioned automatically when a project's Document
          Library is configured. Use <strong>Provision Pending</strong> to catch any projects that
          were configured before this feature was added.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["admin", "sp-list-status"] })}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            onClick={() => enqueueAll.mutate()}
            disabled={enqueueAll.isPending || pendingCount === 0}
          >
            <Play className="h-4 w-4" />
            {enqueueAll.isPending
              ? "Queueing…"
              : pendingCount > 0
                ? `Provision Pending (${pendingCount})`
                : "All provisioned"}
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        )}

        {!isLoading && rows && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No projects with a configured SharePoint site found.
          </p>
        )}

        {!isLoading && rows && rows.length > 0 && (
          <div className="rounded-md border overflow-hidden text-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="text-left px-3 py-2 font-medium">Project</th>
                  <th className="text-center px-3 py-2 font-medium">Drive</th>
                  <th className="text-right px-3 py-2 font-medium">Lists</th>
                  <th className="text-right px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => {
                  const allProvisioned =
                    !!row.sp_list_id_tasks &&
                    !!row.sp_list_id_messages &&
                    !!row.sp_list_id_audit &&
                    !!row.sp_list_id_documents;
                  return (
                    <tr
                      key={row.id}
                      className={
                        !row.sharepoint_site_id
                          ? ""
                          : allProvisioned
                            ? "bg-emerald-50/50 dark:bg-emerald-950/10"
                            : "bg-amber-50 dark:bg-amber-950/20"
                      }
                    >
                      <td className="px-3 py-2 font-medium truncate max-w-xs">{row.name}</td>
                      <td className="px-3 py-2 text-center">
                        {row.sharepoint_drive_id ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{listsBadge(row)}</td>
                      <td className="px-3 py-2 text-right">
                        {!allProvisioned && row.sharepoint_site_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs px-2"
                            onClick={() => enqueueOne.mutate(row.id)}
                            disabled={enqueueOne.isPending}
                          >
                            Provision
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
