import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Target, Plus, Trash2, ArrowLeft, Mail, Phone, Building2, Megaphone } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/growth/leads")({
  component: () => (
    <AuthGuard allow={["admin", "super_admin", "employee"]}>
      <AppShell crumbs={[{ label: "Growth", to: "/growth/leads" }, { label: "Lead Pipeline" }]}>
        <LeadsPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type Source = "referral" | "website" | "cold_outreach" | "event" | "partner" | "other";
type Stage = "new" | "qualified" | "proposal" | "negotiation" | "won" | "lost";
type ActivityType = "note" | "call" | "email" | "meeting" | "proposal" | "other";

const SOURCES: { value: Source; label: string }[] = [
  { value: "referral", label: "Referral" },
  { value: "website", label: "Website" },
  { value: "cold_outreach", label: "Cold outreach" },
  { value: "event", label: "Event" },
  { value: "partner", label: "Partner" },
  { value: "other", label: "Other" },
];

const STAGES: { value: Stage; label: string; tone: string }[] = [
  { value: "new", label: "New", tone: "bg-slate-500" },
  { value: "qualified", label: "Qualified", tone: "bg-blue-500" },
  { value: "proposal", label: "Proposal", tone: "bg-sky-500" },
  { value: "negotiation", label: "Negotiation", tone: "bg-amber-500" },
  { value: "won", label: "Won", tone: "bg-green-600" },
  { value: "lost", label: "Lost", tone: "bg-rose-600" },
];

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Meeting" },
  { value: "proposal", label: "Proposal" },
  { value: "other", label: "Other" },
];

type Lead = {
  id: string;
  company_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  source: Source;
  stage: Stage;
  estimated_value: number;
  currency: string;
  expected_close_date: string | null;
  owner_id: string | null;
  campaign_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CampaignLite = { id: string; name: string };

type Activity = {
  id: string;
  lead_id: string;
  type: ActivityType;
  summary: string;
  occurred_at: string;
  author_id: string | null;
};

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

function fmtMoney(n: number, c = "USD") {
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

function LeadsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  return selected ? (
    <LeadDetail id={selected} onBack={() => setSelected(null)} />
  ) : (
    <LeadsBoard onOpen={setSelected} />
  );
}

function useProfilesMap(ids: string[]) {
  return useQuery({
    queryKey: ["leads", "profiles", ids.sort().join(",")],
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

function useCampaigns() {
  return useQuery({
    queryKey: ["campaigns", "lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_campaigns")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as CampaignLite[];
    },
  });
}

const NO_CAMPAIGN = "__none__";

function LeadsBoard({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const isManager = !!role && ["admin", "super_admin"].includes(role);
  const [scope, setScope] = useState<"all" | "mine">(isManager ? "all" : "mine");

  const leadsQ = useQuery({
    queryKey: ["leads", "list", scope, user?.id ?? ""],
    queryFn: async () => {
      let q = supabase.from("leads").select("*").order("updated_at", { ascending: false });
      if (scope === "mine" && user?.id) q = q.eq("owner_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Lead[];
    },
  });

  const ownerIds = useMemo(
    () =>
      Array.from(new Set((leadsQ.data ?? []).map((l) => l.owner_id).filter(Boolean) as string[])),
    [leadsQ.data],
  );
  const profilesQ = useProfilesMap(ownerIds);

  const stageGroups = useMemo(() => {
    const m = new Map<Stage, Lead[]>();
    STAGES.forEach((s) => m.set(s.value, []));
    (leadsQ.data ?? []).forEach((l) => {
      m.get(l.stage)?.push(l);
    });
    return m;
  }, [leadsQ.data]);

  const totals = useMemo(() => {
    const list = leadsQ.data ?? [];
    return {
      open: list.filter((l) => l.stage !== "won" && l.stage !== "lost").length,
      won: list.filter((l) => l.stage === "won").length,
      pipelineValue: list
        .filter((l) => l.stage !== "lost")
        .reduce((s, l) => s + Number(l.estimated_value), 0),
      wonValue: list
        .filter((l) => l.stage === "won")
        .reduce((s, l) => s + Number(l.estimated_value), 0),
    };
  }, [leadsQ.data]);

  const stageMut = useMutation({
    mutationFn: async (input: { id: string; stage: Stage }) => {
      const { error } = await supabase
        .from("leads")
        .update({ stage: input.stage })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead Pipeline"
        description="Track prospects from new to closed across the funnel."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Open leads" value={totals.open.toString()} />
        <StatCard label="Won" value={totals.won.toString()} />
        <StatCard label="Pipeline value" value={fmtMoney(totals.pipelineValue)} />
        <StatCard label="Won value" value={fmtMoney(totals.wonValue)} />
      </div>

      <Card>
        <CardContent className="p-4 flex items-center gap-3">
          {isManager && (
            <Select value={scope} onValueChange={(v) => setScope(v as "all" | "mine")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All leads</SelectItem>
                <SelectItem value="mine">Mine only</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="ml-auto">
            <LeadDialog ownerId={user?.id ?? ""} />
          </div>
        </CardContent>
      </Card>

      {leadsQ.isLoading ? (
        <Skeleton className="h-96" />
      ) : (leadsQ.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Target className="h-8 w-8" />}
          title="No leads yet"
          description="Add your first lead using the button above."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAGES.map((s) => {
            const group = stageGroups.get(s.value) ?? [];
            return (
              <div key={s.value} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${s.tone}`} />
                    <span className="text-sm font-medium">{s.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">{group.length}</span>
                </div>
                <div className="space-y-2 min-h-12">
                  {group.map((l) => {
                    const owner = l.owner_id ? profilesQ.data?.get(l.owner_id) : undefined;
                    return (
                      <Card
                        key={l.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => onOpen(l.id)}
                      >
                        <CardContent className="p-3 space-y-2">
                          <div className="font-medium text-sm truncate">{l.company_name}</div>
                          {l.contact_name && (
                            <div className="text-xs text-muted-foreground truncate">
                              {l.contact_name}
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-xs tabular-nums">
                              {fmtMoney(Number(l.estimated_value), l.currency)}
                            </span>
                            {owner && <UserAvatar profile={owner} size="sm" />}
                          </div>
                          <Select
                            value={l.stage}
                            onValueChange={(v) => stageMut.mutate({ id: l.id, stage: v as Stage })}
                          >
                            <SelectTrigger
                              className="h-7 text-xs"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAGES.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LeadDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const leadQ = useQuery({
    queryKey: ["leads", "one", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("id", id).single();
      if (error) throw error;
      return data as Lead;
    },
  });

  const activitiesQ = useQuery({
    queryKey: ["leads", "activities", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_activities")
        .select("*")
        .eq("lead_id", id)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Activity[];
    },
  });

  const ids = useMemo(() => {
    const set = new Set<string>();
    if (leadQ.data?.owner_id) set.add(leadQ.data.owner_id);
    (activitiesQ.data ?? []).forEach((a) => a.author_id && set.add(a.author_id));
    return Array.from(set);
  }, [leadQ.data, activitiesQ.data]);
  const profilesQ = useProfilesMap(ids);
  const campaignsQ = useCampaigns();

  const [actType, setActType] = useState<ActivityType>("note");
  const [actSummary, setActSummary] = useState("");

  const addActMut = useMutation({
    mutationFn: async () => {
      if (!actSummary.trim()) throw new Error("Summary required");
      const { error } = await supabase.from("lead_activities").insert({
        lead_id: id,
        type: actType,
        summary: actSummary.trim(),
        author_id: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads", "activities", id] });
      setActSummary("");
      toast.success("Logged");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteActMut = useMutation({
    mutationFn: async (actId: string) => {
      const { error } = await supabase.from("lead_activities").delete().eq("id", actId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads", "activities", id] });
    },
  });

  const deleteLeadMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("leads").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Deleted");
      onBack();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (leadQ.isLoading) return <Skeleton className="h-96" />;
  if (!leadQ.data) return <div>Not found</div>;
  const l = leadQ.data;
  const owner = l.owner_id ? profilesQ.data?.get(l.owner_id) : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div className="flex-1" />
        <LeadDialog lead={l} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm("Delete this lead?")) deleteLeadMut.mutate();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <PageHeader title={l.company_name} description={l.contact_name ?? "—"} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Badge className="capitalize">{STAGES.find((s) => s.value === l.stage)?.label}</Badge>
              <Badge variant="outline" className="capitalize">
                {l.source.replace("_", " ")}
              </Badge>
            </div>
            {l.campaign_id && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Megaphone className="h-3.5 w-3.5" />
                <span>
                  Campaign:{" "}
                  <span className="text-foreground">
                    {campaignsQ.data?.find((c) => c.id === l.campaign_id)?.name ?? "—"}
                  </span>
                </span>
              </div>
            )}
            <div className="text-2xl font-semibold tabular-nums">
              {fmtMoney(Number(l.estimated_value), l.currency)}
            </div>
            {l.expected_close_date && (
              <div className="text-xs text-muted-foreground">
                Expected close: {l.expected_close_date}
              </div>
            )}
            <div className="space-y-2 text-sm pt-2 border-t">
              {l.contact_email && (
                <a
                  href={`mailto:${l.contact_email}`}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <Mail className="h-3.5 w-3.5" />
                  {l.contact_email}
                </a>
              )}
              {l.contact_phone && (
                <a
                  href={`tel:${l.contact_phone}`}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {l.contact_phone}
                </a>
              )}
              {owner && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Owner: {owner.full_name ?? owner.email}</span>
                </div>
              )}
            </div>
            {l.notes && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-1">Notes</div>
                <div className="text-sm whitespace-pre-wrap">{l.notes}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-4">
            <div className="font-medium">Activity timeline</div>
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <Select value={actType} onValueChange={(v) => setActType(v as ActivityType)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITY_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={actSummary}
                  onChange={(e) => setActSummary(e.target.value)}
                  placeholder="What happened?"
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && actSummary.trim()) {
                      e.preventDefault();
                      addActMut.mutate();
                    }
                  }}
                />
                <Button onClick={() => addActMut.mutate()} disabled={addActMut.isPending} size="sm">
                  Log
                </Button>
              </div>
            </div>

            {activitiesQ.isLoading ? (
              <Skeleton className="h-32" />
            ) : (activitiesQ.data ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">No activity yet.</div>
            ) : (
              <div className="space-y-3">
                {(activitiesQ.data ?? []).map((a) => {
                  const author = a.author_id ? profilesQ.data?.get(a.author_id) : undefined;
                  return (
                    <div key={a.id} className="flex gap-3 group">
                      {author && <UserAvatar profile={author} size="sm" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs capitalize">
                            {a.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.occurred_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-sm mt-1 whitespace-pre-wrap">{a.summary}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => deleteActMut.mutate(a.id)}
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
      </div>
    </div>
  );
}

function LeadDialog({ lead, ownerId }: { lead?: Lead; ownerId?: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState(lead?.company_name ?? "");
  const [contactName, setContactName] = useState(lead?.contact_name ?? "");
  const [contactEmail, setContactEmail] = useState(lead?.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(lead?.contact_phone ?? "");
  const [source, setSource] = useState<Source>(lead?.source ?? "other");
  const [stage, setStage] = useState<Stage>(lead?.stage ?? "new");
  const [value, setValue] = useState(lead?.estimated_value?.toString() ?? "0");
  const [currency, setCurrency] = useState(lead?.currency ?? "USD");
  const [closeDate, setCloseDate] = useState(lead?.expected_close_date ?? "");
  const [campaignId, setCampaignId] = useState<string>(lead?.campaign_id ?? NO_CAMPAIGN);
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const campaignsQ = useCampaigns();

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!company.trim()) throw new Error("Company required");
      const payload = {
        company_name: company.trim(),
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        source,
        stage,
        estimated_value: Number(value) || 0,
        currency: currency.trim() || "USD",
        expected_close_date: closeDate || null,
        owner_id: lead?.owner_id ?? ownerId ?? user?.id ?? null,
        campaign_id: campaignId === NO_CAMPAIGN ? null : campaignId,
        notes: notes.trim() || null,
      };
      if (lead) {
        const { error } = await supabase.from("leads").update(payload).eq("id", lead.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("leads").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(lead ? "Updated" : "Created");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {lead ? (
          <Button size="sm" variant="outline">
            Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{lead ? "Edit lead" : "New lead"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid gap-1.5">
            <Label>Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Contact name</Label>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Contact email</Label>
              <Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Contact phone</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as Source)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Expected close</Label>
              <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Estimated value</Label>
              <Input
                type="number"
                step="0.01"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Currency</Label>
              <Input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={6} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Campaign</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder="No campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CAMPAIGN}>— None —</SelectItem>
                  {(campaignsQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
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
