import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Search,
  CircleDot,
  CalendarRange,
  Layers,
  ClipboardList,
  Receipt,
  ClipboardCheck,
  UserPlus,
  BookOpen,
  LayoutList,
  AlertCircle,
  Clock,
  CheckCircle2,
  InboxIcon,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FacetedMultiChip } from "@/components/shared/faceted-multi-chip";
import { cn } from "@/lib/shared/utils";
import { listMyDeployments } from "@/lib/organizer/deployments.functions";
import { type OrganizerPurpose, purposeLabel } from "@/lib/organizer/schemas";
import { useAuth } from "@/lib/auth/auth-context";
import { useRealtimeChannel } from "@/hooks/use-realtime-channel";

// ── Purpose icon config (mirrors hub) ────────────────────────────────────────
const PURPOSE_CONFIG: Record<
  OrganizerPurpose,
  { Icon: ComponentType<{ className?: string }>; bg: string; text: string }
> = {
  tax: { Icon: Receipt, bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  hr_exam: { Icon: ClipboardCheck, bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  onboarding: {
    Icon: UserPlus,
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
  },
  learning_quiz: {
    Icon: BookOpen,
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
  },
  generic: { Icon: LayoutList, bg: "bg-slate-500/10", text: "text-slate-600 dark:text-slate-400" },
};

// ── Due date helper ───────────────────────────────────────────────────────────
type DueTone = "overdue" | "today" | "soon" | "later" | "none";

function relativeDue(iso: string | null): { label: string; tone: DueTone } {
  if (!iso) return { label: "No due date", tone: "none" };
  const diff = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  if (diff < 0) {
    const days = Math.ceil(-diff);
    return { label: `Overdue · ${days} day${days === 1 ? "" : "s"}`, tone: "overdue" };
  }
  if (diff < 1) return { label: "Due today", tone: "today" };
  if (diff < 2) return { label: "Due tomorrow", tone: "soon" };
  if (diff < 7) return { label: `Due in ${Math.floor(diff)} days`, tone: "soon" };
  return { label: `Due ${new Date(iso).toLocaleDateString()}`, tone: "later" };
}

const DUE_TONE_STYLES: Record<DueTone, string> = {
  overdue: "text-rose-600 dark:text-rose-400",
  today: "text-amber-600 dark:text-amber-400",
  soon: "text-blue-600 dark:text-blue-400",
  later: "text-muted-foreground",
  none: "text-muted-foreground",
};

const LEFT_BORDER: Record<DueTone, string> = {
  overdue: "border-l-4 border-l-rose-500",
  today: "border-l-4 border-l-amber-500",
  soon: "border-l-4 border-l-blue-400",
  later: "",
  none: "",
};

// ── Status display ────────────────────────────────────────────────────────────
const STATUS_BADGE: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  submitted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  under_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  graded: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  returned: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
};

// ── Route ─────────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/organizer/inbox")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin", "hr_manager", "employee"]}>
      <AppShell crumbs={[{ label: "Organizer", to: "/organizer" }, { label: "Inbox" }]}>
        <InboxPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type SortKey = "due_asc" | "due_desc" | "created_desc" | "name_asc";

type DeploymentRow = {
  id: string;
  template_name: string | null;
  template_purpose: string | null;
  template_version: number;
  status: string;
  due_at: string | null;
  created_at: string;
};

// ── Main page ─────────────────────────────────────────────────────────────────
function InboxPage() {
  const list = useServerFn(listMyDeployments);
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["organizer", "my-deployments"],
    queryFn: () => list(),
  });

  useRealtimeChannel(user ? `notif-${user.id}` : null, (channel) => {
    return channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "organizer_deployments",
        filter: `assignee_profile_id=eq.${user!.id}`,
      },
      () => qc.invalidateQueries({ queryKey: ["organizer", "my-deployments"] }),
    );
  });

  const rows = (data?.deployments ?? []) as DeploymentRow[];

  const [search, setSearch] = useState("");
  const [statusSel, setStatusSel] = useState<string[]>([]);
  const [purposeSel, setPurposeSel] = useState<string[]>([]);
  const [dueSel, setDueSel] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>("due_asc");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const now = Date.now();
    const inWindow = (iso: string | null): string[] => {
      if (!iso) return ["no_due"];
      const diff = (new Date(iso).getTime() - now) / 86_400_000;
      if (diff < 0) return ["overdue"];
      if (diff < 1) return ["today"];
      if (diff < 7) return ["this_week"];
      return ["later"];
    };
    let out = rows.filter((d) => {
      if (statusSel.length && !statusSel.includes(d.status)) return false;
      if (purposeSel.length && (!d.template_purpose || !purposeSel.includes(d.template_purpose)))
        return false;
      if (dueSel.length && !inWindow(d.due_at).some((k) => dueSel.includes(k))) return false;
      if (needle) {
        const hay = `${d.template_name ?? ""} ${d.template_purpose ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      switch (sort) {
        case "due_asc":
          return (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999");
        case "due_desc":
          return (b.due_at ?? "0000").localeCompare(a.due_at ?? "0000");
        case "created_desc":
          return b.created_at.localeCompare(a.created_at);
        case "name_asc":
          return (a.template_name ?? "").localeCompare(b.template_name ?? "");
      }
    });
    return out;
  }, [rows, statusSel, purposeSel, dueSel, search, sort]);

  // Derive grouped buckets
  const groups = useMemo(() => {
    const actionNeeded = filtered.filter((d) =>
      ["not_started", "in_progress", "returned"].includes(d.status),
    );
    const inReview = filtered.filter((d) => ["submitted", "under_review"].includes(d.status));
    const done = filtered.filter((d) => d.status === "graded");
    return { actionNeeded, inReview, done };
  }, [filtered]);

  // Stats for hero
  const now = Date.now();
  const totalCount = rows.length;
  const actionCount = rows.filter((d) =>
    ["not_started", "in_progress", "returned"].includes(d.status),
  ).length;
  const overdueCount = rows.filter(
    (d) =>
      d.due_at &&
      new Date(d.due_at).getTime() < now &&
      !["submitted", "under_review", "graded"].includes(d.status),
  ).length;
  const submittedCount = rows.filter((d) =>
    ["submitted", "under_review"].includes(d.status),
  ).length;

  const statusOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.status))).map((s) => ({
        value: s,
        label: s.replace(/_/g, " "),
        count: rows.filter((r) => r.status === s).length,
      })),
    [rows],
  );
  const purposeOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.template_purpose).filter(Boolean) as string[])).map(
        (p) => ({
          value: p,
          label: p,
          count: rows.filter((r) => r.template_purpose === p).length,
        }),
      ),
    [rows],
  );
  const dueOptions = [
    { value: "overdue", label: "Overdue" },
    { value: "today", label: "Today" },
    { value: "this_week", label: "This week" },
    { value: "later", label: "Later" },
    { value: "no_due", label: "No due date" },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="rounded-2xl bg-primary px-6 py-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <InboxIcon className="h-4 w-4 text-primary-foreground/80 flex-shrink-0" />
          <div>
            <h1 className="text-xl font-bold text-primary-foreground leading-tight">
              My Organizers
            </h1>
            <p className="text-xs text-primary-foreground/70">
              Forms, exams, and checklists assigned to you.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { label: "Total", value: totalCount },
            { label: "Needs Action", value: actionCount },
            { label: "Overdue", value: overdueCount },
            { label: "Submitted", value: submittedCount },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-center backdrop-blur-sm min-w-[60px]"
            >
              {isLoading ? (
                <div className="h-5 w-6 mx-auto rounded bg-white/20 animate-pulse mb-0.5" />
              ) : (
                <div className="text-xl font-bold text-primary-foreground leading-none">
                  {s.value}
                </div>
              )}
              <div className="text-[11px] text-primary-foreground/70 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-2xl border bg-card/60 backdrop-blur-sm p-3 flex flex-wrap items-center gap-1.5">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by template name…"
            className="pl-8 h-9 text-sm"
          />
        </div>
        <FacetedMultiChip
          label="Status"
          icon={<CircleDot className="h-3 w-3" />}
          options={statusOptions}
          selected={statusSel}
          onChange={setStatusSel}
        />
        <FacetedMultiChip
          label="Purpose"
          icon={<ClipboardList className="h-3 w-3" />}
          options={purposeOptions}
          selected={purposeSel}
          onChange={setPurposeSel}
        />
        <FacetedMultiChip
          label="Due"
          icon={<CalendarRange className="h-3 w-3" />}
          options={dueOptions}
          selected={dueSel}
          onChange={setDueSel}
        />
        <div className="ml-auto flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="due_asc">Due date (soonest)</SelectItem>
              <SelectItem value="due_desc">Due date (latest)</SelectItem>
              <SelectItem value="created_desc">Recently assigned</SelectItem>
              <SelectItem value="name_asc">Template name (A–Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <InboxSkeleton />
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border bg-card p-16">
          <EmptyState
            icon={<InboxIcon className="h-10 w-10" />}
            title={rows.length === 0 ? "Nothing assigned" : "No matches"}
            description={
              rows.length === 0
                ? "When an admin assigns you an organizer, exam, or checklist it will appear here."
                : "Adjust the filters or search to see more."
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          <DeploymentGroup
            title="Needs Action"
            icon={<CircleDot className="h-4 w-4 text-blue-500" />}
            items={groups.actionNeeded}
            emptyText="Nothing needs action right now."
          />
          <DeploymentGroup
            title="Under Review"
            icon={<Clock className="h-4 w-4 text-amber-500" />}
            items={groups.inReview}
            emptyText="Nothing under review."
            muted
          />
          <DeploymentGroup
            title="Completed"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            items={groups.done}
            emptyText="No graded items yet."
            muted
          />
        </div>
      )}
    </div>
  );
}

// ── Deployment group ──────────────────────────────────────────────────────────
function DeploymentGroup({
  title,
  icon,
  items,
  emptyText,
  muted = false,
}: {
  title: string;
  icon: ReactNode;
  items: DeploymentRow[];
  emptyText: string;
  muted?: boolean;
}) {
  if (items.length === 0 && muted) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground px-1">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {items.map((d) => (
            <DeploymentCard key={d.id} deployment={d} muted={muted} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Deployment card ───────────────────────────────────────────────────────────
function DeploymentCard({ deployment: d, muted }: { deployment: DeploymentRow; muted: boolean }) {
  const due = relativeDue(d.due_at);
  const purposeKey = (d.template_purpose ?? "generic") as OrganizerPurpose;
  const cfg = PURPOSE_CONFIG[purposeKey] ?? PURPOSE_CONFIG.generic;

  const isActionable = ["not_started", "in_progress", "returned"].includes(d.status);

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card shadow-sm transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5",
        LEFT_BORDER[due.tone],
        muted && "opacity-80",
      )}
    >
      <div className="flex items-start gap-4 p-4">
        {/* Purpose icon */}
        <div className={cn("rounded-xl p-2 flex-shrink-0 mt-0.5", cfg.bg)}>
          <cfg.Icon className={cn("h-4 w-4", cfg.text)} />
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <span className="font-semibold truncate block">
                {d.template_name ?? "Untitled template"}
              </span>
              <span className="text-xs text-muted-foreground">
                v{d.template_version}
                {d.template_purpose && (
                  <>
                    {" · "}
                    {purposeLabel[purposeKey] ?? d.template_purpose}
                  </>
                )}
              </span>
            </div>
            <span
              className={cn(
                "text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0",
                STATUS_BADGE[d.status] ?? STATUS_BADGE.not_started,
              )}
            >
              {d.status.replace(/_/g, " ")}
            </span>
          </div>

          {/* Due indicator */}
          {d.due_at && (
            <div className={cn("flex items-center gap-1 mt-2 text-xs", DUE_TONE_STYLES[due.tone])}>
              {due.tone === "overdue" ? (
                <AlertCircle className="h-3 w-3" />
              ) : (
                <CalendarRange className="h-3 w-3" />
              )}
              {due.label}
            </div>
          )}
        </div>

        {/* Action button */}
        <Button
          asChild
          size="sm"
          variant={isActionable ? "default" : "outline"}
          className="flex-shrink-0 self-center"
        >
          <Link to="/organizer/r/$deploymentId" params={{ deploymentId: d.id }}>
            {isActionable ? "Open" : "View"}
            <ArrowRight className="h-3 w-3 ml-1.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function InboxSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2].map((g) => (
        <div key={g}>
          <div className="flex items-center gap-2 mb-3">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-8 w-8 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                  <Skeleton className="h-8 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
