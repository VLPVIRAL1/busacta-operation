import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Megaphone,
  Calendar,
  Mail,
  Users,
  Share2,
  Sparkles,
  DollarSign,
  Search,
  Globe,
  Plus,
  Trash2,
  ArrowLeft,
  Target,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/growth/marketing")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin"]}>
      <AppShell crumbs={[{ label: "Growth", to: "/growth" }, { label: "Campaigns" }]}>
        <CampaignsPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

export type Channel =
  | "email"
  | "social"
  | "events"
  | "content"
  | "referral"
  | "paid"
  | "seo"
  | "other";
export type Status = "planned" | "in_progress" | "live" | "done" | "cancelled";

export const CHANNEL_META: Record<Channel, { label: string; Icon: LucideIcon }> = {
  email: { label: "Email", Icon: Mail },
  social: { label: "Social", Icon: Share2 },
  events: { label: "Events", Icon: Calendar },
  content: { label: "Content", Icon: Sparkles },
  referral: { label: "Referral", Icon: Users },
  paid: { label: "Paid ads", Icon: DollarSign },
  seo: { label: "SEO", Icon: Globe },
  other: { label: "Other", Icon: Megaphone },
};

export const CHANNELS = Object.entries(CHANNEL_META).map(([value, m]) => ({
  value: value as Channel,
  label: m.label,
}));

export const STATUS_META: Record<Status, { label: string; tone: string }> = {
  planned: { label: "Planned", tone: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  in_progress: { label: "In progress", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  live: { label: "Live", tone: "bg-green-500/15 text-green-700 dark:text-green-300" },
  done: { label: "Done", tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  cancelled: { label: "Cancelled", tone: "bg-muted text-muted-foreground" },
};

export const STATUSES = Object.entries(STATUS_META).map(([value, m]) => ({
  value: value as Status,
  label: m.label,
}));

export type Campaign = {
  id: string;
  name: string;
  channel: Channel;
  status: Status;
  goal: string | null;
  description: string | null;
  owner_id: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: number;
  actual_spend: number;
  currency: string;
  target_metric: string | null;
  created_at: string;
  updated_at: string;
};

type AttributedLead = {
  id: string;
  campaign_id: string | null;
  stage: string;
  estimated_value: number;
};

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

export function fmtMoney(n: number, c = "USD") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: c,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${c} ${n.toFixed(0)}`;
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtWindow(start: string | null, end: string | null) {
  if (!start && !end) return "No dates set";
  if (start && end) return `${start} → ${end}`;
  return start ? `From ${start}` : `Until ${end}`;
}

function useProfilesMap(ids: string[]) {
  return useQuery({
    queryKey: ["campaigns", "profiles", ids.sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", ids);
      if (error) throw error;
      const m = new Map<string, ProfileLite>();
      (data ?? []).forEach((p) => m.set(p.id, p as ProfileLite));
      return m;
    },
  });
}

/** All leads' attribution fields, used to count/value leads per campaign. */
function useAttributedLeads() {
  return useQuery({
    queryKey: ["campaigns", "attributed-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, campaign_id, stage, estimated_value");
      if (error) throw error;
      return (data ?? []) as AttributedLead[];
    },
  });
}

type LeadRollup = { count: number; won: number; pipeline: number; wonValue: number };

function rollupFor(leads: AttributedLead[], campaignId: string): LeadRollup {
  const mine = leads.filter((l) => l.campaign_id === campaignId);
  return {
    count: mine.length,
    won: mine.filter((l) => l.stage === "won").length,
    pipeline: mine
      .filter((l) => l.stage !== "lost")
      .reduce((s, l) => s + Number(l.estimated_value), 0),
    wonValue: mine
      .filter((l) => l.stage === "won")
      .reduce((s, l) => s + Number(l.estimated_value), 0),
  };
}

function CampaignsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  return selected ? (
    <CampaignDetail id={selected} onBack={() => setSelected(null)} />
  ) : (
    <CampaignsBoard onOpen={setSelected} />
  );
}

function CampaignsBoard({ onOpen }: { onOpen: (id: string) => void }) {
  const { user } = useAuth();
  const [channelF, setChannelF] = useState<Channel | "all">("all");
  const [statusF, setStatusF] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");

  const campaignsQ = useQuery({
    queryKey: ["campaigns", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_campaigns")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Campaign[];
    },
  });

  const leadsQ = useAttributedLeads();

  const ownerIds = useMemo(
    () =>
      Array.from(
        new Set((campaignsQ.data ?? []).map((c) => c.owner_id).filter(Boolean) as string[]),
      ),
    [campaignsQ.data],
  );
  const profilesQ = useProfilesMap(ownerIds);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (campaignsQ.data ?? []).filter((c) => {
      if (channelF !== "all" && c.channel !== channelF) return false;
      if (statusF !== "all" && c.status !== statusF) return false;
      if (q && !`${c.name} ${c.goal ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [campaignsQ.data, channelF, statusF, search]);

  const totals = useMemo(() => {
    const list = campaignsQ.data ?? [];
    const leads = leadsQ.data ?? [];
    return {
      active: list.filter((c) => c.status === "live" || c.status === "in_progress").length,
      budget: list.reduce((s, c) => s + Number(c.budget), 0),
      spend: list.reduce((s, c) => s + Number(c.actual_spend), 0),
      leads: leads.filter((l) => l.campaign_id).length,
    };
  }, [campaignsQ.data, leadsQ.data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campaigns"
        description="Plan, budget and track marketing campaigns across every channel."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active campaigns" value={totals.active.toString()} />
        <StatCard label="Total budget" value={fmtMoney(totals.budget)} />
        <StatCard label="Total spend" value={fmtMoney(totals.spend)} />
        <StatCard label="Leads attributed" value={totals.leads.toString()} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns…"
              className="pl-8"
            />
          </div>
          <Select value={channelF} onValueChange={(v) => setChannelF(v as Channel | "all")}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              {CHANNELS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusF} onValueChange={(v) => setStatusF(v as Status | "all")}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CampaignDialog ownerId={user?.id ?? ""} />
        </CardContent>
      </Card>

      {campaignsQ.isLoading ? (
        <Skeleton className="h-96" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-8 w-8" />}
          title={(campaignsQ.data ?? []).length === 0 ? "No campaigns yet" : "No matches"}
          description={
            (campaignsQ.data ?? []).length === 0
              ? "Create your first campaign using the button above."
              : "Try clearing the filters or search."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const meta = CHANNEL_META[c.channel];
            const Icon = meta.Icon;
            const roll = rollupFor(leadsQ.data ?? [], c.id);
            const owner = c.owner_id ? profilesQ.data?.get(c.owner_id) : undefined;
            return (
              <Card
                key={c.id}
                className="h-full cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => onOpen(c.id)}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="text-sm font-semibold leading-tight">{c.name}</div>
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          {meta.label}
                        </div>
                      </div>
                    </div>
                    <Badge variant="secondary" className={STATUS_META[c.status].tone}>
                      {STATUS_META[c.status].label}
                    </Badge>
                  </div>
                  {c.goal && <p className="text-sm text-muted-foreground">{c.goal}</p>}
                  <div className="grid grid-cols-3 gap-2 border-t pt-2 text-center">
                    <div>
                      <div className="text-sm font-semibold tabular-nums">
                        {fmtMoney(Number(c.budget), c.currency)}
                      </div>
                      <div className="text-[10px] uppercase text-muted-foreground">Budget</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold tabular-nums">
                        {fmtMoney(Number(c.actual_spend), c.currency)}
                      </div>
                      <div className="text-[10px] uppercase text-muted-foreground">Spent</div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold tabular-nums">{roll.count}</div>
                      <div className="text-[10px] uppercase text-muted-foreground">Leads</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {fmtWindow(c.start_date, c.end_date)}
                    </span>
                    {owner && <UserAvatar profile={owner} size="sm" />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CampaignDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();

  const campaignQ = useQuery({
    queryKey: ["campaigns", "one", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_campaigns")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Campaign;
    },
  });

  const leadsQ = useAttributedLeads();
  const profilesQ = useProfilesMap(campaignQ.data?.owner_id ? [campaignQ.data.owner_id] : []);

  const deleteMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("marketing_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Deleted");
      onBack();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (campaignQ.isLoading) return <Skeleton className="h-96" />;
  if (!campaignQ.data) return <div>Not found</div>;
  const c = campaignQ.data;
  const meta = CHANNEL_META[c.channel];
  const owner = c.owner_id ? profilesQ.data?.get(c.owner_id) : undefined;
  const roll = rollupFor(leadsQ.data ?? [], id);
  const spend = Number(c.actual_spend);
  const costPerLead = roll.count > 0 ? spend / roll.count : 0;
  const roi = spend > 0 ? ((roll.wonValue - spend) / spend) * 100 : null;
  const conversion = roll.count > 0 ? (roll.won / roll.count) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div className="flex-1" />
        <CampaignDialog campaign={c} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm("Delete this campaign?")) deleteMut.mutate();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <PageHeader title={c.name} description={c.goal ?? meta.label} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className={STATUS_META[c.status].tone}>
                {STATUS_META[c.status].label}
              </Badge>
              <Badge variant="outline">{meta.label}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <div className="text-xl font-semibold tabular-nums">
                  {fmtMoney(Number(c.budget), c.currency)}
                </div>
                <div className="text-[11px] uppercase text-muted-foreground">Budget</div>
              </div>
              <div>
                <div className="text-xl font-semibold tabular-nums">
                  {fmtMoney(spend, c.currency)}
                </div>
                <div className="text-[11px] uppercase text-muted-foreground">Actual spend</div>
              </div>
            </div>
            <div className="space-y-2 border-t pt-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                {fmtWindow(c.start_date, c.end_date)}
              </div>
              {c.target_metric && (
                <div className="flex items-center gap-2">
                  <Target className="h-3.5 w-3.5" />
                  Target: {c.target_metric}
                </div>
              )}
              {owner && (
                <div className="flex items-center gap-2">
                  <UserAvatar profile={owner} size="sm" />
                  <span>Owner: {owner.full_name ?? owner.email}</span>
                </div>
              )}
            </div>
            {c.description && (
              <div className="border-t pt-2">
                <div className="mb-1 text-xs text-muted-foreground">Description</div>
                <div className="whitespace-pre-wrap text-sm">{c.description}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 p-4">
            <div className="font-medium">Attributed leads & ROI</div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Leads" value={roll.count.toString()} />
              <StatCard label="Won" value={roll.won.toString()} />
              <StatCard label="Pipeline value" value={fmtMoney(roll.pipeline, c.currency)} />
              <StatCard label="Won value" value={fmtMoney(roll.wonValue, c.currency)} />
            </div>
            <div className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-3">
              <div>
                <div className="text-lg font-semibold tabular-nums">
                  {roll.count > 0 ? fmtMoney(costPerLead, c.currency) : "—"}
                </div>
                <div className="text-[11px] uppercase text-muted-foreground">Cost per lead</div>
              </div>
              <div>
                <div className="text-lg font-semibold tabular-nums">{conversion.toFixed(0)}%</div>
                <div className="text-[11px] uppercase text-muted-foreground">Win rate</div>
              </div>
              <div>
                <div
                  className={`text-lg font-semibold tabular-nums ${
                    roi === null ? "" : roi >= 0 ? "text-green-600" : "text-rose-600"
                  }`}
                >
                  {roi === null ? "—" : `${roi.toFixed(0)}%`}
                </div>
                <div className="text-[11px] uppercase text-muted-foreground">ROI</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Attribute leads to this campaign from{" "}
              <span className="font-medium text-foreground">Growth → Lead Pipeline</span>. ROI
              compares won value against actual spend.
            </p>
          </CardContent>
        </Card>
      </div>

      <CampaignTasks campaignId={id} />
    </div>
  );
}

type CampaignTask = {
  id: string;
  campaign_id: string;
  title: string;
  done: boolean;
  due_date: string | null;
  assignee_id: string | null;
  created_at: string;
};

function CampaignTasks({ campaignId }: { campaignId: string }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const tasksQ = useQuery({
    queryKey: ["campaigns", "tasks", campaignId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_tasks")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("done")
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as CampaignTask[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["campaigns", "tasks", campaignId] });

  const addMut = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Title required");
      const { error } = await supabase.from("campaign_tasks").insert({
        campaign_id: campaignId,
        title: title.trim(),
        due_date: due || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setTitle("");
      setDue("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async (t: CampaignTask) => {
      const { error } = await supabase
        .from("campaign_tasks")
        .update({ done: !t.done })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from("campaign_tasks").delete().eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const tasks = tasksQ.data ?? [];
  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div className="font-medium">Task checklist</div>
          {tasks.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {doneCount}/{tasks.length} done
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task…"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && title.trim()) {
                e.preventDefault();
                addMut.mutate();
              }
            }}
          />
          <Input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="sm:w-44"
          />
          <Button size="sm" onClick={() => addMut.mutate()} disabled={addMut.isPending}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </div>

        {tasksQ.isLoading ? (
          <Skeleton className="h-24" />
        ) : tasks.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No tasks yet. Add the steps needed to launch this campaign.
          </div>
        ) : (
          <div className="space-y-1.5">
            {tasks.map((t) => {
              const overdue = !t.done && t.due_date && t.due_date < todayISO();
              return (
                <div
                  key={t.id}
                  className="group flex items-center gap-2 rounded-md border px-2 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => toggleMut.mutate(t)}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={t.done ? "Mark as not done" : "Mark as done"}
                  >
                    {t.done ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </button>
                  <span
                    className={`flex-1 text-sm ${t.done ? "text-muted-foreground line-through" : ""}`}
                  >
                    {t.title}
                  </span>
                  {t.due_date && (
                    <span
                      className={`text-xs tabular-nums ${
                        overdue ? "text-rose-600" : "text-muted-foreground"
                      }`}
                    >
                      {t.due_date}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() => deleteMut.mutate(t.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CampaignDialog({ campaign, ownerId }: { campaign?: Campaign; ownerId?: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(campaign?.name ?? "");
  const [channel, setChannel] = useState<Channel>(campaign?.channel ?? "email");
  const [status, setStatus] = useState<Status>(campaign?.status ?? "planned");
  const [goal, setGoal] = useState(campaign?.goal ?? "");
  const [description, setDescription] = useState(campaign?.description ?? "");
  const [startDate, setStartDate] = useState(campaign?.start_date ?? "");
  const [endDate, setEndDate] = useState(campaign?.end_date ?? "");
  const [budget, setBudget] = useState(campaign?.budget?.toString() ?? "0");
  const [spend, setSpend] = useState(campaign?.actual_spend?.toString() ?? "0");
  const [currency, setCurrency] = useState(campaign?.currency ?? "USD");
  const [targetMetric, setTargetMetric] = useState(campaign?.target_metric ?? "");

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      const payload = {
        name: name.trim(),
        channel,
        status,
        goal: goal.trim() || null,
        description: description.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
        budget: Number(budget) || 0,
        actual_spend: Number(spend) || 0,
        currency: currency.trim() || "USD",
        target_metric: targetMetric.trim() || null,
        owner_id: campaign?.owner_id ?? ownerId ?? user?.id ?? null,
      };
      if (campaign) {
        const { error } = await supabase
          .from("marketing_campaigns")
          .update(payload)
          .eq("id", campaign.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("marketing_campaigns").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success(campaign ? "Updated" : "Created");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {campaign ? (
          <Button size="sm" variant="outline">
            Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" />
            New campaign
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{campaign ? "Edit campaign" : "New campaign"}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <div className="grid gap-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Budget</Label>
              <Input
                type="number"
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Actual spend</Label>
              <Input
                type="number"
                step="0.01"
                value={spend}
                onChange={(e) => setSpend(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={6} />
            </div>
            <div className="grid gap-1.5">
              <Label>Target metric</Label>
              <Input
                value={targetMetric}
                onChange={(e) => setTargetMetric(e.target.value)}
                placeholder="e.g. 50 qualified leads"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Goal</Label>
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="One-line objective"
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
