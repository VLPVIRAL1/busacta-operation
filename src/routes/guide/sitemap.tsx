import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card } from "@/components/ui/card";
import { ALL_TIER1, ALL_TIER2, MODULE_LABEL, type ModuleKey } from "@/lib/routing/use-nav";
import { EXTRA_PAGES } from "@/lib/routing/extra-pages";

export const Route = createFileRoute("/guide/sitemap")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "Guide", to: "/guide" }, { label: "Site Map" }]}>
        <SitemapPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

// EXTRA_PAGES is shared with /dashboard hub search — see src/lib/routing/extra-pages.ts

const STANDALONE = [
  { title: "Login", url: "/login" },
  { title: "Forgot Password", url: "/forgot-password" },
  { title: "Reset Password", url: "/reset-password" },
  { title: "Accept Invite", url: "/accept-invite/$token", note: "token link" },
  { title: "MFA Setup", url: "/security/mfa" },
  { title: "Session Expired", url: "/session-expired" },
  { title: "Unauthorized", url: "/unauthorized" },
  { title: "Forbidden", url: "/forbidden" },
  { title: "Legal · Privacy", url: "/legal/privacy" },
  { title: "Legal · Terms", url: "/legal/terms" },
  { title: "Legal · Security", url: "/legal/security" },
  { title: "Legal · DPA", url: "/legal/dpa" },
];

function SitemapPage() {
  const modules = ALL_TIER1.map((t) => t.key);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Application Site Map"
        description="Every page in the app, grouped by hub, drawn as a flow chart. Use this to validate your end-to-end workflows."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {modules.map((key) => (
          <ModuleColumn key={key} moduleKey={key} />
        ))}

        <Card className="p-4">
          <header className="mb-3 border-b pb-2">
            <h3 className="text-sm font-semibold">Standalone & system pages</h3>
            <p className="text-[11px] text-muted-foreground">
              Pages that live outside any hub (auth, legal, error pages).
            </p>
          </header>
          <ul className="space-y-1">
            {STANDALONE.map((p) => (
              <li key={p.url} className="flex items-center gap-2 text-xs">
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{p.url}</code>
                <span className="text-muted-foreground">— {p.title}</span>
                {p.note && (
                  <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700">
                    {p.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function ModuleColumn({ moduleKey }: { moduleKey: ModuleKey }) {
  const tier1 = ALL_TIER1.find((t) => t.key === moduleKey);
  const groups = ALL_TIER2[moduleKey] ?? [];
  const extras = EXTRA_PAGES[moduleKey] ?? [];
  if (!tier1) return null;
  const Icon = tier1.icon;

  return (
    <Card className="overflow-hidden p-0">
      {/* Hub header */}
      <header className="flex items-center justify-between bg-primary/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <Link
              to={tier1.url as never}
              className="text-sm font-semibold text-foreground hover:text-primary"
            >
              {MODULE_LABEL[moduleKey]}
            </Link>
            <div className="text-[11px] text-muted-foreground">
              <code>{tier1.url}</code>
            </div>
          </div>
        </div>
      </header>

      {/* Flow chart body */}
      <div className="space-y-4 p-4">
        {groups.length === 0 && extras.length === 0 && (
          <p className="text-xs italic text-muted-foreground">No sub-pages registered.</p>
        )}

        {groups.map((g) => (
          <div key={g.label} className="relative">
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="h-px flex-1 bg-border" />
              <span className="rounded-full border border-primary/30 bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                {g.label}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <ul className="ml-2 border-l border-border pl-3">
              {g.links.map((l) => (
                <li key={l.url} className="relative py-1">
                  <span className="absolute -left-[7px] top-2.5 h-2 w-2 rounded-full bg-primary/60 ring-2 ring-card" />
                  <Link
                    to={l.url as never}
                    className="text-xs font-medium text-foreground hover:text-primary"
                  >
                    {l.title}
                  </Link>
                  <code className="ml-2 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                    {l.url}
                  </code>
                  {l.description && (
                    <div className="text-[11px] text-muted-foreground">{l.description}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        {extras.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="h-px flex-1 bg-border" />
              <span className="rounded-full border border-amber-500/30 bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Detail / drill-down pages
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <ul className="ml-2 border-l border-dashed border-amber-400/40 pl-3">
              {extras.map((p) => (
                <li key={p.url} className="relative py-1">
                  <span className="absolute -left-[7px] top-2.5 h-2 w-2 rounded-full bg-amber-500/70 ring-2 ring-card" />
                  <span className="text-xs font-medium text-foreground">{p.title}</span>
                  <code className="ml-2 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                    {p.url}
                  </code>
                  {p.note && (
                    <span className="ml-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700">
                      {p.note}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
