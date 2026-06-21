import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Mail,
  Save,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Send,
  Bell,
  BarChart3,
  Lock,
  FileText,
  Globe,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  getEmailNotificationConfig,
  saveEmailNotificationConfig,
  testEmailConfig,
  getEmailQueueStats,
  getSmtpConfig,
  saveSmtpConfig,
  testSmtpConfig,
  getResendConfig,
  saveResendConfig,
  testResendConfig,
  getActiveEmailProvider,
  type EmailNotificationConfig,
  type SmtpConfig,
  type ResendConfig,
} from "@/lib/email/email-notification.functions";
import { checkEsignEmailDns, type EmailDnsResult } from "@/lib/esign/email-dns.functions";

export const Route = createFileRoute("/admin/email-integration")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/integration", search: { tab: "email" } });
  },
});

export function EmailSettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const body = <EmailSettingsBody />;
  if (embedded) return body;

  return (
    <AuthGuard allow={["super_admin", "admin"]}>
      <AppShell crumbs={[{ label: "Admin", to: "/admin" }, { label: "Email" }]}>
        <PageHeader
          title="Email"
          description="Configure outgoing email notifications, password setup emails, and scheduled report delivery."
        />
        {body}
      </AppShell>
    </AuthGuard>
  );
}

// ── Top-level body with provider awareness ─────────────────────────────────

function EmailSettingsBody() {
  const getProviderFn = useServerFn(getActiveEmailProvider);
  const { data: activeProvider, isLoading: providerLoading } = useQuery({
    queryKey: ["admin", "email", "active-provider"],
    queryFn: () => getProviderFn(),
    staleTime: 30_000,
  });

  if (providerLoading) {
    return (
      <div className="grid gap-4 max-w-3xl">
        <Skeleton className="h-24" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 max-w-3xl">
      <ProviderSelectorCard active={activeProvider ?? null} />
      {activeProvider === "resend" ? <ResendSettingsCard /> : <SmtpSettingsCard />}
      <SenderSettingsCard />
      <DnsStatusCard />
      <NotificationTriggersCard />
      <PasswordAccountCard />
      <ReportDeliveryCard />
      <QueueStatsCard />
    </div>
  );
}

// ── Card: Provider selector ─────────────────────────────────────────────────

function ProviderSelectorCard({ active }: { active: "smtp" | "resend" | null }) {
  const qc = useQueryClient();
  const saveSMTPFn = useServerFn(saveSmtpConfig);
  const saveResendFn = useServerFn(saveResendConfig);

  const activate = useMutation({
    mutationFn: async (provider: "smtp" | "resend") => {
      // Activating a provider sets is_active=true on it; the server function
      // will deactivate the other one automatically (mutual exclusion).
      if (provider === "smtp") {
        await saveSMTPFn({ data: { is_active: true } });
      } else {
        await saveResendFn({ data: { is_active: true } });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "email"] });
      qc.invalidateQueries({ queryKey: ["admin", "smtp"] });
      qc.invalidateQueries({ queryKey: ["admin", "resend"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Mail className="h-4 w-4 text-blue-500" />
        <CardTitle className="text-base">Email Provider</CardTitle>
        {active && (
          <Badge variant="default" className="ml-auto gap-1">
            <ShieldCheck className="h-3 w-3" />
            {active === "smtp" ? "SMTP (Hostinger)" : "Resend"} active
          </Badge>
        )}
        {!active && (
          <Badge variant="secondary" className="ml-auto">
            None active
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Choose how BusAcTa Operations sends transactional email — OTP codes, e-sign links, and
          notifications. Only one provider can be active at a time.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* SMTP */}
          <button
            type="button"
            onClick={() => active !== "smtp" && activate.mutate("smtp")}
            disabled={activate.isPending}
            className={`rounded-lg border-2 p-4 text-left transition-colors ${
              active === "smtp"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-indigo-500" />
              <span className="font-medium text-sm">SMTP</span>
              {active === "smtp" && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 ml-auto" />
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Self-hosted via Hostinger (or any SMTP server). Your own mailbox, full control, no
              third party.
            </p>
          </button>

          {/* Resend */}
          <button
            type="button"
            onClick={() => active !== "resend" && activate.mutate("resend")}
            disabled={activate.isPending}
            className={`rounded-lg border-2 p-4 text-left transition-colors ${
              active === "resend"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Send className="h-4 w-4 text-violet-500" />
              <span className="font-medium text-sm">Resend</span>
              {active === "resend" && (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 ml-auto" />
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Dedicated ESP — high deliverability, analytics, bounce handling. Needs a Resend
              account and verified domain.
            </p>
          </button>
        </div>
        {activate.isPending && (
          <p className="text-xs text-muted-foreground mt-3 animate-pulse">Switching provider…</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────

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

function StatBox({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <div className="rounded-md border border-border-subtle p-3">
      <div className={`text-2xl font-bold tabular-nums ${className ?? ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

// ── Card 1: Sender Settings ────────────────────────────────────────────────

type SenderForm = {
  sender_name: string;
  reply_to: string;
  is_active: boolean;
};

const EMPTY_SENDER: SenderForm = {
  sender_name: "",
  reply_to: "",
  is_active: false,
};

function SenderSettingsCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getEmailNotificationConfig);
  const saveFn = useServerFn(saveEmailNotificationConfig);
  const testFn = useServerFn(testEmailConfig);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "email", "config"],
    queryFn: () => getFn(),
  });

  const [form, setForm] = useState<SenderForm>(EMPTY_SENDER);
  const [testTo, setTestTo] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        sender_name: data.sender_name,
        reply_to: data.reply_to,
        is_active: data.is_active,
      });
      setDirty(false);
    }
  }, [data]);

  const set = <K extends keyof SenderForm>(k: K, v: SenderForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          sender_name: form.sender_name,
          reply_to: form.reply_to,
          is_active: form.is_active,
        },
      }),
    onSuccess: () => {
      toast.success("Email settings saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "email"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTest = useMutation({
    mutationFn: () => testFn({ data: { to: testTo.trim() } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Test email sent — check your inbox.");
      } else {
        toast.error(`Test failed: ${(res as { ok: false; error: string }).error}`);
      }
      qc.invalidateQueries({ queryKey: ["admin", "email", "config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = (data as EmailNotificationConfig | null)?.last_test_status;
  const validTestEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo.trim());

  if (isLoading) return <Skeleton className="h-72" />;

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Mail className="h-4 w-4 text-blue-500" />
        <CardTitle className="text-base">Sender Settings</CardTitle>
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
          Configure the display name and reply-to for outgoing emails. SMTP server credentials
          (host, user, password) are set in the{" "}
          <span className="font-medium text-foreground">SMTP Connection</span> card above.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Sender display name"
            hint='Shown as "From" in email clients. E.g. "Viral Patel & Co"'
          >
            <Input
              value={form.sender_name}
              onChange={(e) => set("sender_name", e.target.value)}
              placeholder="BusAcTa Operations"
            />
          </Field>
          <Field label="Reply-to address" hint="Optional. Replies from recipients go here.">
            <Input
              type="email"
              value={form.reply_to}
              onChange={(e) => set("reply_to", e.target.value)}
              placeholder="noreply@yourdomain.com"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border-subtle p-3">
          <div>
            <Label className="text-sm">Enable email notifications</Label>
            <p className="text-xs text-muted-foreground">
              Master switch — disabling this pauses all email notifications globally.
            </p>
          </div>
          <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
        </div>

        {(data as EmailNotificationConfig | null)?.last_test_error && status === "failed" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <div className="font-medium mb-1">Last test error</div>
            <code className="break-all">{(data as EmailNotificationConfig).last_test_error}</code>
          </div>
        )}

        <Separator />

        <div className="space-y-2">
          <Label className="text-sm">Send test email</Label>
          <p className="text-xs text-muted-foreground">
            Verify your email domain is working by sending a test message.
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              className="max-w-xs"
            />
            <Button
              variant="outline"
              onClick={() => sendTest.mutate()}
              disabled={!validTestEmail || sendTest.isPending}
            >
              <Send className={`h-4 w-4 ${sendTest.isPending ? "animate-pulse" : ""}`} />
              {sendTest.isPending ? "Sending…" : "Send test"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          {(data as EmailNotificationConfig | null)?.last_tested_at && (
            <span className="text-xs text-muted-foreground">
              Last tested{" "}
              {new Date((data as EmailNotificationConfig).last_tested_at!).toLocaleString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Card 2: DNS Status ─────────────────────────────────────────────────────

function DnsStatusCard() {
  const checkFn = useServerFn(checkEsignEmailDns);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin", "email", "dns"],
    queryFn: () => checkFn({ data: {} }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const dns = data as EmailDnsResult | undefined;

  const overallColor =
    dns?.overall === "ok"
      ? "text-emerald-600"
      : dns?.overall === "warn"
        ? "text-amber-600"
        : "text-destructive";

  const overallIcon =
    dns?.overall === "ok" ? (
      <CheckCircle2 className="h-3.5 w-3.5" />
    ) : dns?.overall === "warn" ? (
      <AlertTriangle className="h-3.5 w-3.5" />
    ) : (
      <AlertTriangle className="h-3.5 w-3.5" />
    );

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Globe className="h-4 w-4" />
        <CardTitle className="text-base">DNS Domain Status</CardTitle>
        <div className="ml-auto flex items-center gap-2">
          {dns && (
            <Badge variant="outline" className={`gap-1 ${overallColor}`}>
              {overallIcon}
              {dns.overall === "ok"
                ? "All checks passed"
                : dns.overall === "warn"
                  ? "Warnings"
                  : "Action needed"}
            </Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Checks DNS records for your e-signature email domain (SPF, MX, NS). Used to verify that
          outgoing e-sign emails will be delivered correctly from your sending domain.
        </p>

        {isLoading && <Skeleton className="h-24" />}

        {dns && (
          <>
            <div className="space-y-2">
              {dns.checks.map((check, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-md border border-border-subtle p-3"
                >
                  <span
                    className={
                      check.status === "ok"
                        ? "text-emerald-600 mt-0.5"
                        : check.status === "warn"
                          ? "text-amber-600 mt-0.5"
                          : "text-destructive mt-0.5"
                    }
                  >
                    {check.status === "ok" ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{check.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{check.detail}</div>
                    {check.fix && (
                      <div className="mt-1.5 rounded bg-muted/50 p-2 text-xs text-foreground">
                        <span className="font-medium">Fix: </span>
                        {check.fix}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {dns.next_steps.length > 0 && (
              <div className="rounded-md border border-border-subtle bg-muted/30 p-3 space-y-1">
                <div className="text-xs font-medium text-foreground">Next steps</div>
                <ul className="space-y-1">
                  {dns.next_steps.map((step, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                      <span className="shrink-0 text-muted-foreground/50">{i + 1}.</span>
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Card 3: Notification Triggers ─────────────────────────────────────────

function NotificationTriggersCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getEmailNotificationConfig);
  const saveFn = useServerFn(saveEmailNotificationConfig);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "email", "config"],
    queryFn: () => getFn(),
  });

  const [prefs, setPrefs] = useState({
    notify_on_assigned: true,
    notify_on_status: true,
    notify_on_commented: true,
    notify_on_due_soon: true,
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setPrefs({
        notify_on_assigned: data.notify_on_assigned,
        notify_on_status: data.notify_on_status,
        notify_on_commented: data.notify_on_commented,
        notify_on_due_soon: data.notify_on_due_soon,
      });
      setDirty(false);
    }
  }, [data]);

  const toggle = (k: keyof typeof prefs, v: boolean) => {
    setPrefs((p) => ({ ...p, [k]: v }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () => saveFn({ data: prefs }),
    onSuccess: () => {
      toast.success("Notification triggers saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "email"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const triggers = [
    {
      key: "notify_on_assigned" as const,
      label: "Task assigned",
      desc: "When a task is assigned or reassigned to a user",
    },
    {
      key: "notify_on_status" as const,
      label: "Task status changed",
      desc: "When a task moves to a new status (e.g. In Review, Done)",
    },
    {
      key: "notify_on_commented" as const,
      label: "New comment",
      desc: "When someone posts a comment on a task",
    },
    {
      key: "notify_on_due_soon" as const,
      label: "Due soon / overdue",
      desc: "Daily reminder when a task is due within 2 days or past due",
    },
  ] as const;

  if (isLoading) return <Skeleton className="h-52" />;

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Bell className="h-4 w-4" />
        <CardTitle className="text-base">Task Notification Triggers</CardTitle>
        <p className="ml-auto text-xs text-muted-foreground">
          Global defaults — users can opt out per their profile
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {triggers.map((t, i) => (
          <div key={t.key}>
            {i > 0 && <Separator className="mb-3" />}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">{t.label}</Label>
                <p className="text-xs text-muted-foreground">{t.desc}</p>
              </div>
              <Switch checked={prefs[t.key]} onCheckedChange={(v) => toggle(t.key, v)} />
            </div>
          </div>
        ))}
        <div className="pt-1">
          <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save triggers"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Card 4: Password & Account Emails ─────────────────────────────────────

function PasswordAccountCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getEmailNotificationConfig);
  const saveFn = useServerFn(saveEmailNotificationConfig);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "email", "config"],
    queryFn: () => getFn(),
  });

  const [enabled, setEnabled] = useState(true);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setEnabled(data.password_emails_enabled);
      setDirty(false);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => saveFn({ data: { password_emails_enabled: enabled } }),
    onSuccess: () => {
      toast.success("Password email setting saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "email"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-36" />;

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Lock className="h-4 w-4" />
        <CardTitle className="text-base">Password & Account Emails</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Supabase Auth automatically sends these emails when a user is invited or resets their
          password. When enabled, they use the sender name configured in the Sender Settings card
          above.
        </p>

        <div className="flex items-center justify-between rounded-md border border-border-subtle p-3">
          <div>
            <Label className="text-sm">Send password setup &amp; reset emails</Label>
            <p className="text-xs text-muted-foreground">
              Covers: new user invites, forgotten password, magic link sign-in
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => {
              setEnabled(v);
              setDirty(true);
            }}
          />
        </div>

        <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Card 5: Report Delivery ────────────────────────────────────────────────

function ReportDeliveryCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getEmailNotificationConfig);
  const saveFn = useServerFn(saveEmailNotificationConfig);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "email", "config"],
    queryFn: () => getFn(),
  });

  const [form, setForm] = useState({ report_emails_enabled: false, report_recipients: "" });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        report_emails_enabled: data.report_emails_enabled,
        report_recipients: data.report_recipients,
      });
      setDirty(false);
    }
  }, [data]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () => saveFn({ data: form }),
    onSuccess: () => {
      toast.success("Report delivery settings saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "email"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-44" />;

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <FileText className="h-4 w-4" />
        <CardTitle className="text-base">Scheduled Report Delivery</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          When enabled, generated reports will be emailed to the specified recipients automatically.
        </p>

        <div className="flex items-center justify-between rounded-md border border-border-subtle p-3">
          <div>
            <Label className="text-sm">Enable report email delivery</Label>
            <p className="text-xs text-muted-foreground">
              Send generated reports to the addresses below
            </p>
          </div>
          <Switch
            checked={form.report_emails_enabled}
            onCheckedChange={(v) => set("report_emails_enabled", v)}
          />
        </div>

        <Field
          label="Report recipients"
          hint="Comma-separated email addresses. E.g. partner@firm.com, manager@firm.com"
        >
          <Input
            value={form.report_recipients}
            onChange={(e) => set("report_recipients", e.target.value)}
            placeholder="partner@firm.com, manager@firm.com"
            disabled={!form.report_emails_enabled}
          />
        </Field>

        <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Card: Resend Settings ──────────────────────────────────────────────────

type ResendForm = {
  api_key: string;
  from_email: string;
  from_name: string;
};

const EMPTY_RESEND: ResendForm = { api_key: "", from_email: "", from_name: "" };
const RESEND_MASK = "re_••••••••";

function ResendSettingsCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getResendConfig);
  const saveFn = useServerFn(saveResendConfig);
  const testFn = useServerFn(testResendConfig);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "resend", "config"],
    queryFn: () => getFn(),
  });

  const [form, setForm] = useState<ResendForm>(EMPTY_RESEND);
  const [showKey, setShowKey] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      const d = data as ResendConfig;
      setForm({
        api_key: d.api_key ? RESEND_MASK : "",
        from_email: d.from_email,
        from_name: d.from_name,
      });
      setDirty(false);
    }
  }, [data]);

  const set = <K extends keyof ResendForm>(k: K, v: ResendForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          // Only send api_key when user typed a new value (not the mask)
          ...(form.api_key && form.api_key !== RESEND_MASK ? { api_key: form.api_key } : {}),
          from_email: form.from_email.trim(),
          from_name: form.from_name.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Resend settings saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "resend"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTest = useMutation({
    mutationFn: () => testFn({ data: { to: testTo.trim() } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Test email sent — check your inbox.");
      } else {
        toast.error(`Test failed: ${(res as { ok: false; error: string }).error}`);
      }
      qc.invalidateQueries({ queryKey: ["admin", "resend"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = (data as ResendConfig | null)?.last_test_status;
  const validTestEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo.trim());

  if (isLoading) return <Skeleton className="h-72" />;

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Send className="h-4 w-4 text-violet-500" />
        <CardTitle className="text-base">Resend Configuration</CardTitle>
        <div className="ml-auto flex items-center gap-2">
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
          Resend sends email via their deliverability infrastructure. Get an API key at{" "}
          <a
            href="https://resend.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            resend.com
          </a>{" "}
          and verify your sending domain there first.
        </p>

        {/* API Key */}
        <Field label="API Key" hint="Starts with re_. Stored encrypted in the database.">
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={form.api_key}
              onChange={(e) => set("api_key", e.target.value)}
              onFocus={() => {
                if (form.api_key === RESEND_MASK) set("api_key", "");
              }}
              placeholder="re_••••••••••••••••"
              autoComplete="off"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showKey ? <FileText className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        {/* From */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From address" hint="Must be verified in Resend (domain or email)">
            <Input
              type="email"
              value={form.from_email}
              onChange={(e) => set("from_email", e.target.value)}
              placeholder="noreply@one.busacta.com"
            />
          </Field>
          <Field label="From display name" hint='Shown as "From" in email clients'>
            <Input
              value={form.from_name}
              onChange={(e) => set("from_name", e.target.value)}
              placeholder="BusAcTa Operations"
            />
          </Field>
        </div>

        {/* Last error */}
        {(data as ResendConfig | null)?.last_test_error && status === "failed" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <div className="font-medium mb-1">Last test error</div>
            <code className="break-all">{(data as ResendConfig).last_test_error}</code>
          </div>
        )}

        <Separator />

        {/* Test */}
        <div className="space-y-2">
          <Label className="text-sm">Send test email</Label>
          <p className="text-xs text-muted-foreground">
            Save your settings first, then verify the connection.
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              className="max-w-xs"
            />
            <Button
              variant="outline"
              onClick={() => sendTest.mutate()}
              disabled={!validTestEmail || sendTest.isPending || dirty}
              title={dirty ? "Save settings before testing" : undefined}
            >
              <Send className={`h-4 w-4 ${sendTest.isPending ? "animate-pulse" : ""}`} />
              {sendTest.isPending ? "Sending…" : "Send test"}
            </Button>
          </div>
          {dirty && <p className="text-xs text-amber-600">Save settings before running a test.</p>}
        </div>

        {/* Save */}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save settings"}
          </Button>
          {(data as ResendConfig | null)?.last_tested_at && (
            <span className="text-xs text-muted-foreground">
              Last tested {new Date((data as ResendConfig).last_tested_at!).toLocaleString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Card 0: SMTP Connection ────────────────────────────────────────────────

type SmtpForm = {
  host: string;
  port: string;
  secure: boolean;
  user: string;
  password: string;
  from_email: string;
  from_name: string;
  is_active: boolean;
};

const EMPTY_SMTP: SmtpForm = {
  host: "",
  port: "465",
  secure: true,
  user: "",
  password: "",
  from_email: "",
  from_name: "",
  is_active: false,
};

function SmtpSettingsCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getSmtpConfig);
  const saveFn = useServerFn(saveSmtpConfig);
  const testFn = useServerFn(testSmtpConfig);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "smtp", "config"],
    queryFn: () => getFn(),
  });

  const [form, setForm] = useState<SmtpForm>(EMPTY_SMTP);
  const [showPass, setShowPass] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      const d = data as SmtpConfig;
      setForm({
        host: d.host,
        port: String(d.port ?? 465),
        secure: d.secure ?? true,
        user: d.user,
        password: d.password ? "••••••••" : "",
        from_email: d.from_email,
        from_name: d.from_name,
        is_active: d.is_active,
      });
      setDirty(false);
    }
  }, [data]);

  const set = <K extends keyof SmtpForm>(k: K, v: SmtpForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          host: form.host.trim(),
          port: parseInt(form.port, 10) || 465,
          secure: form.secure,
          user: form.user.trim(),
          // Only send password if user actually typed a new one (not the masked placeholder)
          ...(form.password && form.password !== "••••••••" ? { password: form.password } : {}),
          from_email: form.from_email.trim(),
          from_name: form.from_name.trim(),
          is_active: form.is_active,
        },
      }),
    onSuccess: () => {
      toast.success("SMTP settings saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "smtp"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendTest = useMutation({
    mutationFn: () => testFn({ data: { to: testTo.trim() } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("Test email sent — check your inbox.");
      } else {
        toast.error(`Test failed: ${(res as { ok: false; error: string }).error}`);
      }
      qc.invalidateQueries({ queryKey: ["admin", "smtp"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = (data as SmtpConfig | null)?.last_test_status;
  const validTestEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo.trim());

  if (isLoading) return <Skeleton className="h-72" />;

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Lock className="h-4 w-4 text-indigo-500" />
        <CardTitle className="text-base">SMTP Connection</CardTitle>
        <div className="ml-auto flex items-center gap-2">
          {form.is_active ? (
            <Badge variant="default" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> Active
            </Badge>
          ) : (
            <Badge variant="secondary">Inactive</Badge>
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
          Enter your Hostinger (or any) SMTP credentials. Email is sent directly from your own
          mailbox — no third-party relay. Credentials are stored encrypted in the database.
        </p>

        {/* Server */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="SMTP host" hint="e.g. smtp.hostinger.com" className="sm:col-span-2">
            <Input
              value={form.host}
              onChange={(e) => set("host", e.target.value)}
              placeholder="smtp.hostinger.com"
            />
          </Field>
          <Field label="Port">
            <Input
              type="number"
              min={1}
              max={65535}
              value={form.port}
              onChange={(e) => set("port", e.target.value)}
              placeholder="465"
            />
          </Field>
        </div>

        {/* Encryption */}
        <div className="flex items-center justify-between rounded-md border border-border-subtle p-3">
          <div>
            <Label className="text-sm">Use SSL/TLS</Label>
            <p className="text-xs text-muted-foreground">
              Port 465 → enable. Port 587 (STARTTLS) → disable.
            </p>
          </div>
          <Switch checked={form.secure} onCheckedChange={(v) => set("secure", v)} />
        </div>

        {/* Credentials */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Username / email" hint="Your Hostinger mailbox address">
            <Input
              type="email"
              value={form.user}
              onChange={(e) => set("user", e.target.value)}
              placeholder="notify@one.busacta.com"
              autoComplete="username"
            />
          </Field>
          <Field label="Password">
            <div className="relative">
              <Input
                type={showPass ? "text" : "password"}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder="Mailbox password"
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPass ? <FileText className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </button>
            </div>
          </Field>
        </div>

        {/* From */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From address" hint="Must match your SMTP username">
            <Input
              type="email"
              value={form.from_email}
              onChange={(e) => set("from_email", e.target.value)}
              placeholder="notify@one.busacta.com"
            />
          </Field>
          <Field label="From display name" hint='Shown as "From" in email clients'>
            <Input
              value={form.from_name}
              onChange={(e) => set("from_name", e.target.value)}
              placeholder="BusAcTa Operations"
            />
          </Field>
        </div>

        {/* Enable */}
        <div className="flex items-center justify-between rounded-md border border-border-subtle p-3">
          <div>
            <Label className="text-sm">Enable SMTP sending</Label>
            <p className="text-xs text-muted-foreground">
              Must be enabled for email OTP, e-sign, and notifications to be delivered.
            </p>
          </div>
          <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
        </div>

        {/* Last error */}
        {(data as SmtpConfig | null)?.last_test_error && status === "failed" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <div className="font-medium mb-1">Last test error</div>
            <code className="break-all">{(data as SmtpConfig).last_test_error}</code>
          </div>
        )}

        <Separator />

        {/* Test */}
        <div className="space-y-2">
          <Label className="text-sm">Send test email</Label>
          <p className="text-xs text-muted-foreground">
            Save your settings first, then send a test to verify the connection.
          </p>
          <div className="flex gap-2">
            <Input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              className="max-w-xs"
            />
            <Button
              variant="outline"
              onClick={() => sendTest.mutate()}
              disabled={!validTestEmail || sendTest.isPending || dirty}
              title={dirty ? "Save settings before testing" : undefined}
            >
              <Send className={`h-4 w-4 ${sendTest.isPending ? "animate-pulse" : ""}`} />
              {sendTest.isPending ? "Sending…" : "Send test"}
            </Button>
          </div>
          {dirty && <p className="text-xs text-amber-600">Save settings before running a test.</p>}
        </div>

        {/* Save */}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save settings"}
          </Button>
          {(data as SmtpConfig | null)?.last_tested_at && (
            <span className="text-xs text-muted-foreground">
              Last tested {new Date((data as SmtpConfig).last_tested_at!).toLocaleString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Card 6: Delivery Queue Stats ───────────────────────────────────────────

function QueueStatsCard() {
  const getFn = useServerFn(getEmailQueueStats);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "email", "queue-stats"],
    queryFn: () => getFn(),
    refetchInterval: 30_000,
  });

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <BarChart3 className="h-4 w-4" />
        <CardTitle className="text-base">Delivery Queue</CardTitle>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 px-2"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16" />
        ) : (
          <div className="grid grid-cols-3 gap-3 text-center">
            <StatBox label="Pending" value={data?.pending ?? 0} className="text-amber-600" />
            <StatBox
              label="Sent today"
              value={data?.sent_today ?? 0}
              className="text-emerald-600"
            />
            <StatBox
              label="Failed"
              value={data?.failed ?? 0}
              className={data?.failed ? "text-destructive" : "text-muted-foreground"}
            />
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Queue is processed by the{" "}
          <code className="text-xs">/api/public/cron/email-notifications</code> cron endpoint.
          Failed items stay in the queue until cleared manually.
        </p>
      </CardContent>
    </Card>
  );
}
