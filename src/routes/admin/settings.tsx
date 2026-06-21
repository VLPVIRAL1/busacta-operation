import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Save,
  Clock,
  MessageCircleQuestion,
  Bell,
  Building2,
  LayoutGrid,
  SlidersHorizontal,
  Palette,
  FileStack,
} from "lucide-react";
import { TOGGLEABLE_MODULES, MODULE_LABEL } from "@/lib/routing/use-nav";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdminGuide } from "@/components/admin/admin-guide";
import { AdminTabBar, ViewTab } from "@/components/admin/admin-tabs";
import {
  appSettingsQuery,
  saveAppSettingsPatch,
  normalizeSystemSettings,
  DEFAULT_SYSTEM_SETTINGS,
  type SystemSettings,
} from "@/lib/queries/settings.queries";
import { BrandingPage } from "./branding";
import { TemplatesPage } from "./templates";

type TabKey = "general" | "hubs" | "branding" | "templates";
const VALID: TabKey[] = ["general", "hubs", "branding", "templates"];

// Tabs whose state lives in the shared app_settings form (per-tab dirty + Save).
// `branding` and `templates` are self-contained — they own their save UI.
type FormTabKey = "general" | "hubs";
const TAB_KEYS: Record<FormTabKey, readonly (keyof SystemSettings)[]> = {
  general: [
    "company_name",
    "support_email",
    "default_timezone",
    "time_edit_window_min",
    "idle_warning_min",
    "timer_auto_stop_minutes",
    "default_billable",
    "open_point_default_visible",
    "notify_on_mention",
    "notify_on_status_change",
    "pipeline_archive_days",
  ],
  hubs: ["module_hubs"],
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Paris",
  "UTC",
];

export const Route = createFileRoute("/admin/settings")({
  // `tab` is optional so existing `<Link to="/admin/settings">` (no search) still
  // type-checks; it always resolves to a concrete tab at runtime.
  validateSearch: (s: Record<string, unknown>): { tab?: TabKey } => ({
    tab: VALID.includes(s.tab as TabKey) ? (s.tab as TabKey) : "general",
  }),
  component: () => (
    <AuthGuard allow={["admin"]}>
      <AppShell crumbs={[{ label: "Admin", to: "/admin" }, { label: "System Preferences" }]}>
        <SystemSettingsPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function pick(
  obj: SystemSettings,
  keys: readonly (keyof SystemSettings)[],
): Partial<SystemSettings> {
  const out: Partial<SystemSettings> = {};
  for (const k of keys) (out as Record<string, unknown>)[k] = obj[k];
  return out;
}

function sliceDirty(
  a: SystemSettings,
  b: SystemSettings,
  keys: readonly (keyof SystemSettings)[],
): boolean {
  return JSON.stringify(pick(a, keys)) !== JSON.stringify(pick(b, keys));
}

function SystemSettingsPage() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  const [tab, setTab] = useState<TabKey>(search.tab ?? "general");
  const [form, setForm] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  // Baseline = last-known-saved value. Per-tab dirty = form slice ≠ saved slice.
  const [saved, setSaved] = useState<SystemSettings>(DEFAULT_SYSTEM_SETTINGS);
  const [pendingTab, setPendingTab] = useState<TabKey | null>(null);
  const initialized = useRef(false);

  const { data, isLoading } = useQuery(appSettingsQuery());

  // Adopt server state once. After that, in-progress edits are never clobbered
  // by background refetches — saves update `saved` locally instead.
  useEffect(() => {
    if (data && !initialized.current) {
      const normalized = normalizeSystemSettings(data);
      setForm(normalized);
      setSaved(normalized);
      initialized.current = true;
    }
  }, [data]);

  const set = <K extends keyof SystemSettings>(k: K, v: SystemSettings[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const saveMut = useMutation({
    mutationFn: (keys: readonly (keyof SystemSettings)[]) => saveAppSettingsPatch(pick(form, keys)),
    onError: (e: Error) => toast.error(e.message),
  });

  const isFormTab = (t: TabKey): t is FormTabKey => t === "general" || t === "hubs";
  const isDirty = (t: TabKey) => (isFormTab(t) ? sliceDirty(form, saved, TAB_KEYS[t]) : false);

  const commitTabChange = (next: TabKey) => {
    setTab(next);
    navigate({ search: { tab: next }, replace: true });
  };

  const requestTab = (next: TabKey) => {
    if (next === tab) return;
    if (isDirty(tab)) setPendingTab(next);
    else commitTabChange(next);
  };

  const saveTab = (t: FormTabKey, after?: () => void) => {
    const keys = TAB_KEYS[t];
    saveMut.mutate(keys, {
      onSuccess: () => {
        setSaved((prev) => ({ ...prev, ...pick(form, keys) }));
        toast.success("Settings saved");
        qc.invalidateQueries({ queryKey: ["app-settings", "system"] });
        qc.invalidateQueries({ queryKey: ["app-settings", "system", "nav"] });
        after?.();
      },
    });
  };

  // ── Unsaved-changes dialog actions (when switching away from a dirty tab) ──
  const dialogSave = () => {
    if (!isFormTab(tab)) return;
    saveTab(tab, () => {
      const next = pendingTab;
      setPendingTab(null);
      if (next) commitTabChange(next);
    });
  };
  const dialogDiscard = () => {
    if (isFormTab(tab)) setForm((f) => ({ ...f, ...pick(saved, TAB_KEYS[tab]) }));
    const next = pendingTab;
    setPendingTab(null);
    if (next) commitTabChange(next);
  };

  const dirty = isDirty(tab);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <PageHeader
        title="System Preferences"
        description="Workspace-wide defaults and visibility. Only admins can change these. Each tab saves on its own."
      />

      <AdminGuide pageName="settings" className="mb-3 shrink-0">
        Everything that shapes the workspace. <strong>General</strong> covers organization,
        time-tracking, open points, notifications and pipeline archiving.{" "}
        <strong>Hub Visibility</strong> turns whole hubs on/off. <strong>Branding</strong> sets
        logo, name & tagline, and <strong>PDF Templates</strong> designs your document layouts. Each
        tab saves on its own — switching a settings tab with unsaved changes will prompt you.
      </AdminGuide>

      <AdminTabBar>
        <ViewTab
          active={tab === "general"}
          onClick={() => requestTab("general")}
          icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
          label="General"
        />
        <ViewTab
          active={tab === "hubs"}
          onClick={() => requestTab("hubs")}
          icon={<LayoutGrid className="h-3.5 w-3.5" />}
          label="Hub Visibility"
        />
        <ViewTab
          active={tab === "branding"}
          onClick={() => requestTab("branding")}
          icon={<Palette className="h-3.5 w-3.5" />}
          label="Branding"
        />
        <ViewTab
          active={tab === "templates"}
          onClick={() => requestTab("templates")}
          icon={<FileStack className="h-3.5 w-3.5" />}
          label="PDF Templates"
        />
      </AdminTabBar>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-6">
        {isLoading ? (
          <Skeleton className="h-72" />
        ) : (
          <>
            {tab === "general" && <GeneralTab form={form} set={set} />}
            {tab === "hubs" && <HubVisibilityTab form={form} set={set} />}
            {tab === "branding" && <BrandingPage embedded />}
            {tab === "templates" && <TemplatesPage embedded />}

            {isFormTab(tab) && (
              <div className="mt-4 flex items-center gap-3">
                <Button onClick={() => saveTab(tab)} disabled={!dirty || saveMut.isPending}>
                  <Save className="h-4 w-4" /> {saveMut.isPending ? "Saving…" : "Save changes"}
                </Button>
                {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
              </div>
            )}
          </>
        )}
      </div>

      <AlertDialog open={pendingTab !== null} onOpenChange={(o) => !o && setPendingTab(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes on this tab</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Save them now, discard them, or stay on this tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setPendingTab(null)}>
              Stay
            </Button>
            <Button variant="outline" onClick={dialogDiscard} disabled={saveMut.isPending}>
              Discard
            </Button>
            <Button onClick={dialogSave} disabled={saveMut.isPending}>
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type TabProps = {
  form: SystemSettings;
  set: <K extends keyof SystemSettings>(k: K, v: SystemSettings[K]) => void;
};

function GeneralTab({ form, set }: TabProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="glass border-border-subtle">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Building2 className="h-4 w-4" />
          <CardTitle className="text-base">Organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Company / brand name">
            <Input
              value={form.company_name}
              onChange={(e) => set("company_name", e.target.value)}
              placeholder="Your firm name"
            />
          </Field>
          <Field label="Support email" hint="Shown on invitations & client emails">
            <Input
              type="email"
              value={form.support_email}
              onChange={(e) => set("support_email", e.target.value)}
              placeholder="support@firm.com"
            />
          </Field>
          <Field label="Default timezone">
            <Select value={form.default_timezone} onValueChange={(v) => set("default_timezone", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card className="glass border-border-subtle">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Clock className="h-4 w-4" />
          <CardTitle className="text-base">Time tracking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field
            label="Edit window (minutes)"
            hint="How long users can edit a time log after it ends"
          >
            <Input
              type="number"
              min={0}
              max={1440}
              value={form.time_edit_window_min}
              onChange={(e) => set("time_edit_window_min", Number(e.target.value) || 0)}
            />
          </Field>
          <Field
            label="Idle warning (minutes)"
            hint="Prompt timer owner if running this long without activity"
          >
            <Input
              type="number"
              min={5}
              max={480}
              value={form.idle_warning_min}
              onChange={(e) => set("idle_warning_min", Number(e.target.value) || 60)}
            />
          </Field>
          <Field
            label="Auto-stop running timer after (minutes)"
            hint="Safety cap so a forgotten timer doesn't run forever. Default 120 (2 hours). The timer is closed at this limit — the user is NOT signed out."
          >
            <Input
              type="number"
              min={15}
              max={1440}
              value={form.timer_auto_stop_minutes}
              onChange={(e) => set("timer_auto_stop_minutes", Number(e.target.value) || 120)}
            />
          </Field>
          <Toggle
            label="New time logs are billable by default"
            checked={form.default_billable}
            onChange={(v) => set("default_billable", v)}
          />
        </CardContent>
      </Card>

      <Card className="glass border-border-subtle">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <MessageCircleQuestion className="h-4 w-4" />
          <CardTitle className="text-base">Open points</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Toggle
            label="New open points are client-visible by default"
            hint="Uncheck to start them as internal — you can flip per item."
            checked={form.open_point_default_visible}
            onChange={(v) => set("open_point_default_visible", v)}
          />
        </CardContent>
      </Card>

      <Card className="glass border-border-subtle">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <Bell className="h-4 w-4" />
          <CardTitle className="text-base">Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Toggle
            label="Notify users when @mentioned"
            checked={form.notify_on_mention}
            onChange={(v) => set("notify_on_mention", v)}
          />
          <Toggle
            label="Notify watchers on task status change"
            checked={form.notify_on_status_change}
            onChange={(v) => set("notify_on_status_change", v)}
          />
        </CardContent>
      </Card>

      <Card className="glass border-border-subtle lg:col-span-2">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <SlidersHorizontal className="h-4 w-4" />
          <CardTitle className="text-base">Pipeline & archive</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field
            label="Auto-archive completed tasks after (days)"
            hint="0 to disable. Hides Done tasks from active pipeline views."
          >
            <Input
              type="number"
              min={0}
              max={365}
              value={form.pipeline_archive_days}
              onChange={(e) => set("pipeline_archive_days", Number(e.target.value) || 0)}
            />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}

function HubVisibilityTab({ form, set }: TabProps) {
  return (
    <div className="grid gap-4">
      <Card className="glass border-border-subtle">
        <CardHeader className="flex-row items-center gap-2 space-y-0 justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            <CardTitle className="text-base">Hub visibility (global)</CardTitle>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/admin/access-control" search={{ tab: "roles" }}>
              Per-employee matrix →
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Master on/off for each top-level hub. Hidden hubs are removed from the sidebar and home
            for everyone (except admins for the Admin hub). Per-employee overrides on the matrix
            page take precedence.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {TOGGLEABLE_MODULES.map((m) => (
              <Toggle
                key={m}
                label={MODULE_LABEL[m]}
                checked={form.module_hubs[m] !== false}
                onChange={(v) => set("module_hubs", { ...form.module_hubs, [m]: v })}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-md border bg-card/50 p-3">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
