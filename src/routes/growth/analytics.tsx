import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/stat-card";
import { supabase } from "@/integrations/supabase/client";
import {
  CHANNEL_META,
  STATUS_META,
  fmtMoney,
  type Campaign,
  type Channel,
  type Status,
} from "./marketing";

export const Route = createFileRoute("/growth/analytics")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin"]}>
      <AppShell crumbs={[{ label: "Growth", to: "/growth" }, { label: "Marketing Analytics" }]}>
        <AnalyticsPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type Stage = "new" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
type Source = "referral" | "website" | "cold_outreach" | "event" | "partner" | "other";

const STAGE_LABELS: { value: Stage; label: string; tone: string }[] = [
  { value: "new", label: "New", tone: "bg-slate-500" },
  { value: "qualified", label: "Qualified", tone: "bg-blue-500" },
  { value: "proposal", label: "Proposal", tone: "bg-sky-500" },
  { value: "negotiation", label: "Negotiation", tone: "bg-amber-500" },
  { value: "won", label: "Won", tone: "bg-green-600" },
  { value: "lost", label: "Lost", tone: "bg-rose-600" },
];

const SOURCE_LABELS: Record<Source, string> = {
  referral: "Referral",
  website: "Website",
  cold_outreach: "Cold outreach",
  event: "Event",
  partner: "Partner",
  other: "Other",
};

type LeadRow = {
  id: string;
  stage: Stage;
  source: Source;
  campaign_id: string | null;
  estimated_value: number;
};

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function AnalyticsPage() {
  const campaignsQ = useQuery({
    queryKey: ["analytics", "campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("marketing_campaigns").select("*");
      if (error) throw error;
      return (data ?? []) as Campaign[];
    },
  });

  const leadsQ = useQuery({
    queryKey: ["analytics", "leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, stage, source, campaign_id, estimated_value");
      if (error) throw error;
      return (data ?? []) as LeadRow[];
    },
  });

  const isLoading = campaignsQ.isLoading || leadsQ.isLoading;
  const campaigns = campaignsQ.data ?? [];
  const leads = leadsQ.data ?? [];

  const channelById = useMemo(() => {
    const m = new Map<string, Channel>();
    campaigns.forEach((c) => m.set(c.id, c.channel));
    return m;
  }, [campaigns]);

  const totals = useMemo(() => {
    const budget = campaigns.reduce((s, c) => s + Number(c.budget), 0);
    const spend = campaigns.reduce((s, c) => s + Number(c.actual_spend), 0);
    const attributed = leads.filter((l) => l.campaign_id);
    const wonValue = attributed
      .filter((l) => l.stage === "won")
      .reduce((s, l) => s + Number(l.estimated_value), 0);
    const roi = spend > 0 ? ((wonValue - spend) / spend) * 100 : null;
    const costPerLead = attributed.length > 0 ? spend / attributed.length : 0;
    return { budget, spend, wonValue, roi, costPerLead, attributedCount: attributed.length };
  }, [campaigns, leads]);

  const channelRows = useMemo(() => {
    return (Object.keys(CHANNEL_META) as Channel[])
      .map((ch) => {
        const chCampaigns = campaigns.filter((c) => c.channel === ch);
        const chLeads = leads.filter((l) => l.campaign_id && channelById.get(l.campaign_id) === ch);
        const spend = chCampaigns.reduce((s, c) => s + Number(c.actual_spend), 0);
        const wonValue = chLeads
          .filter((l) => l.stage === "won")
          .reduce((s, l) => s + Number(l.estimated_value), 0);
        const roi = spend > 0 ? ((wonValue - spend) / spend) * 100 : null;
        return {
          channel: ch,
          campaigns: chCampaigns.length,
          leads: chLeads.length,
          spend,
          wonValue,
          roi,
        };
      })
      .filter((r) => r.campaigns > 0 || r.leads > 0)
      .sort((a, b) => b.wonValue - a.wonValue);
  }, [campaigns, leads, channelById]);

  const funnel = useMemo(() => {
    const max = Math.max(1, leads.length);
    return STAGE_LABELS.map((s) => ({
      ...s,
      count: leads.filter((l) => l.stage === s.value).length,
    })).map((s) => ({ ...s, pctOfMax: pct(s.count, max) }));
  }, [leads]);

  const statusRollup = useMemo(() => {
    return (Object.keys(STATUS_META) as Status[])
      .map((st) => ({ status: st, count: campaigns.filter((c) => c.status === st).length }))
      .filter((r) => r.count > 0);
  }, [campaigns]);

  const sourceRollup = useMemo(() => {
    const total = leads.length;
    return (Object.keys(SOURCE_LABELS) as Source[])
      .map((src) => ({
        source: src,
        count: leads.filter((l) => l.source === src).length,
      }))
      .filter((r) => r.count > 0)
      .map((r) => ({ ...r, pctVal: pct(r.count, total) }))
      .sort((a, b) => b.count - a.count);
  }, [leads]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Marketing Analytics" description="Channel ROI, funnel & spend." />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing Analytics"
        description="Spend, channel ROI, conversion funnel and lead sources across all campaigns."
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total budget" value={fmtMoney(totals.budget)} />
        <StatCard label="Total spend" value={fmtMoney(totals.spend)} />
        <StatCard label="Won value (attrib.)" value={fmtMoney(totals.wonValue)} />
        <StatCard label="ROI" value={totals.roi === null ? "—" : `${totals.roi.toFixed(0)}%`} />
        <StatCard label="Leads attributed" value={totals.attributedCount.toString()} />
        <StatCard
          label="Cost / lead"
          value={totals.attributedCount > 0 ? fmtMoney(totals.costPerLead) : "—"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Channel performance */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="font-medium">Channel performance</div>
            {channelRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No campaign or lead data yet.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] gap-2 px-1 text-[11px] uppercase text-muted-foreground">
                  <span>Channel</span>
                  <span className="text-right">Camps</span>
                  <span className="text-right">Leads</span>
                  <span className="text-right">Spend</span>
                  <span className="text-right">ROI</span>
                </div>
                {channelRows.map((r) => {
                  const meta = CHANNEL_META[r.channel];
                  const Icon = meta.Icon;
                  return (
                    <div
                      key={r.channel}
                      className="grid grid-cols-[1.4fr_repeat(4,1fr)] items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                        {meta.label}
                      </span>
                      <span className="text-right tabular-nums">{r.campaigns}</span>
                      <span className="text-right tabular-nums">{r.leads}</span>
                      <span className="text-right tabular-nums">{fmtMoney(r.spend)}</span>
                      <span
                        className={`text-right tabular-nums ${
                          r.roi === null ? "" : r.roi >= 0 ? "text-green-600" : "text-rose-600"
                        }`}
                      >
                        {r.roi === null ? "—" : `${r.roi.toFixed(0)}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conversion funnel */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="font-medium">Lead funnel</div>
            {leads.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No leads yet.</p>
            ) : (
              <div className="space-y-2.5">
                {funnel.map((s) => (
                  <div key={s.value} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{s.label}</span>
                      <span className="tabular-nums text-muted-foreground">{s.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${s.tone}`}
                        style={{ width: `${s.pctOfMax}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Campaign status rollup */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="font-medium">Campaigns by status</div>
            {statusRollup.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No campaigns yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {statusRollup.map((r) => (
                  <div
                    key={r.status}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${STATUS_META[r.status].tone}`}
                  >
                    <span className="font-semibold tabular-nums">{r.count}</span>
                    <span>{STATUS_META[r.status].label}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lead source breakdown */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="font-medium">Leads by source</div>
            {sourceRollup.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No leads yet.</p>
            ) : (
              <div className="space-y-2.5">
                {sourceRollup.map((r) => (
                  <div key={r.source} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span>{SOURCE_LABELS[r.source]}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {r.count} ({r.pctVal}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${r.pctVal}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
