import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Brain,
  ChevronRight,
  Clock,
  Coins,
  FileDown,
  FlaskConical,
  HelpCircle,
  Info,
  Layers,
  ListChecks,
  Loader2,
  Paperclip,
  Play,
  Plus,
  Power,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";

import { SpreadsheetImport } from "@/components/shared/spreadsheet-import";
import { toast } from "sonner";

import { RouteErrorComponent } from "@/components/shared/route-error";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/shared/utils";

import {
  categorisationConfigsQuery,
  categorisationRulesQuery,
  categorisationStatsQuery,
  geminiConfigQuery,
  geminiUsageQuery,
  mlTrainingProgressQuery,
  trainingScheduleQuery,
  type GeminiUsagePeriod,
} from "@/lib/queries/categorisation.queries";
import {
  createCategorisationConfig,
  createCategorisationRule,
  createDocTypeFromProposal,
  deleteCategorisationRule,
  extractTextForSimulator,
  proposeNewDocType,
  reviewRulesWithGemini,
  runCategorisationNow,
  simulateCategorisation,
  simulateWithGemini,
  toggleCategorisationMaster,
  trainCategorisationModel,
  triggerGeminiBootstrap,
  updateCategorisationConfig,
  updateCategorisationRule,
  updateGeminiSettings,
  updateTrainingSchedule,
  type DocTypeProposal,
  type RuleAuditFinding,
  type TrainingSchedule,
} from "@/lib/ops/categorisation.functions";

// ── Route ──────────────────────────────────────────────────────────

type TabKey = "detection" | "simulator" | "ml" | "guide";
const VALID_TABS: TabKey[] = ["detection", "simulator", "ml", "guide"];

export const Route = createFileRoute("/admin/categorisation")({
  validateSearch: (s: Record<string, unknown>): { tab?: TabKey; type?: string } => ({
    tab: VALID_TABS.includes(s.tab as TabKey) ? (s.tab as TabKey) : "detection",
    type: typeof s.type === "string" ? s.type : undefined,
  }),
  component: () => (
    <AuthGuard allow={["admin", "super_admin"]}>
      <AppShell crumbs={[{ label: "Admin", to: "/admin" }, { label: "Auto-Categorisation" }]}>
        <CategorisationPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

// ── Page ───────────────────────────────────────────────────────────

function CategorisationPage() {
  const { tab, type: typeParam } = Route.useSearch();
  const navigate = useNavigate();
  const activeTab = tab ?? "detection";

  const { data: configs } = useQuery(categorisationConfigsQuery());
  const firstType = (configs as any[])?.[0]?.doc_type ?? "";
  const selectedType = typeParam || firstType;

  const setTab = (t: TabKey) =>
    navigate({ search: (prev: any) => ({ ...prev, tab: t }), replace: true });

  const setSelectedType = (t: string) =>
    navigate({ search: (prev: any) => ({ ...prev, type: t }), replace: true });

  const [showAddDialog, setShowAddDialog] = useState(false);
  const qc = useQueryClient();
  const createFn = useServerFn(createCategorisationConfig);
  const mCreate = useMutation({
    mutationFn: (v: Parameters<typeof createCategorisationConfig>[0]["data"]) =>
      createFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categorisation-configs"] });
      setShowAddDialog(false);
      toast.success("Document type created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-2">
      {/* Slim header */}
      <SlimHeader configs={configs ?? []} />

      {/* Top-level tab bar */}
      <div className="flex border-b">
        <TopTab
          active={activeTab === "detection"}
          onClick={() => setTab("detection")}
          icon={<ListChecks className="h-4 w-4" />}
          label="Detection Rules"
        />
        <TopTab
          active={activeTab === "simulator"}
          onClick={() => setTab("simulator")}
          icon={<FlaskConical className="h-4 w-4" />}
          label="Simulator"
        />
        <TopTab
          active={activeTab === "ml"}
          onClick={() => setTab("ml")}
          icon={<Brain className="h-4 w-4" />}
          label="ML & Gemini"
        />
        <TopTab
          active={activeTab === "guide"}
          onClick={() => setTab("guide")}
          icon={<BookOpen className="h-4 w-4" />}
          label="Detailed Guide"
        />
      </div>

      {/* Tab content */}
      {activeTab === "detection" && (
        <DetectionTab
          configs={configs ?? []}
          selectedType={selectedType}
          onSelectType={setSelectedType}
          onAddType={() => setShowAddDialog(true)}
        />
      )}
      {activeTab === "simulator" && (
        <div
          className="overflow-hidden rounded-lg border bg-background"
          style={{ height: "calc(100vh - 11rem)" }}
        >
          <div className="h-full overflow-y-auto p-4">
            <SimulatorTab />
          </div>
        </div>
      )}
      {activeTab === "ml" && (
        <div
          className="overflow-hidden rounded-lg border bg-background"
          style={{ height: "calc(100vh - 11rem)" }}
        >
          <div className="h-full overflow-y-auto p-4">
            <MlGeminiTab configs={configs ?? []} />
          </div>
        </div>
      )}
      {activeTab === "guide" && (
        <div
          className="overflow-hidden rounded-lg border bg-background"
          style={{ height: "calc(100vh - 11rem)" }}
        >
          <div className="h-full overflow-y-auto p-6">
            <GuideTab />
          </div>
        </div>
      )}

      <AddDocTypeDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSave={(v) => mCreate.mutate(v)}
        saving={mCreate.isPending}
      />
    </div>
  );
}

// ── Top-level Tab ──────────────────────────────────────────────────

function TopTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ── ML & Gemini Tab ────────────────────────────────────────────────

function badgeForCount(total: number, target: number) {
  if (total < 10)
    return { label: "Excluded", cls: "bg-red-100 text-red-700 border-red-200", bar: "bg-red-400" };
  if (total < 30)
    return {
      label: "Learning",
      cls: "bg-amber-100 text-amber-700 border-amber-200",
      bar: "bg-amber-400",
    };
  if (total < target)
    return {
      label: "Ready",
      cls: "bg-green-100 text-green-700 border-green-200",
      bar: "bg-green-500",
    };
  return {
    label: "Complete",
    cls: "bg-teal-100 text-teal-700 border-teal-200",
    bar: "bg-teal-500",
  };
}

function fmtNum(n: number) {
  return n.toLocaleString();
}

function MlGeminiTab({ configs }: { configs: any[] }) {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<GeminiUsagePeriod>("30d");
  const [confirmBootstrap, setConfirmBootstrap] = useState(false);

  const { data: progress, isLoading: loadingProgress } = useQuery(mlTrainingProgressQuery());
  const { data: usage, isLoading: loadingUsage } = useQuery(geminiUsageQuery(period));
  const { data: geminiConfig } = useQuery(geminiConfigQuery());

  const geminiEnabledByType = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const c of configs) m.set(c.doc_type, c.gemini_enabled !== false);
    return m;
  }, [configs]);

  const trainFn = useServerFn(trainCategorisationModel);
  const mTrain = useMutation({
    mutationFn: () => trainFn({ data: { includeGeminiLabelled: true } }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["ml-training-progress"] });
      toast.success(
        r?.ok
          ? `Model trained on ${r.sampleCount} samples (${r.classes} types)`
          : (r?.message ?? "Nothing to train yet"),
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bootstrapFn = useServerFn(triggerGeminiBootstrap);
  const mBootstrap = useMutation({
    mutationFn: (v: { doc_types?: string[]; limit?: number }) => bootstrapFn({ data: v }),
    onSuccess: (r: any) => {
      setConfirmBootstrap(false);
      toast.success(`Queued ${r?.queued ?? 0} document(s) for Gemini`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settingsFn = useServerFn(updateGeminiSettings);
  const mSettings = useMutation({
    mutationFn: (v: {
      doc_type: string;
      gemini_enabled?: boolean;
      gemini_sample_target?: number;
    }) => settingsFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categorisation-configs"] });
      qc.invalidateQueries({ queryKey: ["ml-training-progress"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const geminiConfigured = !!geminiConfig?.api_key_hint && geminiConfig?.is_active;
  const maxDayCalls = Math.max(1, ...(usage?.calls_by_day ?? []).map((d) => d.calls));

  return (
    <div className="flex flex-col gap-4">
      {/* Section A — Training progress */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Training progress
          </CardTitle>
          <Button size="sm" onClick={() => mTrain.mutate()} disabled={mTrain.isPending}>
            {mTrain.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Brain className="mr-1.5 h-4 w-4" />
            )}
            Train model now
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Overall */}
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">
                {progress?.types_complete ?? 0} of {progress?.types_total ?? 0} doc types fully
                trained
              </span>
              <span className="text-muted-foreground">{progress?.overall_pct_trained ?? 0}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress?.overall_pct_trained ?? 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Model last trained:{" "}
              {progress?.model_last_trained
                ? new Date(progress.model_last_trained).toLocaleString()
                : "never"}{" "}
              · {fmtNum(progress?.model_sample_count ?? 0)} samples
            </p>
          </div>

          {loadingProgress ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="flex flex-col divide-y">
              {(progress?.classes ?? []).map((c) => {
                const b = badgeForCount(c.total_count, c.sample_target);
                const enabled = geminiEnabledByType.get(c.doc_type) ?? true;
                return (
                  <div key={c.doc_type} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-[180px] flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{c.display_name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {c.country_code}
                        </Badge>
                        <Badge variant="outline" className={cn("text-[10px]", b.cls)}>
                          {b.label}
                        </Badge>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full max-w-[280px] overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full transition-all", b.bar)}
                          style={{ width: `${c.pct_trained}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.total_count} / {c.sample_target} samples · confirmed: {c.confirmed_count}{" "}
                        · gemini: {c.gemini_count}
                        {c.last_sample_at
                          ? ` · last ${new Date(c.last_sample_at).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Switch
                          checked={enabled}
                          onCheckedChange={(v) =>
                            mSettings.mutate({ doc_type: c.doc_type, gemini_enabled: v })
                          }
                        />
                        Gemini
                      </label>
                      <Input
                        type="number"
                        min={10}
                        max={500}
                        defaultValue={c.sample_target}
                        className="h-8 w-20"
                        onBlur={(e) => {
                          const val = Number(e.target.value);
                          if (val >= 10 && val <= 500 && val !== c.sample_target) {
                            mSettings.mutate({ doc_type: c.doc_type, gemini_sample_target: val });
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mBootstrap.isPending}
                        onClick={() => mBootstrap.mutate({ doc_types: [c.doc_type], limit: 100 })}
                      >
                        Bootstrap
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section B — Gemini usage & tokens */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="h-4 w-4 text-primary" />
            Gemini usage &amp; tokens
          </CardTitle>
          <Select value={period} onValueChange={(v) => setPeriod(v as GeminiUsagePeriod)}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Total calls" value={fmtNum(usage?.total_calls ?? 0)} />
            <Metric
              label="Tokens used"
              value={fmtNum((usage?.total_input_tokens ?? 0) + (usage?.total_output_tokens ?? 0))}
            />
            <Metric label="Cost (USD)" value={`$${(usage?.total_cost_usd ?? 0).toFixed(2)}`} />
            <Metric label="Error rate" value={`${Math.round((usage?.error_rate ?? 0) * 100)}%`} />
          </div>

          {/* Daily bar chart (dependency-free) */}
          {loadingUsage ? (
            <Skeleton className="h-24 w-full" />
          ) : (usage?.calls_by_day ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No Gemini calls in this period.</p>
          ) : (
            <div className="flex h-24 items-end gap-1 border-b pb-1">
              {usage!.calls_by_day.map((d) => (
                <div
                  key={d.date}
                  className="flex-1 rounded-t bg-primary/70"
                  style={{ height: `${Math.max(4, (d.calls / maxDayCalls) * 100)}%` }}
                  title={`${d.date}: ${d.calls} calls · $${d.cost_usd.toFixed(4)}`}
                />
              ))}
            </div>
          )}

          {/* Per-doc-type table */}
          {(usage?.calls_by_doc_type ?? []).length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doc type</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Avg tokens</TableHead>
                  <TableHead className="text-right">Total cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage!.calls_by_doc_type.map((r) => (
                  <TableRow key={r.doc_type}>
                    <TableCell className="font-medium">{r.doc_type}</TableCell>
                    <TableCell className="text-right">{fmtNum(r.calls)}</TableCell>
                    <TableCell className="text-right">{fmtNum(r.avg_tokens)}</TableCell>
                    <TableCell className="text-right">${r.cost_usd.toFixed(4)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Section C — Training schedule */}
      <TrainingScheduleCard />

      {/* Section D — Gemini configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4 text-primary" />
            Gemini configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!geminiConfig?.api_key_hint && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                No Gemini API key saved. Add one in{" "}
                <Link
                  to="/admin/integration"
                  search={{ tab: "gemini" }}
                  className="font-medium underline"
                >
                  Admin → Integration → Gemini
                </Link>{" "}
                to enable the fallback.
              </span>
            </div>
          )}
          {geminiConfig?.tier === "free" && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Free tier may use your data for Google model training. Switch to the paid tier for
                production use with client data.
              </span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">API key</p>
              <p className="text-sm font-medium">
                {geminiConfig?.api_key_hint ? geminiConfig.api_key_hint : "Not set"}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Model</p>
              <p className="text-sm font-medium">{geminiConfig?.model ?? "—"}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Tier</p>
              <p className="text-sm font-medium capitalize">{geminiConfig?.tier ?? "—"}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Bootstrap all unclassified</p>
              <p className="text-xs text-muted-foreground">
                Send pending / needs-review documents through Gemini to seed training data.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin/integration" search={{ tab: "gemini" }}>
                  Manage key &amp; model →
                </Link>
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmBootstrap(true)}
                disabled={mBootstrap.isPending || !geminiConfigured}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Bootstrap all
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmBootstrap} onOpenChange={setConfirmBootstrap}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bootstrap all unclassified documents?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This sends up to 100 unclassified documents to Gemini for classification. Each call
            consumes tokens
            {geminiConfig?.tier === "paid" ? " and incurs cost" : " (free tier — no charge)"}.
            Results are stored as training data for review.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBootstrap(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mBootstrap.mutate({ limit: 100 })}
              disabled={mBootstrap.isPending}
            >
              {mBootstrap.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Section E — Detection rule review */}
      <RuleReviewCard />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

// ── Propose new document type dialog ──────────────────────────────

type EditableRule = {
  id: string; // local key only
  signal_text: string;
  signal_type: "filename" | "form-code" | "keyword" | "regex";
  signal_source: "filename" | "ocr";
  weight: number;
};

function ProposeDocTypeDialog({
  proposal,
  onClose,
  onSaved,
}: {
  proposal: (DocTypeProposal & { already_exists: boolean }) | null;
  onClose: () => void;
  onSaved: (docType: string) => void;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createDocTypeFromProposal);

  const [form, setForm] = useState({
    doc_type: "",
    display_name: "",
    country_code: "ALL",
    mapped_category: "",
    min_confidence: 75,
    highlight_color: "#378ADD",
  });
  const [rules, setRules] = useState<EditableRule[]>([]);

  useEffect(() => {
    if (!proposal) return;
    setForm({
      doc_type: proposal.doc_type,
      display_name: proposal.display_name,
      country_code: proposal.country_code,
      mapped_category: proposal.mapped_category,
      min_confidence: proposal.min_confidence,
      highlight_color: proposal.highlight_color,
    });
    setRules(proposal.rules.map((r, i) => ({ ...r, id: String(i) })));
  }, [proposal]);

  const mSave = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          ...form,
          rules: rules.map(({ id: _id, ...r }) => r),
        },
      }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["categorisation-configs"] });
      qc.invalidateQueries({ queryKey: ["categorisation-rules"] });
      toast.success(
        r.created_config
          ? `Document type "${form.display_name}" created with ${r.rules_added} rules`
          : `${r.rules_added} rules added to existing type "${form.doc_type}"`,
      );
      onSaved(form.doc_type);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setRule = (id: string, key: keyof EditableRule, value: unknown) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));

  const removeRule = (id: string) => setRules((rs) => rs.filter((r) => r.id !== id));

  const addRule = () =>
    setRules((rs) => [
      ...rs,
      {
        id: String(Date.now()),
        signal_text: "",
        signal_type: "keyword",
        signal_source: "ocr",
        weight: 75,
      },
    ]);

  if (!proposal) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-600" />
            {proposal.already_exists ? "Add detection rules" : "Create new document type"}
          </DialogTitle>
          <DialogDescription>
            Gemini identified this document. Review and edit the proposed configuration and rules
            before saving.
            {proposal.already_exists && (
              <span className="ml-1 font-medium text-amber-700">
                {" "}
                "{form.doc_type}" already exists — only rules will be added.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-2">
          <div className="space-y-4 pb-2">
            {/* Config fields */}
            {!proposal.already_exists && (
              <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Doc type key (SCREAMING_SNAKE_CASE)</Label>
                  <Input
                    value={form.doc_type}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        doc_type: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
                      }))
                    }
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Display name</Label>
                  <Input
                    value={form.display_name}
                    onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Mapped category</Label>
                  <Input
                    value={form.mapped_category}
                    onChange={(e) => setForm((f) => ({ ...f, mapped_category: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Country</Label>
                  <Select
                    value={form.country_code}
                    onValueChange={(v) => setForm((f) => ({ ...f, country_code: v }))}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="US">US</SelectItem>
                      <SelectItem value="IN">IN</SelectItem>
                      <SelectItem value="ALL">ALL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Min confidence ({form.min_confidence}%)</Label>
                  <Slider
                    min={50}
                    max={99}
                    step={1}
                    value={[form.min_confidence]}
                    onValueChange={([v]) => setForm((f) => ({ ...f, min_confidence: v }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Highlight colour</Label>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-7 w-7 shrink-0 rounded border"
                      style={{ backgroundColor: form.highlight_color }}
                    />
                    <Input
                      value={form.highlight_color}
                      onChange={(e) => setForm((f) => ({ ...f, highlight_color: e.target.value }))}
                      className="font-mono text-xs"
                      maxLength={7}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Rules table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Detection rules ({rules.length})
                </Label>
                <Button type="button" variant="outline" size="sm" className="h-7" onClick={addRule}>
                  <Plus className="mr-1 h-3 w-3" /> Add rule
                </Button>
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[35%] text-xs">Signal text</TableHead>
                      <TableHead className="text-xs">Type</TableHead>
                      <TableHead className="text-xs">Source</TableHead>
                      <TableHead className="w-20 text-xs">Weight</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell className="py-1.5">
                          <Input
                            value={rule.signal_text}
                            onChange={(e) => setRule(rule.id, "signal_text", e.target.value)}
                            className="h-7 text-xs font-mono"
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Select
                            value={rule.signal_type}
                            onValueChange={(v) => setRule(rule.id, "signal_type", v)}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="filename">filename</SelectItem>
                              <SelectItem value="form-code">form-code</SelectItem>
                              <SelectItem value="keyword">keyword</SelectItem>
                              <SelectItem value="regex">regex</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Select
                            value={rule.signal_source}
                            onValueChange={(v) => setRule(rule.id, "signal_source", v)}
                          >
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="filename">filename</SelectItem>
                              <SelectItem value="ocr">ocr</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-1.5">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={rule.weight}
                            onChange={(e) => setRule(rule.id, "weight", Number(e.target.value))}
                            className="h-7 w-16 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-1.5">
                          <button
                            type="button"
                            onClick={() => removeRule(rule.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {rules.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-4 text-center text-xs text-muted-foreground"
                        >
                          No rules yet. Click "Add rule" to create one.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Gemini proposed {proposal.rules.length} rule
                {proposal.rules.length !== 1 ? "s" : ""}. Token cost:{" "}
                {proposal.input_tokens + proposal.output_tokens} tokens
                {proposal.cost_usd > 0 ? ` · $${proposal.cost_usd.toFixed(5)}` : ""}.
              </p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mSave.mutate()}
            disabled={mSave.isPending || rules.length === 0 || !form.doc_type}
          >
            {mSave.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {proposal.already_exists
              ? `Add ${rules.length} rule${rules.length !== 1 ? "s" : ""}`
              : "Create document type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Rule review card ───────────────────────────────────────────────

function RuleReviewCard() {
  const reviewFn = useServerFn(reviewRulesWithGemini);
  const [findings, setFindings] = useState<RuleAuditFinding[] | null>(null);
  const [meta, setMeta] = useState<{
    doc_types_reviewed: number;
    rules_reviewed: number;
    cost_usd: number;
  } | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setFindings(null);
    try {
      const r = await reviewFn();
      setFindings(r.findings);
      setMeta({
        doc_types_reviewed: r.doc_types_reviewed,
        rules_reviewed: r.rules_reviewed,
        cost_usd: r.cost_usd,
      });
      if (r.findings.length === 0) {
        toast.success("All detection rules look good — no issues found.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Review failed");
    } finally {
      setRunning(false);
    }
  };

  const SEVERITY_STYLE = {
    error: {
      badge: "bg-red-100 text-red-700 border-red-200",
      icon: <ShieldAlert className="h-3.5 w-3.5 text-red-600" />,
    },
    warning: {
      badge: "bg-amber-100 text-amber-700 border-amber-200",
      icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />,
    },
    info: {
      badge: "bg-blue-100 text-blue-700 border-blue-200",
      icon: <Info className="h-3.5 w-3.5 text-blue-600" />,
    },
  };

  const errors = findings?.filter((f) => f.severity === "error").length ?? 0;
  const warnings = findings?.filter((f) => f.severity === "warning").length ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-primary" />
          Detection rule review
        </CardTitle>
        <Button size="sm" variant="outline" onClick={run} disabled={running} className="gap-1.5">
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {running ? "Reviewing…" : "Review with Gemini"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!findings && !running && (
          <p className="text-sm text-muted-foreground">
            Ask Gemini to audit all your detection rules. It will flag missing signal types, overly
            generic keywords, weight inconsistencies, and potential conflicts between document
            types.
          </p>
        )}
        {running && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Gemini is reviewing your rules…
          </div>
        )}
        {findings && !running && (
          <>
            {/* Summary row */}
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                Reviewed {meta?.doc_types_reviewed} doc types · {meta?.rules_reviewed} rules
              </span>
              <Separator orientation="vertical" className="h-4" />
              {findings.length === 0 ? (
                <span className="font-medium text-green-700">✓ No issues found</span>
              ) : (
                <>
                  {errors > 0 && (
                    <span className="font-medium text-red-700">
                      {errors} error{errors !== 1 ? "s" : ""}
                    </span>
                  )}
                  {warnings > 0 && (
                    <span className="font-medium text-amber-700">
                      {warnings} warning{warnings !== 1 ? "s" : ""}
                    </span>
                  )}
                  {findings.filter((f) => f.severity === "info").length > 0 && (
                    <span className="text-muted-foreground">
                      {findings.filter((f) => f.severity === "info").length} suggestion
                      {findings.filter((f) => f.severity === "info").length !== 1 ? "s" : ""}
                    </span>
                  )}
                </>
              )}
              {meta && meta.cost_usd > 0 && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <span className="text-muted-foreground">${meta.cost_usd.toFixed(5)}</span>
                </>
              )}
            </div>

            {/* Findings list */}
            {findings.length > 0 && (
              <div className="flex flex-col divide-y rounded-md border">
                {findings.map((f, i) => {
                  const s = SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.info;
                  return (
                    <div key={i} className="flex gap-3 p-3">
                      <div className="mt-0.5 shrink-0">{s.icon}</div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground">
                            {f.doc_type}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px] capitalize", s.badge)}
                          >
                            {f.severity}
                          </Badge>
                        </div>
                        <p className="text-xs text-foreground">{f.issue}</p>
                        {f.suggestion && (
                          <p className="text-[11px] text-muted-foreground">→ {f.suggestion}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Training schedule card ─────────────────────────────────────────

type ScheduleForm = Pick<
  TrainingSchedule,
  "enabled" | "mode" | "interval_hours" | "times" | "min_gap_minutes"
>;

function TrainingScheduleCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(trainingScheduleQuery());
  const saveFn = useServerFn(updateTrainingSchedule);

  const [form, setForm] = useState<ScheduleForm | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        enabled: data.enabled,
        mode: data.mode,
        interval_hours: data.interval_hours,
        times: data.times.length ? data.times : ["02:00"],
        min_gap_minutes: data.min_gap_minutes,
      });
      setDirty(false);
    }
  }, [data]);

  const set = <K extends keyof ScheduleForm>(k: K, v: ScheduleForm[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("not loaded");
      return saveFn({ data: form });
    },
    onSuccess: () => {
      toast.success("Training schedule saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["categorisation-training-schedule"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !form) {
    return (
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  const addTime = () => set("times", [...form.times, "12:00"]);
  const removeTime = (i: number) =>
    set(
      "times",
      form.times.filter((_, idx) => idx !== i),
    );
  const setTime = (i: number, v: string) =>
    set(
      "times",
      form.times.map((t, idx) => (idx === i ? v : t)),
    );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-primary" />
          Training schedule
        </CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{form.enabled ? "On" : "Off"}</span>
          <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          The model retrains automatically on this schedule. Times are in{" "}
          <span className="font-medium">UTC</span>. A background tick runs every 15 minutes, so an
          actual run starts at the next quarter-hour after a scheduled time.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Frequency</Label>
            <Select value={form.mode} onValueChange={(v) => set("mode", v as ScheduleForm["mode"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="interval">Every N hours</SelectItem>
                <SelectItem value="times">At specific times of day</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.mode === "interval" ? (
            <div className="space-y-1.5">
              <Label className="text-sm">Run every (hours)</Label>
              <Input
                type="number"
                min={1}
                max={168}
                value={form.interval_hours}
                onChange={(e) => set("interval_hours", Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                e.g. 6 = four times a day, 24 = once a day.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-sm">Minimum gap between runs (min)</Label>
              <Input
                type="number"
                min={15}
                max={720}
                value={form.min_gap_minutes}
                onChange={(e) => set("min_gap_minutes", Number(e.target.value))}
              />
            </div>
          )}
        </div>

        {form.mode === "times" && (
          <div className="space-y-2">
            <Label className="text-sm">
              Run at these times (UTC) — add several for multiple runs a day
            </Label>
            <div className="flex flex-wrap gap-2">
              {form.times.map((t, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    type="time"
                    value={t}
                    onChange={(e) => setTime(i, e.target.value)}
                    className="h-9 w-32"
                  />
                  {form.times.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => removeTime(i)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {form.times.length < 12 && (
                <Button type="button" variant="outline" size="sm" onClick={addTime}>
                  <Plus className="mr-1 h-4 w-4" /> Add time
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Save schedule
          </Button>
          <span className="text-xs text-muted-foreground">
            Last run: {data?.last_run_at ? new Date(data.last_run_at).toLocaleString() : "never"}
            {data?.last_run_status ? ` · ${data.last_run_status}` : ""}
            {data?.last_run_summary ? ` — ${data.last_run_summary}` : ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Detection Tab ──────────────────────────────────────────────────

function DetectionTab({
  configs,
  selectedType,
  onSelectType,
  onAddType,
}: {
  configs: any[];
  selectedType: string;
  onSelectType: (t: string) => void;
  onAddType: () => void;
}) {
  const [innerTab, setInnerTab] = useState<"rules" | "settings">("rules");

  return (
    <div
      className="flex overflow-hidden rounded-lg border bg-background"
      style={{ height: "calc(100vh - 11rem)" }}
    >
      {/* Left: Document Types */}
      <div className="flex w-64 shrink-0 flex-col border-r">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Document Types
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onAddType}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {!configs.length ? (
            <div className="flex flex-col gap-1 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded" />
              ))}
            </div>
          ) : (
            configs.map((cfg: any) => (
              <DocTypeRow
                key={cfg.doc_type}
                config={cfg}
                selected={selectedType === cfg.doc_type}
                onClick={() => onSelectType(cfg.doc_type)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: boxed panel with inner tabs */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Inner tab bar */}
        <div className="flex border-b bg-muted/20 px-1">
          <PanelTab
            active={innerTab === "rules"}
            onClick={() => setInnerTab("rules")}
            icon={<ListChecks className="h-3.5 w-3.5" />}
            label="Detection Rules"
          />
          <PanelTab
            active={innerTab === "settings"}
            onClick={() => setInnerTab("settings")}
            icon={<Settings2 className="h-3.5 w-3.5" />}
            label="Doc Type Settings"
          />
        </div>

        {/* Inner tab content */}
        <div className="flex-1 overflow-y-auto p-4">
          {innerTab === "rules" && <RulesPanelContent docType={selectedType} configs={configs} />}
          {innerTab === "settings" && (
            <DocTypeSettingsSingle docType={selectedType} configs={configs} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Slim Header ────────────────────────────────────────────────────

function SlimHeader({ configs }: { configs: any[] }) {
  const qc = useQueryClient();
  const toggleFn = useServerFn(toggleCategorisationMaster);
  const runNowFn = useServerFn(runCategorisationNow);

  const { data: stats } = useQuery(categorisationStatsQuery());
  const allActive = configs.every((c: any) => c.is_active);

  const mToggle = useMutation({
    mutationFn: (on: boolean) => toggleFn({ data: { isActive: on } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categorisation-configs"] });
      toast.success("Master toggle updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mRunNow = useMutation({
    mutationFn: () => runNowFn({ data: { batchSize: 50 } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["categorisation-stats"] });
      toast.success(
        res.processed === 0
          ? "No pending documents to process"
          : `Processing ${res.processed} document${res.processed !== 1 ? "s" : ""}…`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold">Auto-Categorisation</h1>
        <QuickTipsPopover />
        {stats && stats.total > 0 && (
          <Badge
            variant="outline"
            className="gap-1 text-[10px]"
            title="Share of recent segments classified by the ML fallback"
          >
            <Brain className="h-3 w-3" />
            {stats.mlPercentage}% ML
          </Badge>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Power
            className={cn("h-3.5 w-3.5", allActive ? "text-green-600" : "text-muted-foreground")}
          />
          <Switch
            checked={allActive}
            onCheckedChange={(v) => mToggle.mutate(v)}
            disabled={mToggle.isPending || configs.length === 0}
            className="scale-90"
          />
          <span className="text-xs text-muted-foreground">{allActive ? "Active" : "Paused"}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => mRunNow.mutate()}
          disabled={mRunNow.isPending}
        >
          {mRunNow.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Play className="h-3 w-3" />
          )}
          {mRunNow.isPending ? "Processing…" : "Process Now"}
        </Button>
      </div>
    </div>
  );
}

function QuickTipsPopover() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="start" side="bottom">
        <p className="mb-1.5 font-semibold text-sm">Quick Tips</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Upload a PDF or image and the system automatically detects which document type it is (W-2,
          GST Invoice, Form 16, etc.) using filename matching, form-code detection, and keyword
          scoring.
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Detection Rules</span> — add signals
            (keywords, regex, form codes) per document type.
          </li>
          <li>
            <span className="font-medium text-foreground">Doc Type Settings</span> — set confidence
            thresholds and toggle types on/off.
          </li>
          <li>
            <span className="font-medium text-foreground">Simulator</span> — paste OCR text or
            attach a PDF to test the engine live.
          </li>
          <li>
            <span className="font-medium text-foreground">Process Now</span> — immediately classify
            all pending documents without waiting for the 60-second cron cycle.
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}

// ── Panel Tab (inner) ──────────────────────────────────────────────

function PanelTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Doc Type Row (left panel) ──────────────────────────────────────

function DocTypeRow({
  config,
  selected,
  onClick,
}: {
  config: any;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
        selected ? "bg-primary/10 text-primary" : "hover:bg-muted/60 text-foreground",
      )}
    >
      <div
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: config.highlight_color }}
      />
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{config.display_name}</span>
      <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0">
        {config.country_code}
      </Badge>
      {!config.is_active && (
        <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
      )}
    </button>
  );
}

// ── Detection Rules Panel ──────────────────────────────────────────

function RulesPanelContent({ docType, configs }: { docType: string; configs: any[] }) {
  const selectedConfig = configs.find((c: any) => c.doc_type === docType);

  if (!docType) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a document type on the left to view its detection rules.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {selectedConfig && (
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: selectedConfig.highlight_color }}
          />
          <span className="text-sm font-medium">{selectedConfig.display_name}</span>
          <Badge variant="outline" className="text-xs">
            {selectedConfig.country_code}
          </Badge>
        </div>
      )}
      <RulesTable docType={docType} />
    </div>
  );
}

// ── Doc Type Settings (single selected type) ───────────────────────

function DocTypeSettingsSingle({ docType, configs }: { docType: string; configs: any[] }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateCategorisationConfig);

  const mUpdate = useMutation({
    mutationFn: (v: { docType: string; patch: Record<string, unknown> }) => updateFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categorisation-configs"] });
      toast.success("Config updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const config = configs.find((c: any) => c.doc_type === docType);

  if (!docType || !config) {
    return (
      <p className="text-sm text-muted-foreground">
        Select a document type on the left to configure its settings.
      </p>
    );
  }

  return (
    <DocTypeSettingsForm
      config={config}
      onUpdate={(patch) => mUpdate.mutate({ docType: config.doc_type, patch })}
      saving={mUpdate.isPending}
    />
  );
}

function DocTypeSettingsForm({
  config,
  onUpdate,
  saving,
}: {
  config: any;
  onUpdate: (patch: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [confidence, setConfidence] = useState<number>(config.min_confidence);
  useEffect(() => setConfidence(config.min_confidence), [config.min_confidence]);

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 rounded-full" style={{ backgroundColor: config.highlight_color }} />
        <span className="font-medium">{config.display_name}</span>
        <Badge variant="outline" className="text-xs">
          {config.country_code}
        </Badge>
      </div>

      {/* On / Off */}
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Activation
        </p>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Enable document type</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              When off, this type is skipped during categorisation.
            </p>
          </div>
          <Switch
            checked={config.is_active}
            onCheckedChange={(v) => onUpdate({ is_active: v })}
            disabled={saving}
          />
        </div>
      </div>

      {/* Confidence Level */}
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Confidence Level
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Minimum confidence</Label>
            <span className="text-sm font-semibold tabular-nums">{confidence}%</span>
          </div>
          <Slider
            value={[confidence]}
            min={50}
            max={99}
            step={1}
            onValueChange={([v]) => setConfidence(v)}
            onValueCommit={([v]) => onUpdate({ min_confidence: v })}
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">
            Documents below this threshold are flagged for manual review.
          </p>
        </div>
      </div>

      {/* Auto Post & Multi Segment */}
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Behaviour
        </p>
        <div className="flex items-center justify-between py-1">
          <div>
            <Label className="text-sm font-medium">Auto-post to ledger</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Automatically post journal entries when categorised.
            </p>
          </div>
          <Switch checked={false} disabled />
        </div>
        <div className="border-t" />
        <div className="flex items-center justify-between py-1">
          <div>
            <Label className="text-sm font-medium">Multi-segment detection</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Allow a single document to match across multiple segments.
            </p>
          </div>
          <Switch
            checked={config.allow_multi_segment}
            onCheckedChange={(v) => onUpdate({ allow_multi_segment: v })}
            disabled={saving}
          />
        </div>
      </div>
    </div>
  );
}

// ── Add Document Type Dialog ───────────────────────────────────────

const COUNTRY_OPTIONS = [
  { value: "IN", label: "India (IN)" },
  { value: "US", label: "United States (US)" },
  { value: "ALL", label: "Universal (ALL)" },
  { value: "UK", label: "United Kingdom (UK)" },
  { value: "AU", label: "Australia (AU)" },
];

const PRESET_COLORS = [
  "#185FA5",
  "#0F6E56",
  "#854F0B",
  "#534AB7",
  "#993C1D",
  "#3B6D11",
  "#888780",
  "#D85A30",
  "#1D9E75",
  "#6366F1",
  "#E11D48",
  "#0891B2",
];

function AddDocTypeDialog({
  open,
  onClose,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (v: any) => void;
  saving: boolean;
}) {
  const [docType, setDocType] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [mappedCategory, setMappedCategory] = useState("");
  const [countryCode, setCountryCode] = useState("ALL");
  const [minConfidence, setMinConfidence] = useState(75);
  const [allowMulti, setAllowMulti] = useState(false);
  const [color, setColor] = useState("#378ADD");
  const [colorInput, setColorInput] = useState("#378ADD");

  useEffect(() => {
    if (open) {
      setDocType("");
      setDisplayName("");
      setMappedCategory("");
      setCountryCode("ALL");
      setMinConfidence(75);
      setAllowMulti(false);
      setColor("#378ADD");
      setColorInput("#378ADD");
    }
  }, [open]);

  const docTypeFormatted = docType.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const isValid =
    docTypeFormatted.length > 0 &&
    displayName.trim().length > 0 &&
    mappedCategory.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Document Type</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">
                Internal Key <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. FORM_15CA"
                value={docType}
                onChange={(e) =>
                  setDocType(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))
                }
                className="font-mono text-sm"
              />
              {docTypeFormatted && (
                <span className="text-[10px] text-muted-foreground">
                  Stored as: <code>{docTypeFormatted}</code>
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">
                Country <span className="text-destructive">*</span>
              </Label>
              <Select value={countryCode} onValueChange={setCountryCode}>
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">
              Display Name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="e.g. Form 15CA (Foreign Remittance)"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">
              Mapped Category <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="e.g. Foreign Remittance"
              value={mappedCategory}
              onChange={(e) => setMappedCategory(e.target.value)}
            />
            <span className="text-[10px] text-muted-foreground">
              The accounting category this document type maps to by default.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Min Confidence: {minConfidence}%</Label>
            <Slider
              value={[minConfidence]}
              min={50}
              max={99}
              step={1}
              onValueChange={([v]) => setMinConfidence(v)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs">Allow multi-segment detection</Label>
            <Switch checked={allowMulti} onCheckedChange={setAllowMulti} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Badge Colour</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition-all",
                    color === c ? "scale-110 border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => {
                    setColor(c);
                    setColorInput(c);
                  }}
                />
              ))}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-7 w-7 rounded border" style={{ backgroundColor: colorInput }} />
              <Input
                value={colorInput}
                onChange={(e) => {
                  setColorInput(e.target.value);
                  if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) setColor(e.target.value);
                }}
                placeholder="#378ADD"
                className="h-7 w-28 font-mono text-xs"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSave({
                doc_type: docTypeFormatted,
                display_name: displayName.trim(),
                mapped_category: mappedCategory.trim(),
                country_code: countryCode,
                min_confidence: minConfidence,
                allow_multi_segment: allowMulti,
                highlight_color: color,
              })
            }
            disabled={!isValid || saving}
          >
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Create Document Type
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Rules Table ────────────────────────────────────────────────────

type RuleImportRow = {
  signal_text: string;
  signal_type: string;
  signal_source: string;
  weight: string;
};

function emptyRuleImportRow(): RuleImportRow {
  return { signal_text: "", signal_type: "keyword", signal_source: "ocr", weight: "70" };
}

function validateRuleImportRow(row: RuleImportRow): string[] {
  const errs: string[] = [];
  if (!row.signal_text.trim()) errs.push("Signal text is required");
  if (!["filename", "form-code", "keyword", "regex"].includes(row.signal_type))
    errs.push("Type must be filename, form-code, keyword, or regex");
  if (!["filename", "ocr"].includes(row.signal_source)) errs.push("Source must be filename or ocr");
  const w = Number(row.weight);
  if (isNaN(w) || w < 0 || w > 100) errs.push("Weight must be 0–100");
  return errs;
}

const RULE_IMPORT_COLUMNS: import("@/components/shared/spreadsheet-import").ImportColumn<RuleImportRow>[] =
  [
    {
      key: "signal_text",
      label: "Signal Text",
      required: true,
      type: "text",
      placeholder: "e.g. GSTIN, Form 16, W-2",
      width: 240,
    },
    {
      key: "signal_type",
      label: "Type",
      required: true,
      type: "select",
      width: 130,
      options: [
        { value: "keyword", label: "keyword" },
        { value: "form-code", label: "form-code" },
        { value: "filename", label: "filename" },
        { value: "regex", label: "regex" },
      ],
    },
    {
      key: "signal_source",
      label: "Source",
      required: true,
      type: "select",
      width: 110,
      options: [
        { value: "ocr", label: "ocr" },
        { value: "filename", label: "filename" },
      ],
    },
    {
      key: "weight",
      label: "Weight (0–100)",
      required: true,
      type: "number",
      placeholder: "70",
      width: 130,
      parse: (raw) => String(Math.min(100, Math.max(0, Number(raw) || 70))),
      format: (v) => String(v),
    },
  ];

function downloadRuleTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["Signal Text", "Type", "Source", "Weight (0–100)"],
    ["GSTIN", "keyword", "ocr", "80"],
    ["gst_invoice_", "filename", "filename", "90"],
    ["Form 16", "form-code", "ocr", "95"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Detection Rules");
  XLSX.writeFile(wb, "detection_rules_template.xlsx");
}

async function parseRuleFile(file: File): Promise<RuleImportRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  if (aoa.length < 2) return [];

  const headerRow = (aoa[0] as string[]).map((h) =>
    String(h)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, "_"),
  );

  const colIndex = (aliases: string[]) =>
    aliases.map((a) => headerRow.indexOf(a)).find((i) => i >= 0) ?? -1;

  const textIdx = colIndex(["signal_text", "signal", "text", "keyword"]);
  const typeIdx = colIndex(["signal_type", "type"]);
  const srcIdx = colIndex(["signal_source", "source"]);
  const wtIdx = colIndex(["weight_0_100_", "weight", "score"]);

  return (aoa.slice(1) as unknown[][])
    .filter((row) => row.some((c) => String(c).trim()))
    .map((row) => ({
      signal_text: textIdx >= 0 ? String(row[textIdx] ?? "").trim() : "",
      signal_type: typeIdx >= 0 ? String(row[typeIdx] ?? "keyword").trim() : "keyword",
      signal_source: srcIdx >= 0 ? String(row[srcIdx] ?? "ocr").trim() : "ocr",
      weight: wtIdx >= 0 ? String(row[wtIdx] ?? "70").trim() : "70",
    }));
}

function ImportRulesDialog({
  open,
  onClose,
  docType,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  docType: string;
  onDone: () => void;
}) {
  const createFn = useServerFn(createCategorisationRule);
  const [importKey, setImportKey] = useState(0);

  const handleImport = useCallback(
    async (rows: RuleImportRow[]) => {
      let created = 0;
      for (const row of rows) {
        await createFn({
          data: {
            doc_type: docType,
            signal_text: row.signal_text.trim(),
            signal_type: row.signal_type as any,
            signal_source: row.signal_source as any,
            weight: Number(row.weight),
          },
        });
        created++;
      }
      toast.success(`${created} rule${created !== 1 ? "s" : ""} imported`);
      setImportKey((k) => k + 1);
      onDone();
      onClose();
    },
    [createFn, docType, onDone, onClose],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Detection Rules</DialogTitle>
        </DialogHeader>
        <div className="py-1">
          <SpreadsheetImport<RuleImportRow>
            key={importKey}
            columns={RULE_IMPORT_COLUMNS}
            emptyRow={emptyRuleImportRow}
            validateRow={validateRuleImportRow}
            onImport={handleImport}
            onDownloadTemplate={downloadRuleTemplate}
            onParseFile={parseRuleFile}
            initialBlankRows={6}
            importLabel={(n) => `Import ${n} rule${n !== 1 ? "s" : ""}`}
            hint={
              <span>
                Paste rows directly from Excel, upload an .xlsx/.csv file, or type manually.
                Download the template for the correct column order.
              </span>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Editable Rule Row ──────────────────────────────────────────────

function RuleRow({
  rule,
  onUpdate,
  onDelete,
}: {
  rule: any;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [signalText, setSignalText] = useState<string>(rule.signal_text);
  const [weight, setWeight] = useState<number>(rule.weight);

  useEffect(() => setSignalText(rule.signal_text), [rule.signal_text]);
  useEffect(() => setWeight(rule.weight), [rule.weight]);

  const SIGNAL_TYPE_BADGE: Record<string, string> = {
    filename: "bg-blue-100 text-blue-800",
    "form-code": "bg-green-100 text-green-800",
    keyword: "bg-amber-100 text-amber-800",
    regex: "bg-purple-100 text-purple-800",
  };

  return (
    <TableRow>
      <TableCell className="py-1 min-w-[200px]">
        <Input
          value={signalText}
          onChange={(e) => setSignalText(e.target.value)}
          onBlur={() => {
            if (signalText.trim() !== rule.signal_text)
              onUpdate({ signal_text: signalText.trim() });
          }}
          placeholder="Signal text"
          className="h-7 text-xs"
        />
      </TableCell>
      <TableCell className="py-1 w-32">
        <Select value={rule.signal_type} onValueChange={(v) => onUpdate({ signal_type: v })}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["filename", "form-code", "keyword", "regex"].map((t) => (
              <SelectItem key={t} value={t}>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    SIGNAL_TYPE_BADGE[t],
                  )}
                >
                  {t}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-1 w-28">
        <Select value={rule.signal_source} onValueChange={(v) => onUpdate({ signal_source: v })}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ocr">ocr</SelectItem>
            <SelectItem value="filename">filename</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-1 w-36">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={weight}
            min={0}
            max={100}
            onChange={(e) => setWeight(Math.min(100, Math.max(0, +e.target.value)))}
            onBlur={() => {
              if (weight !== rule.weight) onUpdate({ weight });
            }}
            className="h-7 w-16 text-xs tabular-nums"
          />
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${weight}%` }}
            />
          </div>
        </div>
      </TableCell>
      <TableCell className="py-1 w-16">
        <Switch checked={rule.is_active} onCheckedChange={(v) => onUpdate({ is_active: v })} />
      </TableCell>
      <TableCell className="py-1 w-10">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function RulesTable({ docType }: { docType: string }) {
  const { data: rules, isLoading } = useQuery(categorisationRulesQuery(docType));
  const qc = useQueryClient();

  const updateFn = useServerFn(updateCategorisationRule);
  const createFn = useServerFn(createCategorisationRule);
  const deleteFn = useServerFn(deleteCategorisationRule);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["categorisation-rules", docType] });

  const mUpdate = useMutation({
    mutationFn: (v: { id: string; patch: Record<string, unknown> }) => updateFn({ data: v }),
    onSuccess: () => {
      invalidate();
      toast.success("Rule saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mDelete = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Rule deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [adding, setAdding] = useState(false);
  const [newSignal, setNewSignal] = useState("");
  const [newType, setNewType] = useState<string>("keyword");
  const [newSource, setNewSource] = useState<string>("ocr");
  const [newWeight, setNewWeight] = useState(70);
  const [showImport, setShowImport] = useState(false);

  const mCreate = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          doc_type: docType,
          signal_text: newSignal,
          signal_type: newType as any,
          signal_source: newSource as any,
          weight: newWeight,
        },
      }),
    onSuccess: () => {
      invalidate();
      setAdding(false);
      setNewSignal("");
      setNewWeight(70);
      toast.success("Rule added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Signal Text</TableHead>
                <TableHead className="w-32">Type</TableHead>
                <TableHead className="w-28">Source</TableHead>
                <TableHead className="w-36">Weight</TableHead>
                <TableHead className="w-16">Active</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rules ?? []).map((rule: any) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  onUpdate={(patch) => mUpdate.mutate({ id: rule.id, patch })}
                  onDelete={() => mDelete.mutate(rule.id)}
                />
              ))}

              {adding && (
                <TableRow>
                  <TableCell className="py-1">
                    <Input
                      autoFocus
                      value={newSignal}
                      onChange={(e) => setNewSignal(e.target.value)}
                      placeholder="Signal text"
                      className="h-7 text-xs"
                    />
                  </TableCell>
                  <TableCell className="py-1">
                    <Select value={newType} onValueChange={setNewType}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="filename">filename</SelectItem>
                        <SelectItem value="form-code">form-code</SelectItem>
                        <SelectItem value="keyword">keyword</SelectItem>
                        <SelectItem value="regex">regex</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="py-1">
                    <Select value={newSource} onValueChange={setNewSource}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="filename">filename</SelectItem>
                        <SelectItem value="ocr">ocr</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="py-1">
                    <Input
                      type="number"
                      value={newWeight}
                      min={0}
                      max={100}
                      onChange={(e) => setNewWeight(+e.target.value)}
                      className="h-7 w-16 text-xs"
                    />
                  </TableCell>
                  <TableCell colSpan={2} className="py-1">
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => mCreate.mutate()}
                        disabled={!newSignal.trim() || mCreate.isPending}
                      >
                        {mCreate.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setAdding(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {(rules ?? []).length === 0 && !adding && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                    No rules yet. Add a signal or import from a spreadsheet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center gap-2">
          {!adding && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setAdding(true)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Signal
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowImport(true)}
          >
            <Upload className="mr-1 h-3.5 w-3.5" />
            Import Rules
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={downloadRuleTemplate}
          >
            <FileDown className="mr-1 h-3.5 w-3.5" />
            Template
          </Button>
        </div>
      </div>

      <ImportRulesDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        docType={docType}
        onDone={invalidate}
      />
    </>
  );
}

// ── Simulator Tab ──────────────────────────────────────────────────

function SimulatorTab() {
  const [filename, setFilename] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const simulateFn = useServerFn(simulateCategorisation);
  const extractFn = useServerFn(extractTextForSimulator);
  const simulateGeminiFn = useServerFn(simulateWithGemini);
  const proposeFn = useServerFn(proposeNewDocType);

  const [results, setResults] = useState<any>(null);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [geminiResult, setGeminiResult] = useState<any>(null);
  const [geminiRunning, setGeminiRunning] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<(DocTypeProposal & { already_exists: boolean }) | null>(
    null,
  );

  const runSimulation = useCallback(
    (fn: string, text: string) => {
      if (!fn && !text) {
        setResults(null);
        return;
      }
      simulateFn({ data: { filename: fn, ocrText: text } })
        .then((r) => setResults(r))
        .catch(() => setResults(null));
    },
    [simulateFn],
  );

  useEffect(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const t = setTimeout(() => runSimulation(filename, ocrText), 300);
    setDebounceTimer(t);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filename, ocrText]);

  const handleFileAttach = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf") {
        toast.error("Only PDF files are supported for text extraction in Phase 1");
        return;
      }
      setAttachedFile(file);
      setFilename(file.name);
      setExtracting(true);
      setOcrText("");
      setResults(null);

      try {
        const buffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ""),
        );
        const result = (await extractFn({
          data: {
            base64Content: base64,
            filename: file.name,
            mimeType: file.type,
          },
        })) as any;

        if (result.status === "ok" && result.fullText) {
          setOcrText(result.fullText);
          toast.success(
            `Text extracted — ${result.totalPages} page${result.totalPages !== 1 ? "s" : ""}`,
          );
        } else if (result.status === "scan_deferred") {
          toast.warning(
            "This PDF has no text layer (scanned image). Paste OCR text manually or try a different file.",
          );
        } else {
          toast.error(result.errorMessage ?? "Extraction failed");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Extraction failed");
      } finally {
        setExtracting(false);
      }
    },
    [extractFn],
  );

  const clearFile = () => {
    setAttachedFile(null);
    setFilename("");
    setOcrText("");
    setResults(null);
    setGeminiResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runGemini = async () => {
    if (!ocrText) return;
    setGeminiRunning(true);
    setGeminiResult(null);
    try {
      const r = await simulateGeminiFn({ data: { ocrText, filename } });
      setGeminiResult(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gemini error");
    } finally {
      setGeminiRunning(false);
    }
  };

  const runPropose = async () => {
    if (!ocrText) return;
    setProposing(true);
    setProposal(null);
    try {
      const r = await proposeFn({ data: { ocrText, filename } });
      setProposal(r as DocTypeProposal & { already_exists: boolean });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Proposal failed");
    } finally {
      setProposing(false);
    }
  };

  const { data: configs } = useQuery(categorisationConfigsQuery());
  const configMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of configs ?? []) m.set((c as any).doc_type, c);
    return m;
  }, [configs]);

  const top = results?.results?.[0];
  const topConfig = top?.doc_type ? configMap.get(top.doc_type) : null;
  const threshold = topConfig?.min_confidence ?? 75;

  const confidenceColor =
    !top || top.confidence_score === 0
      ? "text-muted-foreground"
      : top.confidence_score >= threshold
        ? "text-green-600"
        : top.confidence_score >= threshold - 10
          ? "text-amber-600"
          : "text-red-600";

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          {/* File attachment zone */}
          <div
            className={cn(
              "relative flex items-center justify-center rounded-lg border-2 border-dashed p-5 transition-colors",
              attachedFile
                ? "border-primary/40 bg-primary/5"
                : "cursor-pointer border-muted-foreground/25 hover:border-primary/40 hover:bg-muted/40",
            )}
            onClick={() => !attachedFile && fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleFileAttach(file);
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileAttach(file);
              }}
            />

            {extracting ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting text…
              </div>
            ) : attachedFile ? (
              <div className="flex w-full items-center gap-3">
                <Paperclip className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{attachedFile.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {(attachedFile.size / 1024).toFixed(0)} KB
                    {ocrText ? ` · ${ocrText.split(/\s+/).length} words extracted` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  className="shrink-0 rounded p-1 hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 text-center">
                <Paperclip className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drop a PDF here or <span className="text-primary underline">click to browse</span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Text-layer PDFs only · max 20 MB
                </p>
              </div>
            )}
          </div>

          <div>
            <Label className="text-sm">Filename</Label>
            <Input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="e.g. gst_invoice_tata.pdf"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label className="text-sm">OCR Text</Label>
              {ocrText && (
                <span className="text-[10px] text-muted-foreground">
                  {ocrText.split(/\s+/).length} words
                </span>
              )}
            </div>
            <Textarea
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
              placeholder="Paste extracted text here, or attach a PDF above to auto-extract…"
              rows={10}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {/* Rules / ML result */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Rules &amp; ML result</CardTitle>
            </CardHeader>
            <CardContent>
              {!top ? (
                <p className="text-sm text-muted-foreground">
                  Attach a PDF or paste OCR text to test detection.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    {topConfig && (
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: topConfig.highlight_color }}
                      />
                    )}
                    <span className="text-lg font-semibold">
                      {topConfig?.display_name ?? top.doc_type ?? "Unclassified"}
                    </span>
                    <span className={cn("text-2xl font-bold", confidenceColor)}>
                      {top.confidence_score}%
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{top.detection_method}</Badge>
                    {top.status === "needs_review" && (
                      <Badge variant="destructive">Needs Review</Badge>
                    )}
                    {top.status === "auto" && (
                      <Badge className="bg-blue-100 text-blue-800">Auto</Badge>
                    )}
                  </div>

                  {top.signals_matched && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Signals Matched
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {(JSON.parse(top.signals_matched) as string[]).map((s, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {top.runner_up_type && (
                    <div className="rounded-md border border-dashed p-2">
                      <p className="text-xs text-muted-foreground">
                        Runner-up:{" "}
                        <span className="font-medium">
                          {configMap.get(top.runner_up_type)?.display_name ?? top.runner_up_type}
                        </span>{" "}
                        ({top.runner_up_score}%)
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Gemini result */}
          <Card className={cn("border-purple-200", geminiResult && "bg-purple-50/30")}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Sparkles className="h-4 w-4 text-purple-600" />
                Gemini result
              </CardTitle>
              <div className="flex items-center gap-2">
                {/* Propose detection rules — visible whenever there's text */}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
                  onClick={runPropose}
                  disabled={!ocrText || proposing || geminiRunning}
                  title="Ask Gemini to identify this document and generate detection rules you can save"
                >
                  {proposing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  {proposing ? "Generating rules…" : "Propose detection rules"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50"
                  onClick={runGemini}
                  disabled={!ocrText || geminiRunning || proposing}
                  title={
                    !ocrText ? "Paste or extract text first" : "Ask Gemini to classify this text"
                  }
                >
                  {geminiRunning ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {geminiRunning ? "Asking Gemini…" : "Try with Gemini"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!geminiResult && !geminiRunning && (
                <p className="text-xs text-muted-foreground">
                  Click "Try with Gemini" to classify this text with the AI model (no DB write).
                </p>
              )}
              {geminiRunning && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending to Gemini…
                </div>
              )}
              {geminiResult && !geminiRunning && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    {geminiResult.doc_type && configMap.get(geminiResult.doc_type) && (
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{
                          backgroundColor: configMap.get(geminiResult.doc_type)?.highlight_color,
                        }}
                      />
                    )}
                    <span className="text-lg font-semibold">
                      {geminiResult.display_name ?? geminiResult.doc_type ?? "Unclassified"}
                    </span>
                    <span
                      className={cn(
                        "text-2xl font-bold",
                        geminiResult.confidence >= 80
                          ? "text-green-600"
                          : geminiResult.confidence >= 60
                            ? "text-amber-600"
                            : "text-red-600",
                      )}
                    >
                      {geminiResult.confidence}%
                    </span>
                  </div>

                  {geminiResult.mapped_category && (
                    <p className="text-xs text-muted-foreground">
                      Category: {geminiResult.mapped_category}
                    </p>
                  )}

                  {geminiResult.reasoning && (
                    <p className="rounded-md bg-purple-50 px-2 py-1.5 text-[11px] text-purple-700 border border-purple-100">
                      {geminiResult.reasoning}
                    </p>
                  )}

                  {geminiResult.extracted_fields &&
                    Object.keys(geminiResult.extracted_fields).length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                          Extracted fields
                        </p>
                        <div className="grid gap-1 rounded-md border p-2 text-xs">
                          {Object.entries(geminiResult.extracted_fields).map(([k, v]) => (
                            <div key={k} className="flex gap-2">
                              <span className="shrink-0 font-medium text-foreground">{k}:</span>
                              <span className="text-muted-foreground">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  <p className="text-[10px] text-muted-foreground">
                    {geminiResult.input_tokens + geminiResult.output_tokens} tokens ·{" "}
                    {geminiResult.model}
                    {geminiResult.cost_usd > 0 && ` · $${geminiResult.cost_usd.toFixed(5)}`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Proposal dialog — rendered when runPropose() returns a result */}
      {proposal && (
        <ProposeDocTypeDialog
          proposal={proposal}
          onClose={() => setProposal(null)}
          onSaved={(docType) => {
            setProposal(null);
            toast.success(`"${docType}" is ready — switch to Detection Rules to test it.`);
          }}
        />
      )}
    </>
  );
}

// ── Guide Tab ──────────────────────────────────────────────────────

function GuideSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
          {icon}
        </div>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="ml-9 flex flex-col gap-2 text-sm text-muted-foreground leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function GuideStep({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground mt-0.5">
        {step}
      </div>
      <div>
        <span className="font-medium text-foreground">{title}</span>
        <span className="text-muted-foreground"> — {description}</span>
      </div>
    </div>
  );
}

function GuideTab() {
  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <h1 className="text-base font-semibold">Auto-Categorisation Guide</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The auto-categorisation engine analyses uploaded documents and assigns them a document
          type (e.g. GST Invoice, Form 16, Bank Statement) using a scoring pipeline. This guide
          explains each component and how to configure it.
        </p>
      </div>

      <GuideSection icon={<Layers className="h-4 w-4" />} title="How the engine works">
        <p>
          When a document is uploaded, the engine runs it through four detection methods in priority
          order. The method with the highest confidence score wins.
        </p>
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          {[
            {
              label: "Filename match",
              detail:
                "Checks the file name against filename-type signals. Fast and high-confidence when filenames follow naming conventions.",
            },
            {
              label: "Form-code detection",
              detail:
                'Looks for government or industry form codes (e.g. "Form 16", "GSTR-1") in the first page of OCR text.',
            },
            {
              label: "Keyword scoring",
              detail:
                "Accumulates weighted keyword matches across the full OCR text. Multiple keywords increase the final score.",
            },
            {
              label: "Regex matching",
              detail:
                "Uses regular expressions to find structured patterns (e.g. PAN numbers, GSTIN format) in the OCR text.",
            },
            {
              label: "ML fallback (Layer 4)",
              detail:
                "When the rules above are cold or ambiguous, a self-trained classifier — and, as a last resort, Gemini — takes over. See the “Machine learning” and “Gemini” sections below.",
            },
          ].map((m, i) => (
            <div key={i} className="flex items-start gap-2">
              <ChevronRight className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <div>
                <span className="font-medium text-foreground">{m.label}</span>
                <span className="text-muted-foreground"> — {m.detail}</span>
              </div>
            </div>
          ))}
        </div>
        <p>
          If the winning score exceeds the document type's minimum confidence threshold, the
          document is auto-classified. Below that threshold it is flagged for manual review.
        </p>
      </GuideSection>

      <GuideSection icon={<ListChecks className="h-4 w-4" />} title="Detection Rules">
        <p>
          Detection rules are the signals that teach the engine how to recognise each document type.
          Each rule has four properties:
        </p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2 text-left font-semibold">Property</th>
                <th className="px-3 py-2 text-left font-semibold">Options</th>
                <th className="px-3 py-2 text-left font-semibold">Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                {
                  prop: "Signal Text",
                  opts: "Any text / regex",
                  desc: "The string or pattern to match. Comma-separate multiple values.",
                },
                {
                  prop: "Type",
                  opts: "filename · form-code · keyword · regex",
                  desc: "Determines which pipeline stage uses this rule.",
                },
                {
                  prop: "Source",
                  opts: "filename · ocr",
                  desc: "Whether to match against the file name or extracted OCR text.",
                },
                {
                  prop: "Weight",
                  opts: "0 – 100",
                  desc: "Contribution to the confidence score. Higher = stronger signal.",
                },
              ].map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                    {r.prop}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.opts}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="text-xs">
            Deactivating a rule (toggle off) retains it in the database but excludes it from
            scoring. Deleting removes it permanently.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="font-medium text-foreground">Tips for effective rules</p>
          <GuideStep
            step={1}
            title="Start with form codes"
            description="They're the most reliable signal when a document contains a government reference number or form name."
          />
          <GuideStep
            step={2}
            title="Add 3–5 unique keywords"
            description="Choose terms that appear in that document type but rarely in others. Avoid generic words like 'invoice' or 'total'."
          />
          <GuideStep
            step={3}
            title="Use filename rules for known sources"
            description="If your firm receives payslips named 'payslip_*.pdf', a filename rule with weight 90+ will catch these instantly."
          />
          <GuideStep
            step={4}
            title="Use the Simulator to test"
            description="After adding rules, switch to the Simulator tab and upload a real example to verify the score."
          />
        </div>
      </GuideSection>

      <GuideSection icon={<Settings2 className="h-4 w-4" />} title="Doc Type Settings">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">Confidence Level (minimum threshold)</p>
            <p>
              The minimum score (50–99%) a document must reach to be auto-classified as this type.
              Documents below this value are placed in "Needs Review". Start at 75% and lower only
              if you're getting too many false negatives.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">On / Off</p>
            <p>
              Disabling a document type means the engine will never classify a document as that
              type, even if rules match. Use this to temporarily disable a type during rule tuning
              without deleting anything.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">Auto-post to ledger</p>
            <p>
              When enabled (coming soon), classifying a document will automatically create a draft
              journal entry using the type's mapped accounting category. Currently disabled pending
              GL mapping setup.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">Multi-segment detection</p>
            <p>
              Some documents span multiple logical sections (e.g. a combined statement with bank +
              credit card pages). Enabling this allows the engine to assign the same type to
              multiple page ranges within a single file.
            </p>
          </div>
        </div>
      </GuideSection>

      <GuideSection icon={<FlaskConical className="h-4 w-4" />} title="Simulator">
        <p>
          The Simulator lets you test the detection engine against a real document without it being
          permanently classified in the system.
        </p>
        <div className="flex flex-col gap-1.5">
          <GuideStep
            step={1}
            title="Attach a PDF"
            description="Drop a text-layer PDF into the upload zone. The system extracts OCR text automatically."
          />
          <GuideStep
            step={2}
            title="Or paste OCR text"
            description="Copy text from any source and paste it into the OCR Text box. Results update in real time."
          />
          <GuideStep
            step={3}
            title="Read the result"
            description="The right panel shows the matched type, confidence score, detection method, and which signals contributed."
          />
          <GuideStep
            step={4}
            title="Iterate"
            description="If the wrong type wins or confidence is low, add more specific rules in the Detection Rules tab and re-test."
          />
        </div>
        <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-blue-800">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="text-xs">
            Scanned PDFs (image-only, no text layer) cannot be extracted automatically. Use an
            external OCR tool and paste the result into the OCR Text box.
          </p>
        </div>
      </GuideSection>

      <GuideSection icon={<Play className="h-4 w-4" />} title="Process Now & cron schedule">
        <p>
          The engine runs automatically on a 60-second cron cycle, processing all documents in{" "}
          <code className="rounded bg-muted px-1 text-xs">pending</code> status. Use the{" "}
          <strong>Process Now</strong> button in the header to trigger an immediate batch of up to
          50 documents without waiting for the next cycle.
        </p>
        <p>
          The master On/Off toggle in the header enables or disables all document types at once.
          Individual types can be toggled independently in Doc Type Settings.
        </p>
      </GuideSection>

      <GuideSection
        icon={<Brain className="h-4 w-4" />}
        title="Machine learning fallback (Layer 4)"
      >
        <p>
          After the four rule-based methods, a local{" "}
          <span className="font-medium text-foreground">Naive Bayes / TF-IDF</span> classifier acts
          as a safety net. It runs <strong>only</strong> when the rules are cold (nothing scored ≥
          60) or ambiguous (the top two types are within 10 points), and it can only replace a weak
          rule result — never a confident one. Documents the rules already handle well are never
          touched, so there is no regression.
        </p>
        <p>
          The model trains on your own data: every time someone <strong>confirms</strong> or{" "}
          <strong>overrides</strong> a classification, that document becomes a labelled training
          example. Its confidence is deliberately conservative, so borderline ML guesses still land
          in “Needs Review”. Matches made this way are tagged with the{" "}
          <code className="rounded bg-muted px-1 text-xs">ml</code> detection method, and the header
          shows the share of recent documents classified by ML.
        </p>
        <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 p-3 text-blue-800">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="text-xs">
            Until a document type has at least ~30 confirmed examples it stays out of the model, so
            the ML layer simply does nothing until there is enough data — it never guesses blindly.
          </p>
        </div>
      </GuideSection>

      <GuideSection
        icon={<Sparkles className="h-4 w-4" />}
        title="Gemini bootstrap & token tracking"
      >
        <p>
          Gemini 2.5 Flash solves the cold-start problem. When the rules are cold and the local
          model is not ready yet, Gemini classifies the document from its extracted text and stores
          the answer as labelled training data (status{" "}
          <code className="rounded bg-muted px-1 text-xs">gemini_labelled</code>, detection method{" "}
          <code className="rounded bg-muted px-1 text-xs">gemini</code>). These rows stay in the
          review queue for spot-checking but seed the corpus, so over time the free local model
          takes over and Gemini calls trend toward zero.
        </p>
        <div className="flex flex-col gap-1.5">
          <GuideStep
            step={1}
            title="Per-type control"
            description="Each document type has its own Gemini toggle in the ML & Gemini tab. Turn it off and that type will never be sent to Gemini, even when rules fail."
          />
          <GuideStep
            step={2}
            title="Token & cost logging"
            description="Every Gemini call records its real input/output token counts and estimated cost. The usage panel shows totals, a daily chart, and a per-type cost breakdown."
          />
          <GuideStep
            step={3}
            title="Bootstrap on demand"
            description="“Bootstrap all unclassified” (or per-type) sends pending / needs-review documents through Gemini in a batch to build training data quickly."
          />
          <GuideStep
            step={4}
            title="Free vs paid tier"
            description="On the paid tier costs are calculated per token. On the free tier cost is $0 — but Google may use the data for model training, so a warning is shown for production use."
          />
        </div>
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p className="text-xs">
            Gemini classifies from <strong>extracted text</strong>. Image-only scans with no text
            layer still go to “Needs Review” (vision OCR is a future step). The API key, tier and
            model are managed in <strong>Admin → Integration → Gemini</strong> — stored securely in
            the database, never in the browser.
          </p>
        </div>
      </GuideSection>

      <GuideSection icon={<Coins className="h-4 w-4" />} title="Training progress & retraining">
        <p>
          The <strong>ML &amp; Gemini</strong> tab tracks how ready each document type is. A
          progress bar and badge show where each type stands against its sample target:
        </p>
        <div className="flex flex-col gap-2 rounded-lg border p-3 text-xs">
          {[
            {
              c: "bg-red-400",
              label: "Excluded",
              detail: "fewer than 10 samples — not used by the model yet.",
            },
            {
              c: "bg-amber-400",
              label: "Learning",
              detail: "10–29 samples — in the model but still weak.",
            },
            {
              c: "bg-green-500",
              label: "Ready",
              detail: "30+ samples — trusted enough to classify.",
            },
            {
              c: "bg-teal-500",
              label: "Complete",
              detail: "reached its sample target — fully trained.",
            },
          ].map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className={cn("h-2.5 w-6 rounded-full", b.c)} />
              <span className="font-medium text-foreground">{b.label}</span>
              <span className="text-muted-foreground">— {b.detail}</span>
            </div>
          ))}
        </div>
        <p>
          Each row also shows the breakdown of confirmed vs Gemini-labelled samples and lets you set
          a per-type sample target (10–500). Click <strong>Train model now</strong> to retrain
          immediately, or set the <strong>Training schedule</strong> above to retrain automatically
          — choose a frequency (every N hours) or specific times of day, and add several times to
          run multiple times a day.
        </p>
      </GuideSection>
    </div>
  );
}
