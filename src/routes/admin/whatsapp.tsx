import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  MessageCircle,
  Save,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Send,
  Bell,
  BarChart3,
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
  getWhatsAppConfig,
  saveWhatsAppConfig,
  testWhatsAppConfig,
  getWhatsAppQueueStats,
  type WhatsAppAdminConfig,
} from "@/lib/whatsapp/whatsapp.functions";

export const Route = createFileRoute("/admin/whatsapp")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/integration", search: { tab: "whatsapp" } });
  },
});

export function WhatsAppSettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const body = (
    <div className="grid gap-4 max-w-3xl">
      <CredentialsCard />
      <NotificationTriggersCard />
      <TestMessageCard />
      <QueueStatsCard />
    </div>
  );

  if (embedded) return body;

  return (
    <AuthGuard allow={["super_admin", "admin"]}>
      <AppShell crumbs={[{ label: "Admin", to: "/admin/team" }, { label: "WhatsApp" }]}>
        <PageHeader
          title="WhatsApp"
          description="Send OTP codes and task notifications via Meta WhatsApp Cloud API. Credentials are stored securely in the database."
        />
        {body}
      </AppShell>
    </AuthGuard>
  );
}

// ── Credentials card ───────────────────────────────────────────────────────

type FormState = {
  app_id: string;
  phone_number_id: string;
  access_token: string;
  notify_on_assigned: boolean;
  notify_on_status: boolean;
  notify_on_commented: boolean;
  notify_on_due_soon: boolean;
  is_active: boolean;
};

const EMPTY: FormState = {
  app_id: "",
  phone_number_id: "",
  access_token: "",
  notify_on_assigned: true,
  notify_on_status: true,
  notify_on_commented: true,
  notify_on_due_soon: true,
  is_active: false,
};

function CredentialsCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getWhatsAppConfig);
  const saveFn = useServerFn(saveWhatsAppConfig);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "whatsapp", "config"],
    queryFn: () => getFn(),
  });

  const [form, setForm] = useState<FormState>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [tokenHint, setTokenHint] = useState("");

  useEffect(() => {
    if (data) {
      setForm({
        app_id: data.app_id,
        phone_number_id: data.phone_number_id,
        access_token: "",
        notify_on_assigned: data.notify_on_assigned,
        notify_on_status: data.notify_on_status,
        notify_on_commented: data.notify_on_commented,
        notify_on_due_soon: data.notify_on_due_soon,
        is_active: data.is_active,
      });
      setTokenHint(data.access_token_hint);
      setDirty(false);
    }
  }, [data]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const isConfigured =
    !!form.phone_number_id && (!!tokenHint || !!form.access_token);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          app_id: form.app_id,
          phone_number_id: form.phone_number_id,
          access_token: form.access_token || undefined,
          notify_on_assigned: form.notify_on_assigned,
          notify_on_status: form.notify_on_status,
          notify_on_commented: form.notify_on_commented,
          notify_on_due_soon: form.notify_on_due_soon,
          is_active: form.is_active,
        },
      }),
    onSuccess: () => {
      toast.success("WhatsApp settings saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "whatsapp"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = (data as WhatsAppAdminConfig | null)?.last_test_status;

  if (isLoading) return <Skeleton className="h-80" />;

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <MessageCircle className="h-4 w-4 text-green-500" />
        <CardTitle className="text-base">Meta WhatsApp Cloud API</CardTitle>
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
          From the{" "}
          <span className="font-medium text-foreground">Facebook Developer Console</span>, create a
          WhatsApp Business app, add a phone number, and generate a permanent access token. Paste
          the three values below.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="App ID" hint="Your Facebook App ID (numeric)">
            <Input
              value={form.app_id}
              onChange={(e) => set("app_id", e.target.value)}
              placeholder="1234567890123456"
            />
          </Field>
          <Field label="Phone Number ID" hint="From WhatsApp → Getting Started in your app dashboard">
            <Input
              value={form.phone_number_id}
              onChange={(e) => set("phone_number_id", e.target.value)}
              placeholder="1234567890123456"
            />
          </Field>
          <Field
            label="Access Token"
            hint={tokenHint ? "Leave blank to keep the saved token" : "Permanent token from System User or test token"}
            className="sm:col-span-2"
          >
            <Input
              type="password"
              value={form.access_token}
              onChange={(e) => set("access_token", e.target.value)}
              placeholder={tokenHint || "EAAxxxxxxx…"}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-md border border-border-subtle p-3">
          <div>
            <Label className="text-sm">Enable WhatsApp integration</Label>
            <p className="text-xs text-muted-foreground">
              When enabled, OTP codes and task notifications will be sent via WhatsApp.
            </p>
          </div>
          <Switch
            checked={form.is_active}
            onCheckedChange={(v) => set("is_active", v)}
            disabled={!isConfigured && !form.is_active}
          />
        </div>

        {(data as WhatsAppAdminConfig | null)?.last_test_error && status === "failed" && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <div className="font-medium mb-1">Last test error</div>
            <code className="break-all">{(data as WhatsAppAdminConfig).last_test_error}</code>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <Save className="h-4 w-4" /> {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          {(data as WhatsAppAdminConfig | null)?.last_tested_at && (
            <span className="text-xs text-muted-foreground">
              Last tested {new Date((data as WhatsAppAdminConfig).last_tested_at!).toLocaleString()}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Notification triggers card ─────────────────────────────────────────────

function NotificationTriggersCard() {
  const qc = useQueryClient();
  const getFn = useServerFn(getWhatsAppConfig);
  const saveFn = useServerFn(saveWhatsAppConfig);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "whatsapp", "config"],
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
    mutationFn: () => {
      if (!data) throw new Error("Config not loaded");
      return saveFn({
        data: {
          app_id: data.app_id,
          phone_number_id: data.phone_number_id,
          is_active: data.is_active,
          ...prefs,
        },
      });
    },
    onSuccess: () => {
      toast.success("Notification triggers saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["admin", "whatsapp"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-48" />;

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

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Bell className="h-4 w-4" />
        <CardTitle className="text-base">Notification Triggers</CardTitle>
        <p className="ml-auto text-xs text-muted-foreground">Global defaults — users can opt out per their profile</p>
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
              <Switch
                checked={prefs[t.key]}
                onCheckedChange={(v) => toggle(t.key, v)}
              />
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

// ── Test message card ──────────────────────────────────────────────────────

function TestMessageCard() {
  const qc = useQueryClient();
  const testFn = useServerFn(testWhatsAppConfig);
  const [phone, setPhone] = useState("");

  const test = useMutation({
    mutationFn: () => testFn({ data: { test_phone: phone.trim() } }),
    onSuccess: (res) => {
      if (res.ok) toast.success("Test message sent! Check WhatsApp.");
      else toast.error(`Test failed: ${(res as { ok: false; error: string }).error}`);
      qc.invalidateQueries({ queryKey: ["admin", "whatsapp", "config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const validPhone = /^\+[1-9]\d{6,14}$/.test(phone.trim());

  return (
    <Card className="glass border-border-subtle">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Send className="h-4 w-4" />
        <CardTitle className="text-base">Send Test Message</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Send a test WhatsApp message to verify your Meta credentials are working. Enter any
          E.164 phone number — the recipient must be a real WhatsApp user.
        </p>
        <div className="flex gap-2">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+14155551234"
            className="max-w-xs"
          />
          <Button
            onClick={() => test.mutate()}
            disabled={!validPhone || test.isPending}
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 ${test.isPending ? "animate-spin" : ""}`} />
            {test.isPending ? "Sending…" : "Send test"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Queue stats card ───────────────────────────────────────────────────────

function QueueStatsCard() {
  const getFn = useServerFn(getWhatsAppQueueStats);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin", "whatsapp", "queue-stats"],
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
            <StatBox
              label="Pending"
              value={data?.pending ?? 0}
              className="text-amber-600"
            />
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
          <code className="text-xs">/api/public/cron/whatsapp-notifications</code> cron endpoint.
          Failed items stay in the queue until cleared manually.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────

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
