import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BarChart3, TrendingDown, Clock, Download } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getTemplateAnalytics, listTemplatesWithStats } from "@/lib/organizer/analytics.functions";
import { purposeLabel, type DeploymentStatus } from "@/lib/organizer/schemas";

export const Route = createFileRoute("/organizer/analytics")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "Organizer", to: "/organizer" }, { label: "Analytics" }]}>
        <AnalyticsPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function AnalyticsPage() {
  const listFn = useServerFn(listTemplatesWithStats);
  const detailFn = useServerFn(getTemplateAnalytics);
  const [templateId, setTemplateId] = useState<string | null>(null);

  const { data: list, isLoading: loadingList } = useQuery({
    queryKey: ["organizer", "analytics-list"],
    queryFn: () => listFn(),
  });

  const templates = list?.templates ?? [];

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ["organizer", "analytics", templateId],
    queryFn: () => detailFn({ data: { template_id: templateId! } }),
    enabled: !!templateId,
  });

  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => b.deployments - a.deployments),
    [templates],
  );

  return (
    <>
      <PageHeader
        title="Organizer Analytics"
        description="Completion funnels, time-per-section and drop-off blocks per template."
        actions={
          sortedTemplates.length > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadCsv("organizer-templates", buildTemplatesCsv(sortedTemplates))}
            >
              <Download className="h-4 w-4 mr-1" /> Export templates CSV
            </Button>
          ) : undefined
        }
      />

      {loadingList ? (
        <Skeleton className="h-32 w-full" />
      ) : sortedTemplates.length === 0 ? (
        <EmptyState
          icon={<BarChart3 className="h-10 w-10" />}
          title="No templates yet"
          description="Create and deploy a template to see analytics."
        />
      ) : (
        <>
          <Card className="mb-4">
            <CardContent className="p-3">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-xs uppercase">
                  <tr>
                    <th className="text-left px-2 py-1">Template</th>
                    <th className="text-left px-2 py-1">Purpose</th>
                    <th className="text-right px-2 py-1">Deployments</th>
                    <th className="text-right px-2 py-1">Submitted</th>
                    <th className="text-right px-2 py-1">Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTemplates.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setTemplateId(t.id)}
                      className={`border-t cursor-pointer hover:bg-muted/30 ${
                        templateId === t.id ? "bg-muted/40" : ""
                      }`}
                    >
                      <td className="px-2 py-1.5 font-medium">
                        {t.name} <span className="text-xs text-muted-foreground">v{t.version}</span>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">
                        {purposeLabel[t.purpose]}
                      </td>
                      <td className="px-2 py-1.5 text-right">{t.deployments}</td>
                      <td className="px-2 py-1.5 text-right">{t.submitted}</td>
                      <td className="px-2 py-1.5 text-right">
                        {(t.completion_rate * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Detail for:</span>
            <Select value={templateId ?? ""} onValueChange={(v) => setTemplateId(v || null)}>
              <SelectTrigger className="w-[320px]">
                <SelectValue placeholder="Pick a template…" />
              </SelectTrigger>
              <SelectContent>
                {sortedTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} (v{t.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!templateId ? (
            <EmptyState
              icon={<BarChart3 className="h-10 w-10" />}
              title="Pick a template"
              description="Choose a template above to see its funnel, section timing, and drop-off."
            />
          ) : loadingDetail || !detail ? (
            <div className="space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <DetailView detail={detail} />
          )}
        </>
      )}
    </>
  );
}

const STATUS_ORDER: DeploymentStatus[] = [
  "not_started",
  "in_progress",
  "submitted",
  "under_review",
  "graded",
  "returned",
];

function DetailView({ detail }: { detail: Awaited<ReturnType<typeof getTemplateAnalytics>> }) {
  const total = detail.total_deployments;
  const funnelData = STATUS_ORDER.map((s) => ({
    status: s.replace("_", " "),
    count: detail.funnel[s] ?? 0,
  }));
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Completion funnel</h3>
            <div className="flex items-center gap-3">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Avg submit time:{" "}
                {detail.avg_submit_seconds !== null
                  ? formatDuration(detail.avg_submit_seconds)
                  : "—"}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => downloadCsv("organizer-funnel", buildFunnelCsv(funnelData, total))}
              >
                <Download className="h-3.5 w-3.5 mr-1" /> CSV
              </Button>
            </div>
          </div>
          <div className="h-44 mb-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <RechartsTooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5">
            {STATUS_ORDER.map((s) => {
              const n = detail.funnel[s];
              const pct = total > 0 ? (n / total) * 100 : 0;
              return (
                <div key={s} className="flex items-center gap-2 text-xs">
                  <div className="w-28 capitalize text-muted-foreground">{s.replace("_", " ")}</div>
                  <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="w-16 text-right tabular-nums">
                    {n} ({pct.toFixed(0)}%)
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold mb-3">Time & completion per section</h3>
          {detail.sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sections defined.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1">Section</th>
                  <th className="text-right px-2 py-1">Questions</th>
                  <th className="text-right px-2 py-1">Avg time</th>
                  <th className="text-right px-2 py-1">Completion</th>
                </tr>
              </thead>
              <tbody>
                {detail.sections.map((s) => (
                  <tr key={s.section_id} className="border-t">
                    <td className="px-2 py-1.5">{s.section_title}</td>
                    <td className="px-2 py-1.5 text-right">{s.question_count}</td>
                    <td className="px-2 py-1.5 text-right">
                      {s.avg_time_seconds !== null ? formatDuration(s.avg_time_seconds) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {(s.completion_rate * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-rose-500" />
            <h3 className="font-semibold">Top drop-off questions</h3>
          </div>
          {detail.drop_off.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No required-question drop-off detected yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1">Question</th>
                  <th className="text-left px-2 py-1">Section</th>
                  <th className="text-right px-2 py-1">Shown</th>
                  <th className="text-right px-2 py-1">Answered</th>
                  <th className="text-right px-2 py-1">Drop-off</th>
                </tr>
              </thead>
              <tbody>
                {detail.drop_off.map((d) => (
                  <tr key={d.block_id} className="border-t">
                    <td className="px-2 py-1.5 max-w-[420px] truncate">{d.question_text}</td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">{d.section_title}</td>
                    <td className="px-2 py-1.5 text-right">{d.shown_to}</td>
                    <td className="px-2 py-1.5 text-right">{d.answered_by}</td>
                    <td className="px-2 py-1.5 text-right font-medium text-rose-600 dark:text-rose-400">
                      {(d.drop_off_rate * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  return `${Math.round(seconds / 86400)}d`;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(name: string, rows: (string | number | null)[][]): void {
  try {
    const body = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `${name}-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  } catch (e) {
    toast.error((e as Error).message || "Export failed");
  }
}

function buildTemplatesCsv(
  rows: Array<{
    name: string;
    version: number;
    purpose: string;
    deployments: number;
    submitted: number;
    completion_rate: number;
  }>,
): (string | number)[][] {
  return [
    ["Template", "Version", "Purpose", "Deployments", "Submitted", "Completion %"],
    ...rows.map((t) => [
      t.name,
      t.version,
      t.purpose,
      t.deployments,
      t.submitted,
      Math.round(t.completion_rate * 100),
    ]),
  ];
}

function buildFunnelCsv(
  rows: { status: string; count: number }[],
  total: number,
): (string | number)[][] {
  return [
    ["Status", "Count", "% of total"],
    ...rows.map((r) => [r.status, r.count, total > 0 ? Math.round((r.count / total) * 100) : 0]),
  ];
}
