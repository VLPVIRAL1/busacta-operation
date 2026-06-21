import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle2, Lock, AlertTriangle, Asterisk } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { ALL_ROUTE_ENTRIES, type RouteEntry } from "@/lib/routing/route-inventory";
import {
  REGISTERED_ROUTES,
  ROUTE_MANIFEST_GENERATED_AT,
} from "@/lib/routing/registered-routes.generated";
import { buildMatchers, findMatchingRoute } from "@/lib/routing/route-match";
import { BYPASS_ACCESS, canAccess, formatRoles } from "@/lib/routing/route-access";
import type { AppRole } from "@/lib/routing/use-nav";

export const Route = createFileRoute("/guide/route-health")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "Guide", to: "/guide" }, { label: "Route Health" }]}>
        <RouteHealthPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type Status = "available" | "gated" | "missing" | "dynamic";

interface Classified extends RouteEntry {
  status: Status;
  matched?: string;
}

function classify(
  entry: RouteEntry,
  matchers: ReturnType<typeof buildMatchers>,
  userRoles: AppRole[],
): Classified {
  const matched = findMatchingRoute(entry.url, matchers);
  if (!matched) return { ...entry, status: "missing" };
  if (entry.isDynamic) return { ...entry, status: "dynamic", matched };
  if (!canAccess(userRoles, entry.url)) return { ...entry, status: "gated", matched };
  return { ...entry, status: "available", matched };
}

const STATUS_META: Record<Status, { label: string; tone: string; icon: typeof CheckCircle2 }> = {
  available: {
    label: "Available",
    tone: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
    icon: CheckCircle2,
  },
  gated: { label: "Gated", tone: "bg-amber-500/15 text-amber-700 border-amber-500/30", icon: Lock },
  missing: {
    label: "Missing",
    tone: "bg-destructive/15 text-destructive border-destructive/40",
    icon: AlertTriangle,
  },
  dynamic: {
    label: "Dynamic",
    tone: "bg-muted text-muted-foreground border-border",
    icon: Asterisk,
  },
};

function RouteHealthPage() {
  const { roles } = useAuth();
  const userRoles = (roles ?? []) as AppRole[];
  const [tick, setTick] = useState(0);

  const { entries, summary, byHub } = useMemo(() => {
    void tick;
    const matchers = buildMatchers(REGISTERED_ROUTES);
    const entries = ALL_ROUTE_ENTRIES.map((e) => classify(e, matchers, userRoles));
    const summary = { total: entries.length, available: 0, gated: 0, missing: 0, dynamic: 0 };
    for (const e of entries) summary[e.status]++;
    const byHub = new Map<string, Classified[]>();
    for (const e of entries) {
      const k = e.hubLabel;
      if (!byHub.has(k)) byHub.set(k, []);
      byHub.get(k)!.push(e);
    }
    return { entries, summary, byHub };
  }, [tick, userRoles]);

  void entries;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Route Health"
        description="Automated QA over every link advertised by the app. Verifies the URL maps to a registered route and surfaces role gating."
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <Chip label={`Total ${summary.total}`} tone="bg-muted text-foreground border-border" />
            <Chip label={`Available ${summary.available}`} tone={STATUS_META.available.tone} />
            <Chip label={`Gated ${summary.gated}`} tone={STATUS_META.gated.tone} />
            <Chip label={`Missing ${summary.missing}`} tone={STATUS_META.missing.tone} />
            <Chip label={`Dynamic ${summary.dynamic}`} tone={STATUS_META.dynamic.tone} />
          </div>
          <Button size="sm" variant="outline" onClick={() => setTick((t) => t + 1)}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Re-scan
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Manifest generated <code>{new Date(ROUTE_MANIFEST_GENERATED_AT).toLocaleString()}</code> ·{" "}
          {REGISTERED_ROUTES.length} registered routes · Access enforcement:{" "}
          <strong>{BYPASS_ACCESS ? "OFF (open access mode)" : "ON"}</strong> · Run{" "}
          <code>bun scripts/route-health.ts</code> to fail CI on regressions.
        </p>
      </Card>

      {summary.missing > 0 && (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> {summary.missing} advertised page(s) have no
            matching route
          </h3>
          <ul className="space-y-1 text-xs">
            {entries
              .filter((e) => e.status === "missing")
              .map((e) => (
                <li key={`${e.hub}-${e.url}`}>
                  <code className="rounded bg-muted px-1.5 py-0.5">{e.url}</code>
                  <span className="ml-2 text-muted-foreground">
                    — {e.title} ({e.hubLabel})
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {[...byHub.entries()].map(([hubLabel, list]) => (
          <HubCard key={hubLabel} hubLabel={hubLabel} list={list} />
        ))}
      </div>
    </div>
  );
}

function Chip({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

function HubCard({ hubLabel, list }: { hubLabel: string; list: Classified[] }) {
  const counts = list.reduce(
    (a, e) => ({ ...a, [e.status]: (a[e.status] ?? 0) + 1 }),
    {} as Record<Status, number>,
  );
  return (
    <Card className="overflow-hidden p-0">
      <header className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
        <h3 className="text-sm font-semibold">{hubLabel}</h3>
        <div className="flex gap-1.5">
          {(["available", "gated", "missing", "dynamic"] as Status[]).map((s) =>
            counts[s] ? (
              <span
                key={s}
                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_META[s].tone}`}
              >
                {counts[s]} {STATUS_META[s].label}
              </span>
            ) : null,
          )}
        </div>
      </header>
      <ul className="divide-y">
        {list.map((e) => {
          const meta = STATUS_META[e.status];
          const Icon = meta.icon;
          const clickable = e.status === "available" || e.status === "gated";
          return (
            <li key={`${e.hub}-${e.source}-${e.url}`} className="flex items-start gap-3 px-4 py-2">
              <span
                className={`mt-0.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${meta.tone}`}
              >
                <Icon className="h-3 w-3" /> {meta.label}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {clickable && !e.isDynamic ? (
                    <Link
                      to={e.url as never}
                      className="text-xs font-medium text-foreground hover:text-primary"
                    >
                      {e.title}
                    </Link>
                  ) : (
                    <span
                      className="text-xs font-medium text-foreground"
                      title={
                        e.status === "missing"
                          ? "No route registered"
                          : e.status === "dynamic"
                            ? "Requires a parameter, not directly clickable"
                            : ""
                      }
                    >
                      {e.title}
                    </span>
                  )}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                    {e.url}
                  </code>
                  <Badge variant="outline" className="text-[9px]">
                    {e.source}
                  </Badge>
                  {e.note && (
                    <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-700">
                      {e.note}
                    </span>
                  )}
                </div>
                {e.status === "gated" && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Requires: {formatRoles(e.requiredRoles)}
                  </div>
                )}
                {e.status === "missing" && (
                  <div className="mt-0.5 text-[11px] text-destructive">
                    No route file matches this URL — fix the link or create the route.
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
