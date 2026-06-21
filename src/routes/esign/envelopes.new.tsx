import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Copy,
  FileStack,
  FileText,
  Loader2,
  Mail,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPickerLabel } from "@/components/shared/entity-code";
import { supabase } from "@/integrations/supabase/client";
import {
  addDocument,
  createEnvelope,
  deleteDocument,
  getEnvelopeOverview,
  updateEnvelopeTarget,
} from "@/lib/esign/envelopes.functions";
import { upsertRecipients, sendEnvelope } from "@/lib/esign/builder.functions";
import { applyTemplateToEnvelope, listTemplates } from "@/lib/esign/templates.functions";
import { FieldCanvasStep } from "@/components/esign/field-canvas-step";
import { ReviewPreview } from "@/components/esign/review-preview";
import type { RecipientInput } from "@/lib/esign/schemas";
import {
  WizardRail,
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  WIZARD_STEP_HINTS,
  computeStepStatus,
  type WizardStep,
} from "@/components/esign/wizard-rail";
import {
  StorageTargetCard,
  StorageTargetChip,
  isStorageTargetValid,
  type StorageTarget,
} from "@/components/esign/storage-target-card";

type Step = WizardStep;
const STEPS = WIZARD_STEPS;
const STEP_LABELS = WIZARD_STEP_LABELS;

type TemplateSummary = {
  id: string;
  name: string;
  doc_kind: string | null;
  role_count: number;
  field_count: number;
};

type TemplateSeedRole = {
  label: string;
  role: RecipientInput["role"];
  auth_method: RecipientInput["auth_method"];
  routing_order: number;
  color_hex: string;
};

export const Route = createFileRoute("/esign/envelopes/new")({
  component: () => (
    <AuthGuard>
      <AppShell
        crumbs={[
          { label: "E-Signature", to: "/esign" },
          { label: "Documents", to: "/esign/envelopes" },
          { label: "New" },
        ]}
        fullBleed
        hideMegaMenu
      >
        <div className="esign-scope h-full bg-[var(--esign-bg)]">
          <EnvelopeWizard />
        </div>
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

export function EnvelopeWizard({
  existingEnvelopeId,
  initialStep = "details",
  title,
}: {
  existingEnvelopeId?: string;
  initialStep?: Step;
  title?: string;
} = {}) {
  const [envelopeId, setEnvelopeId] = useState<string | null>(existingEnvelopeId ?? null);
  const [step, setStep] = useState<Step>(existingEnvelopeId ? initialStep : "details");
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [seedRoles, setSeedRoles] = useState<TemplateSeedRole[] | null>(null);
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("esign.wizard.railCollapsed") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("esign.wizard.railCollapsed", railCollapsed ? "1" : "0");
    }
  }, [railCollapsed]);

  const overview = useServerFn(getEnvelopeOverview);
  const overviewQ = useQuery({
    queryKey: ["esign", "envelope", envelopeId],
    enabled: !!envelopeId,
    queryFn: () => overview({ data: { envelope_id: envelopeId! } }),
  });

  const env = overviewQ.data?.envelope as
    | { title?: string; status?: string; target_kind?: string | null }
    | undefined;
  const docCount = overviewQ.data?.documents?.length ?? 0;
  const recipientCount = overviewQ.data?.recipients?.length ?? 0;
  // hasFields is approximated by whether any document exists + we've moved past
  // recipients; tracked precisely inside FieldCanvasStep. For rail unlock we
  // accept the simpler heuristic: recipients exist.
  const hasFields = recipientCount > 0;

  const status = computeStepStatus({
    current: step,
    hasEnvelope: !!envelopeId,
    documentCount: docCount,
    recipientCount,
    hasFields,
  });

  const go = (next: Step) => {
    if (status[next] === "locked") return;
    setStep(next);
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-50 text-slate-900">
      <WizardRail
        current={step}
        status={status}
        collapsed={railCollapsed}
        onToggleCollapsed={() => setRailCollapsed((v) => !v)}
        onJump={go}
        envelopeTitle={title ?? env?.title ?? (existingEnvelopeId ? "Edit draft" : "New document")}
        envelopeStatus={env?.status ?? "draft"}
        savedHint={overviewQ.isFetching ? "Syncing…" : envelopeId ? "Draft saved" : "Unsaved"}
      />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="h-11 shrink-0 border-b border-slate-200/70 bg-white/60 backdrop-blur-xl px-4 flex items-center gap-3 shadow-[0_1px_0_rgba(15,27,61,0.04)]">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--esign-primary-soft)] text-[var(--esign-primary-ink)] text-[10px] font-semibold uppercase tracking-wider">
            Step {STEPS.indexOf(step) + 1}/{STEPS.length}
          </div>
          <div className="text-sm font-semibold text-slate-900">{STEP_LABELS[step]}</div>
          <div className="text-xs text-slate-500 hidden md:block truncate">
            {WIZARD_STEP_HINTS[step]}
          </div>
          <StepPager step={step} status={status} onJump={go} />
          <div className="ml-auto flex items-center gap-2">
            {env?.target_kind && (
              <StorageTargetChip target={{ kind: env.target_kind as StorageTarget["kind"] }} />
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {step === "details" && (
            <StepScroll>
              <DetailsStep
                envelopeId={envelopeId}
                onCreated={(id, opts) => {
                  setEnvelopeId(id);
                  setPendingTemplateId(opts.templateId);
                  setSeedRoles(opts.seedRoles);
                  go("upload");
                }}
              />
            </StepScroll>
          )}
          {step === "upload" && envelopeId && (
            <StepScroll>
              <UploadStep
                envelopeId={envelopeId}
                onBack={() => go("details")}
                onNext={() => go("recipients")}
              />
            </StepScroll>
          )}
          {step === "recipients" && envelopeId && (
            <StepScroll>
              <RecipientsStep
                envelopeId={envelopeId}
                seedRoles={seedRoles}
                pendingTemplateId={pendingTemplateId}
                onTemplateApplied={() => {
                  setPendingTemplateId(null);
                  setSeedRoles(null);
                }}
                onBack={() => go("upload")}
                onNext={() => go("fields")}
              />
            </StepScroll>
          )}
          {step === "fields" && envelopeId && (
            <FieldCanvasStep
              envelopeId={envelopeId}
              onBack={() => go("recipients")}
              onNext={() => go("preview")}
            />
          )}
          {step === "preview" && envelopeId && (
            <StepScroll>
              <PreviewStep
                envelopeId={envelopeId}
                onBack={() => go("fields")}
                onNext={() => go("review")}
              />
            </StepScroll>
          )}
          {step === "review" && envelopeId && (
            <StepScroll>
              <ReviewStep envelopeId={envelopeId} onBack={() => go("preview")} />
            </StepScroll>
          )}
        </div>
      </div>
    </div>
  );
}

function StepScroll({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto p-6">{children}</div>;
}

function StepPager({
  step,
  status,
  onJump,
}: {
  step: Step;
  status: Record<Step, "complete" | "active" | "available" | "locked">;
  onJump: (s: Step) => void;
}) {
  const idx = STEPS.indexOf(step);
  const prev = idx > 0 ? STEPS[idx - 1] : null;
  const next = idx < STEPS.length - 1 ? STEPS[idx + 1] : null;
  const prevDisabled = !prev || status[prev] === "locked";
  const nextDisabled = !next || status[next] === "locked";
  return (
    <div className="hidden md:flex items-center gap-1 ml-3 pl-3 border-l border-slate-200">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        disabled={prevDisabled}
        onClick={() => prev && onJump(prev)}
        title="Previous step"
        aria-label="Previous step"
      >
        <ArrowLeft className="h-3.5 w-3.5 mr-1" />
        Previous
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        disabled={nextDisabled}
        onClick={() => next && onJump(next)}
        title="Next step"
        aria-label="Next step"
      >
        Next
        <ArrowRight className="h-3.5 w-3.5 ml-1" />
      </Button>
    </div>
  );
}

// ---------- Details ----------
function DetailsStep({
  envelopeId,
  onCreated,
}: {
  envelopeId: string | null;
  onCreated: (
    id: string,
    opts: { templateId: string | null; seedRoles: TemplateSeedRole[] | null },
  ) => void;
}) {
  const overview = useServerFn(getEnvelopeOverview);
  const updateTarget = useServerFn(updateEnvelopeTarget);
  const existingQ = useQuery({
    queryKey: ["esign", "envelope", envelopeId],
    enabled: !!envelopeId,
    queryFn: () => overview({ data: { envelope_id: envelopeId! } }),
  });
  const existingEnv = existingQ.data?.envelope as
    | {
        title?: string;
        firm_id?: string;
        project_id?: string | null;
        message?: string | null;
        routing_mode?: "sequential" | "parallel";
        target_kind?: StorageTarget["kind"] | null;
        target_direct_client_id?: string | null;
        target_profile_id?: string | null;
        target_task_id?: string | null;
      }
    | undefined;

  const [title, setTitle] = useState("");
  const [firmId, setFirmId] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [routingMode, setRoutingMode] = useState<"sequential" | "parallel">("sequential");
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [target, setTarget] = useState<StorageTarget | null>(null);

  // Hydrate when an existing envelope is being edited.
  useEffect(() => {
    if (!existingEnv) return;
    setTitle((t) => t || existingEnv.title || "");
    setFirmId((f) => f || existingEnv.firm_id || "");
    setProjectId((p) => p || existingEnv.project_id || "");
    setMessage((m) => m || existingEnv.message || "");
    setRoutingMode(existingEnv.routing_mode ?? "sequential");
    if (!target && existingEnv.target_kind) {
      setTarget({
        kind: existingEnv.target_kind,
        direct_client_id: existingEnv.target_direct_client_id ?? null,
        profile_id: existingEnv.target_profile_id ?? null,
        task_id: existingEnv.target_task_id ?? null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingEnv?.title, existingEnv?.firm_id, existingEnv?.target_kind]);

  const firmsQ = useQuery({
    queryKey: ["esign", "firms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firms")
        .select("id, name, firm_identifier")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const listTpls = useServerFn(listTemplates);
  const templatesQ = useQuery({
    queryKey: ["esign", "templates", firmId],
    enabled: firmId.length > 0,
    queryFn: () => listTpls({ data: { firm_id: firmId } }),
  });
  const templates: TemplateSummary[] = templatesQ.data?.templates ?? [];

  // Reset project + template if the firm changes (only when creating new).
  useEffect(() => {
    if (envelopeId) return;
    setProjectId("");
    setTemplateId("");
  }, [firmId, envelopeId]);

  const create = useServerFn(createEnvelope);
  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: {
          firm_id: firmId,
          title: title.trim(),
          project_id: target?.kind === "cpa" ? projectId || null : projectId ? projectId : null,
          message: message.trim() || null,
          routing_mode: routingMode,
          expires_in_days: expiresInDays,
          reminder_cadence_hours: 48,
          target: target
            ? {
                kind: target.kind,
                direct_client_id: target.direct_client_id ?? null,
                profile_id: target.profile_id ?? null,
                task_id: target.task_id ?? null,
                organizer_deployment_id: target.organizer_deployment_id ?? null,
              }
            : null,
        },
      }),
    onSuccess: async (r) => {
      toast.success("Document created");
      let seed: TemplateSeedRole[] | null = null;
      if (templateId) {
        const tpl = templates.find((t) => t.id === templateId);
        if (tpl) {
          try {
            const { data: row, error } = await supabase
              .from("esign_templates")
              .select("field_layout_json")
              .eq("id", templateId)
              .maybeSingle();
            if (error) throw error;
            const layout = (row?.field_layout_json ?? {}) as {
              roles?: Array<{
                label?: string;
                role?: string;
                auth_method?: string;
                routing_order?: number;
                color_hex?: string;
              }>;
            };
            seed = (layout.roles ?? []).map((rl, i) => ({
              label: rl.label ?? `Recipient ${i + 1}`,
              role: (rl.role ?? "signer") as RecipientInput["role"],
              auth_method: (rl.auth_method ?? "email_link") as RecipientInput["auth_method"],
              routing_order: rl.routing_order ?? i + 1,
              color_hex: rl.color_hex ?? "#4f46e5",
            }));
          } catch (e) {
            console.warn("Template seed load failed", e);
          }
        }
      }
      onCreated(r.id, { templateId: templateId || null, seedRoles: seed });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateTargetMut = useMutation({
    mutationFn: () =>
      updateTarget({
        data: {
          envelope_id: envelopeId!,
          target: {
            kind: target!.kind,
            direct_client_id: target?.direct_client_id ?? null,
            profile_id: target?.profile_id ?? null,
            task_id: target?.task_id ?? null,
            organizer_deployment_id: target?.organizer_deployment_id ?? null,
          },
        },
      }),
    onSuccess: () => toast.success("Routing target updated"),
    onError: (e: Error) => toast.error(e.message),
  });

  const targetValid = isStorageTargetValid(target);
  const cpaProjectValid = target?.kind !== "cpa" || (projectId && projectId.length > 0);
  const canSubmit = title.trim().length > 0 && firmId.length > 0 && targetValid && cpaProjectValid;

  const resolvedPath = useMemo(() => {
    if (!target) return null;
    if (target.kind === "direct_client" && target.direct_client_id)
      return `direct-client › ${target.direct_client_id.slice(0, 8)} › esign`;
    if (target.kind === "cpa" && firmId && projectId)
      return `cpa › ${firmId.slice(0, 6)} › ${projectId.slice(0, 6)}${target.task_id ? ` › ${target.task_id.slice(0, 6)}` : ""}`;
    if (target.kind === "hr" && target.profile_id)
      return `hr › ${target.profile_id.slice(0, 8)} › esign`;
    return null;
  }, [target, firmId, projectId]);

  return (
    <div className="grid gap-4 max-w-3xl mx-auto">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="esign-title">Document title</Label>
            <Input
              id="esign-title"
              placeholder="e.g. Smith Family — 2025 1040 signature"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Firm</Label>
            {firmsQ.isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Select value={firmId} onValueChange={setFirmId} disabled={!!envelopeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a firm" />
                </SelectTrigger>
                <SelectContent>
                  {(firmsQ.data ?? []).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {formatPickerLabel(
                        (f as { firm_identifier?: string | null }).firm_identifier,
                        f.name,
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <StorageTargetCard
            firmId={firmId || null}
            projectId={projectId || null}
            onProjectIdChange={(id) => setProjectId(id ?? "")}
            value={target}
            onChange={setTarget}
            resolvedPath={resolvedPath}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Start from template (optional)</Label>
              <Select
                value={templateId || "__none__"}
                onValueChange={(v) => setTemplateId(v === "__none__" ? "" : v)}
                disabled={!firmId || templatesQ.isLoading || !!envelopeId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={firmId ? "Blank document" : "Pick a firm first"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Blank document</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="inline-flex items-center gap-1.5">
                        <FileStack className="h-3 w-3" />
                        {t.name} · {t.role_count}r / {t.field_count}f
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Routing</Label>
              <Select
                value={routingMode}
                onValueChange={(v) => setRoutingMode(v as typeof routingMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sequential">Sequential</SelectItem>
                  <SelectItem value="parallel">Parallel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="esign-ttl">Expires in (days)</Label>
              <Input
                id="esign-ttl"
                type="number"
                min={1}
                max={180}
                value={expiresInDays}
                onChange={(e) =>
                  setExpiresInDays(Math.max(1, Math.min(180, Number(e.target.value) || 1)))
                }
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="esign-msg">Message to signers (optional)</Label>
            <Textarea
              id="esign-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>
          <div className="pt-2 flex gap-2">
            {envelopeId ? (
              <Button
                onClick={() => updateTargetMut.mutate()}
                disabled={!targetValid || updateTargetMut.isPending}
              >
                {updateTargetMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Save routing target
              </Button>
            ) : (
              <Button
                onClick={() => createMut.mutate()}
                disabled={!canSubmit || createMut.isPending}
              >
                {createMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Continue to upload
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Upload ----------
function UploadStep({
  envelopeId,
  onBack,
  onNext,
}: {
  envelopeId: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const qc = useQueryClient();
  const overview = useServerFn(getEnvelopeOverview);
  const addDoc = useServerFn(addDocument);
  const delDoc = useServerFn(deleteDocument);
  const [uploading, setUploading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["esign", "envelope", envelopeId],
    queryFn: () => overview({ data: { envelope_id: envelopeId } }),
  });
  const documents = data?.documents ?? [];

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 50 MB`);
          continue;
        }
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
        const path = `${envelopeId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("esign-source")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) {
          toast.error(`Upload failed: ${upErr.message}`);
          continue;
        }
        await addDoc({
          data: {
            envelope_id: envelopeId,
            name: file.name,
            source_mime: file.type || "application/pdf",
            source_path: path,
            order_index: documents.length + i,
          },
        });
      }
      qc.invalidateQueries({ queryKey: ["esign", "envelope", envelopeId] });
      toast.success("Documents added");
    } finally {
      setUploading(false);
    }
  }

  const delMut = useMutation({
    mutationFn: (document_id: string) => delDoc({ data: { document_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["esign", "envelope", envelopeId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardContent className="p-6">
          <label
            htmlFor="esign-file"
            className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:bg-muted/30 transition-colors"
          >
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <div className="font-medium">Drop a PDF here or click to upload</div>
            <div className="text-xs text-muted-foreground mt-1">PDF · max 50 MB per file</div>
            <input
              id="esign-file"
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
              disabled={uploading}
            />
          </label>
          <div className="mt-6">
            <div className="text-sm font-medium mb-2">Files in this document</div>
            {isLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : documents.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No documents yet. Add at least one to continue.
              </div>
            ) : (
              <ul className="divide-y rounded-md border">
                {documents.map((d) => (
                  <li key={d.id} className="px-3 py-2 flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{d.name}</div>
                      <div className="text-xs text-muted-foreground">{d.source_mime}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => delMut.mutate(d.id)}
                      title="Remove"
                      aria-label="Remove document"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="text-sm font-medium">Next</div>
          <p className="text-xs text-muted-foreground">Add recipients and route the document.</p>
          <Button className="w-full" disabled={documents.length === 0} onClick={onNext}>
            Continue to recipients
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
          <Button variant="ghost" className="w-full" onClick={onBack}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------- Recipients ----------
const PALETTE = [
  "#4f46e5",
  "#0891b2",
  "#16a34a",
  "#ca8a04",
  "#dc2626",
  "#db2777",
  "#7c3aed",
  "#0f766e",
];

type RecipientForm = RecipientInput & { _key: string };

function makeRecipient(idx: number): RecipientForm {
  return {
    _key: crypto.randomUUID(),
    full_name: "",
    email: "",
    role: "signer",
    auth_method: "email_link",
    routing_order: idx + 1,
    phone_e164: null,
    color_hex: PALETTE[idx % PALETTE.length],
  };
}

function RecipientsStep({
  envelopeId,
  seedRoles,
  pendingTemplateId,
  onTemplateApplied,
  onBack,
  onNext,
}: {
  envelopeId: string;
  seedRoles: TemplateSeedRole[] | null;
  pendingTemplateId: string | null;
  onTemplateApplied: () => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const overview = useServerFn(getEnvelopeOverview);
  const upsertFn = useServerFn(upsertRecipients);
  const applyTpl = useServerFn(applyTemplateToEnvelope);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["esign", "envelope", envelopeId],
    queryFn: () => overview({ data: { envelope_id: envelopeId } }),
  });

  const initial = useMemo<RecipientForm[]>(() => {
    const list = data?.recipients ?? [];
    if (list.length > 0) {
      return list.map((r, i) => ({
        _key: r.id,
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        role: r.role,
        auth_method: r.auth_method,
        routing_order: r.routing_order ?? i + 1,
        phone_e164: r.phone_e164 ?? null,
        color_hex: r.color_hex ?? PALETTE[i % PALETTE.length],
      }));
    }
    // Prefill from template seed when there are no saved recipients yet.
    if (seedRoles && seedRoles.length > 0) {
      return seedRoles.map((rl, i) => ({
        _key: crypto.randomUUID(),
        full_name: rl.label.startsWith("Recipient ") ? "" : rl.label,
        email: "",
        role: rl.role,
        auth_method: rl.auth_method,
        routing_order: rl.routing_order,
        phone_e164: null,
        color_hex: rl.color_hex || PALETTE[i % PALETTE.length],
      }));
    }
    return [makeRecipient(0)];
  }, [data?.recipients, seedRoles]);

  const [recipients, setRecipients] = useState<RecipientForm[]>([]);

  // initialize once when data loads
  useEffect(() => {
    if (recipients.length === 0 && initial.length > 0) setRecipients(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const isSequential = data?.envelope?.routing_mode === "sequential";

  function update(idx: number, patch: Partial<RecipientForm>) {
    setRecipients((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function remove(idx: number) {
    setRecipients((rs) =>
      rs
        .filter((_, i) => i !== idx)
        .map((r, i) => ({
          ...r,
          routing_order: i + 1,
          color_hex: r.color_hex ?? PALETTE[i % PALETTE.length],
        })),
    );
  }
  function add() {
    setRecipients((rs) => [...rs, makeRecipient(rs.length)]);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      await upsertFn({
        data: {
          envelope_id: envelopeId,
          recipients: recipients.map(({ _key: _k, ...r }) => r),
        },
      });
      // After saving recipients, apply the chosen template (if any) so the
      // field canvas opens with the layout already populated.
      if (pendingTemplateId) {
        try {
          const res = await applyTpl({
            data: {
              envelope_id: envelopeId,
              template_id: pendingTemplateId,
            },
          });
          toast.success(`Template applied · ${res.inserted} fields placed`);
          onTemplateApplied();
        } catch (e) {
          toast.error(`Template not applied: ${e instanceof Error ? e.message : "unknown error"}`);
        }
      }
    },
    onSuccess: () => {
      toast.success("Recipients saved");
      qc.invalidateQueries({ queryKey: ["esign", "envelope", envelopeId] });
      onNext();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid =
    recipients.length > 0 &&
    recipients.every(
      (r) => r.full_name.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email.trim()),
    ) &&
    recipients.some((r) => r.role === "signer");

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card className="max-w-4xl">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Recipients</div>
            <div className="text-xs text-muted-foreground">
              {isSequential
                ? "Signers receive the document in order. Drag to reorder later."
                : "All recipients receive the document at the same time."}
            </div>
            {pendingTemplateId && (
              <div className="text-xs mt-1 inline-flex items-center gap-1 text-primary">
                <FileStack className="h-3 w-3" />
                Template will be applied after saving recipients
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={add}>
            <UserPlus className="h-4 w-4 mr-1.5" />
            Add recipient
          </Button>
        </div>

        <ul className="space-y-3">
          {recipients.map((r, i) => (
            <li key={r._key} className="border rounded-md p-3 grid grid-cols-12 gap-2 items-center">
              <div className="col-span-1 flex items-center justify-center">
                <span
                  className="inline-flex h-7 w-7 rounded-full items-center justify-center text-xs font-semibold text-white"
                  style={{ backgroundColor: r.color_hex }}
                >
                  {i + 1}
                </span>
              </div>
              <Input
                className="col-span-3"
                placeholder="Full name"
                value={r.full_name}
                onChange={(e) => update(i, { full_name: e.target.value })}
                maxLength={120}
              />
              <Input
                className="col-span-4"
                type="email"
                placeholder="email@example.com"
                value={r.email}
                onChange={(e) => update(i, { email: e.target.value })}
                maxLength={255}
              />
              <Select
                value={r.role}
                onValueChange={(v) => update(i, { role: v as RecipientInput["role"] })}
              >
                <SelectTrigger className="col-span-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="signer">Signer</SelectItem>
                  <SelectItem value="approver">Approver</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="cc">CC only</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={r.auth_method}
                onValueChange={(v) =>
                  update(i, { auth_method: v as RecipientInput["auth_method"] })
                }
              >
                <SelectTrigger className="col-span-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email_link">Email</SelectItem>
                  <SelectItem value="access_code">Code</SelectItem>
                  <SelectItem value="sms_otp">SMS</SelectItem>
                </SelectContent>
              </Select>
              <div className="col-span-1 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(i)}
                  disabled={recipients.length <= 1}
                  title="Remove recipient"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={!valid || saveMut.isPending}>
            {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save & place fields
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Review ----------
function ReviewStep({ envelopeId, onBack }: { envelopeId: string; onBack: () => void }) {
  const navigate = useNavigate();
  const overview = useServerFn(getEnvelopeOverview);
  const sendFn = useServerFn(sendEnvelope);
  const { data, isLoading } = useQuery({
    queryKey: ["esign", "envelope", envelopeId],
    queryFn: () => overview({ data: { envelope_id: envelopeId } }),
  });
  const [links, setLinks] = useState<Array<{ email: string; url: string }>>([]);

  const sendMut = useMutation({
    mutationFn: () => sendFn({ data: { envelope_id: envelopeId } }),
    onSuccess: (r) => {
      if (r.ok) {
        setLinks(r.links.map((l) => ({ email: l.email, url: l.url })));
        toast.success("Document sent");
      } else {
        for (const e of r.errors) toast.error(e.message);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  const env = data?.envelope;
  const docs = data?.documents ?? [];
  const recipients = data?.recipients ?? [];

  return (
    <Card className="max-w-3xl">
      <CardContent className="p-6 space-y-5">
        <div>
          <div className="text-xs text-muted-foreground uppercase">Title</div>
          <div className="text-base font-medium">{env?.title}</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted-foreground uppercase">Routing</div>
            <div>{env?.routing_mode}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase">Expires</div>
            <div>{env?.expires_at ? new Date(env.expires_at).toLocaleString() : "—"}</div>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase mb-1.5">
            Documents ({docs.length})
          </div>
          <ul className="text-sm space-y-1">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                {d.name}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase mb-1.5">
            Recipients ({recipients.length})
          </div>
          <ul className="text-sm space-y-1">
            {recipients.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: r.color_hex }}
                />
                <span className="font-medium">{r.full_name}</span>
                <span className="text-muted-foreground">&lt;{r.email}&gt;</span>
                <Badge variant="outline" className="ml-auto">
                  {r.role}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        {links.length > 0 && (
          <div className="border rounded-md p-3 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium">Signing links</div>
                <p className="text-xs text-muted-foreground">
                  Email each link to the right recipient, or copy and paste it.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const subject = encodeURIComponent(`Please sign: ${env?.title ?? "document"}`);
                  const body = encodeURIComponent(
                    links.map((l) => `${l.email}:\n${l.url}\n`).join("\n"),
                  );
                  window.location.href = `mailto:?bcc=${encodeURIComponent(
                    links.map((l) => l.email).join(","),
                  )}&subject=${subject}&body=${body}`;
                }}
              >
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                Email all links
              </Button>
            </div>
            <ul className="text-xs space-y-1.5 mt-1">
              {links.map((l) => {
                const subject = encodeURIComponent(`Please sign: ${env?.title ?? "document"}`);
                const body = encodeURIComponent(
                  `Hello,\n\nPlease review and sign the document using the secure link below:\n\n${l.url}\n\nThank you.`,
                );
                return (
                  <li
                    key={l.email}
                    className="flex items-center gap-2 rounded bg-background/60 px-2 py-1.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{l.email}</div>
                      <a
                        className="text-primary underline truncate block"
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {l.url}
                      </a>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Copy link"
                      aria-label="Copy link"
                      onClick={() => {
                        navigator.clipboard.writeText(l.url);
                        toast.success("Link copied");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title={`Email ${l.email}`}
                      aria-label={`Email link to ${l.email}`}
                      asChild
                    >
                      <a
                        href={`mailto:${encodeURIComponent(
                          l.email,
                        )}?subject=${subject}&body=${body}`}
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate({ to: "/esign/envelopes" })}>
              Save as draft
            </Button>
            <Button
              onClick={() => sendMut.mutate()}
              disabled={sendMut.isPending || links.length > 0}
            >
              {sendMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {links.length > 0 ? "Sent" : "Send document"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Preview ----------
function PreviewStep({
  envelopeId,
  onBack,
  onNext,
}: {
  envelopeId: string;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex-1 min-h-0 overflow-auto">
        <ReviewPreview envelopeId={envelopeId} />
      </div>
      <div className="flex justify-center items-center gap-3 pt-2">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to fields
        </Button>
        <Button onClick={onNext}>
          Looks good — continue
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
