import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, MessageCircle, Network, Sparkles, ChevronRight } from "lucide-react";
import { cn } from "@/lib/shared/utils";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { AdminGuide } from "@/components/admin/admin-guide";
import { WhatsAppSettingsPage } from "./whatsapp";
import { IntegrationsPage } from "./integrations";
import { GeminiSettingsPage } from "./gemini-integration";
import { EmailSettingsPage } from "./email-integration";

type TabKey = "whatsapp" | "microsoft" | "gemini" | "email";
const VALID: TabKey[] = ["whatsapp", "microsoft", "gemini", "email"];

export const Route = createFileRoute("/admin/integration")({
  validateSearch: (s: Record<string, unknown>): { tab: TabKey } => ({
    tab: VALID.includes(s.tab as TabKey) ? (s.tab as TabKey) : "whatsapp",
  }),
  component: () => (
    <AuthGuard allow={["super_admin", "admin"]}>
      <AppShell fullBleed crumbs={[{ label: "Admin", to: "/admin" }, { label: "Integration" }]}>
        <IntegrationPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type IntegrationItem = {
  key: TabKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
};

const INTEGRATIONS: IntegrationItem[] = [
  {
    key: "whatsapp",
    label: "WhatsApp",
    description: "Meta Cloud API for OTP codes and task notifications",
    icon: <MessageCircle className="h-5 w-5" />,
    iconBg: "bg-green-500/10 text-green-600 dark:text-green-400",
  },
  {
    key: "microsoft",
    label: "Microsoft",
    description: "Graph / SharePoint for document-library provisioning",
    icon: <Network className="h-5 w-5" />,
    iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    key: "gemini",
    label: "Gemini",
    description: "Google Gemini AI for smart categorisation and analysis",
    icon: <Sparkles className="h-5 w-5" />,
    iconBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    key: "email",
    label: "Email",
    description: "SMTP / Resend for notifications, reports and password emails",
    icon: <Mail className="h-5 w-5" />,
    iconBg: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
];

function IntegrationPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [tab, setTab] = useState<TabKey>(search.tab);

  const handleChange = (next: TabKey) => {
    setTab(next);
    navigate({ search: { tab: next }, replace: true });
  };

  const active = INTEGRATIONS.find((i) => i.key === tab)!;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-4 sm:p-6">
      {/* Slim header */}
      <div className="mb-3 flex shrink-0 items-center gap-2">
        <h1 className="text-base font-semibold tracking-tight">Integration</h1>
        <span className="hidden text-xs text-muted-foreground sm:block">
          Connect external messaging, document, and email services.
        </span>
        <AdminGuide pageName="integration">
          Wire up the channels BusAcTa Operations talks to the outside world through.{" "}
          <strong>WhatsApp</strong> sends OTP codes and task notifications via the Meta Cloud API.{" "}
          <strong>Microsoft</strong> connects Graph / SharePoint for automated document-library
          provisioning. <strong>Email</strong> configures outgoing email notifications, password
          setup emails, and scheduled report delivery. Each integration stores its own credentials
          and has a "Test connection" action.
        </AdminGuide>
      </div>

      {/* Two-panel layout */}
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        {/* ── Left panel: integration picker ── */}
        <div className="flex w-64 shrink-0 flex-col gap-1 overflow-y-auto rounded-xl border border-border-subtle bg-white p-2 dark:bg-card">
          <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            Services
          </p>
          {INTEGRATIONS.map((item) => (
            <button
              key={item.key}
              onClick={() => handleChange(item.key)}
              className={cn(
                "group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                tab === item.key
                  ? "bg-background shadow-sm ring-1 ring-border-subtle"
                  : "hover:bg-background/60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  item.iconBg,
                )}
              >
                {item.icon}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      tab === item.key ? "text-foreground" : "text-foreground/80",
                    )}
                  >
                    {item.label}
                  </span>
                  {tab === item.key && (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </span>
                <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* ── Right panel: settings content ── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border-subtle bg-white dark:bg-card">
          {/* Panel header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle px-5 py-3.5">
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                active.iconBg,
              )}
            >
              {active.icon}
            </span>
            <div>
              <p className="text-sm font-semibold">{active.label} Settings</p>
              <p className="text-xs text-muted-foreground">{active.description}</p>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {tab === "whatsapp" && <WhatsAppSettingsPage embedded />}
            {tab === "microsoft" && <IntegrationsPage embedded />}
            {tab === "gemini" && <GeminiSettingsPage embedded />}
            {tab === "email" && <EmailSettingsPage embedded />}
          </div>
        </div>
      </div>
    </div>
  );
}
