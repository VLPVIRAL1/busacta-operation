import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isTypingTarget } from "@/lib/keyboard/is-typing-target";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WizardFileUpload } from "@/components/organizer/wizard-file-upload";
import { WizardTableField } from "@/components/organizer/wizard-table-field";
import {
  RichTextField,
  RichTextViewer,
  MatrixField,
  SignatureField,
  CalculatedField,
  MultiFileUploadField,
} from "@/components/organizer/fields";

import {
  getDeploymentForRespondent,
  saveResponse,
  submitDeployment,
} from "@/lib/organizer/deployments.functions";
import { type JsonObject, type OrganizerBlock } from "@/lib/organizer/schemas";
import { computeVisibleBlockIds } from "@/lib/organizer/evaluate-rules";
import { createPipingResolver, type PipingResolver } from "@/lib/organizer/rich-text";

type AnswerMap = Map<string, unknown>;

/**
 * Shared respondent wizard. Single source of truth used by both
 *   /organizer/r/$deploymentId     (internal staff fill)
 *   /portal/organizer/$deploymentId (external client fill)
 *
 * `exitTo` controls where the top-left "Exit" button navigates and where
 * the wizard returns after a successful submission.
 */
export interface WizardDeploymentLite {
  id: string;
  status: string;
  last_visited_block_id: string | null;
  template_id: string;
}
export interface WizardResponseLite {
  id: string;
  block_id: string;
  value_json: JsonObject | null;
  answered_at: string;
}
export interface WizardCtx {
  deployment: WizardDeploymentLite;
  template: { id: string; name: string; is_exam: boolean };
  blocks: OrganizerBlock[];
  responses: WizardResponseLite[];
}

export interface WizardTransport {
  fetchCtx: () => Promise<WizardCtx>;
  save: (input: {
    block_id: string;
    value_json: unknown;
    last_visited_block_id?: string | null;
  }) => Promise<unknown>;
  submit: () => Promise<unknown>;
}

export function RespondentWizard({
  deploymentId,
  exitTo = "/organizer",
  exitLabel = "Exit",
  transport,
}: {
  deploymentId: string;
  exitTo?: string;
  exitLabel?: string;
  transport?: WizardTransport;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchCtxFn = useServerFn(getDeploymentForRespondent);
  const saveFn = useServerFn(saveResponse);
  const submitFn = useServerFn(submitDeployment);

  const fetchCtx: () => Promise<WizardCtx> = transport
    ? transport.fetchCtx
    : async () => (await fetchCtxFn({ data: { id: deploymentId } })) as unknown as WizardCtx;
  const save = transport
    ? (input: { block_id: string; value_json: unknown; last_visited_block_id?: string | null }) =>
        transport.save(input)
    : (input: { block_id: string; value_json: unknown; last_visited_block_id?: string | null }) =>
        saveFn({
          data: {
            deployment_id: deploymentId,
            block_id: input.block_id,
            value_json: (input.value_json ?? null) as never,
            last_visited_block_id: input.last_visited_block_id,
          },
        });
  const submit = transport
    ? () => transport.submit()
    : () => submitFn({ data: { id: deploymentId } });

  const { data, isLoading } = useQuery({
    queryKey: ["organizer", "wizard", deploymentId],
    queryFn: () => fetchCtx(),
  });

  const [answers, setAnswers] = useState<AnswerMap>(new Map());
  const [saveStatus, setSaveStatus] = useState<Map<string, "pending" | "saved" | "error">>(
    new Map(),
  );
  const [sectionIdx, setSectionIdx] = useState(0);
  const [reviewMode, setReviewMode] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [navDirection, setNavDirection] = useState<1 | -1>(1);

  const resumedRef = useRef(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const m: AnswerMap = new Map();
    let latest: string | null = null;
    for (const r of data.responses) {
      if (r.value_json !== null) m.set(r.block_id, r.value_json);
      if (!latest || r.answered_at > latest) latest = r.answered_at;
    }
    setAnswers(m);
    setLastSavedAt(latest);
    // Resume: position user on the section containing the last visited block.
    if (!resumedRef.current) {
      const lastBlockId = data.deployment.last_visited_block_id;
      if (lastBlockId) {
        const block = data.blocks.find((b) => b.id === lastBlockId);
        const parentId = block?.parent_id ?? lastBlockId;
        const sortedSections = data.blocks
          .filter((b) => b.block_type === "section" && !b.parent_id)
          .sort((a, b) => a.order_index - b.order_index);
        const orphanOffset = data.blocks.some((b) => !b.parent_id && b.block_type !== "section")
          ? 1
          : 0;
        const idx = sortedSections.findIndex((s) => s.id === parentId);
        if (idx >= 0) setSectionIdx(idx + orphanOffset);
      }
      resumedRef.current = true;
    }
  }, [data]);

  const inFlight = useRef<Map<string, boolean>>(new Map());
  const pending = useRef<Map<string, unknown>>(new Map());

  const flush = async (blockId: string) => {
    if (inFlight.current.get(blockId)) return;
    const value = pending.current.get(blockId);
    if (value === undefined) return;
    pending.current.delete(blockId);
    inFlight.current.set(blockId, true);
    setSaveStatus((m) => new Map(m).set(blockId, "pending"));
    try {
      await save({
        block_id: blockId,
        value_json: value ?? null,
      });

      setSaveStatus((m) => new Map(m).set(blockId, "saved"));
      setLastSavedAt(new Date().toISOString());
    } catch (e) {
      setSaveStatus((m) => new Map(m).set(blockId, "error"));
      toast.error(`Save failed: ${(e as Error).message}`);
    } finally {
      inFlight.current.set(blockId, false);
      if (pending.current.has(blockId)) {
        flush(blockId);
      }
    }
  };

  const setAnswer = (blockId: string, value: unknown) => {
    setAnswers((prev) => new Map(prev).set(blockId, value));
    pending.current.set(blockId, value);
    const t = setTimeout(() => flush(blockId), 400);
    return () => clearTimeout(t);
  };

  const ctx = data;
  const sections = useMemo(
    () =>
      ctx
        ? ctx.blocks
            .filter((b) => b.block_type === "section" && !b.parent_id)
            .sort((a, b) => a.order_index - b.order_index)
        : [],
    [ctx],
  );
  const visible = useMemo(
    () => (ctx ? computeVisibleBlockIds(ctx.blocks, answers) : new Set<string>()),
    [ctx, answers],
  );
  const resolvePiping = useMemo<PipingResolver>(() => createPipingResolver(answers), [answers]);

  const sectionQuestions = (sectionId: string): OrganizerBlock[] =>
    ctx
      ? ctx.blocks
          .filter((b) => b.parent_id === sectionId)
          .filter((b) => visible.has(b.id))
          .sort((a, b) => a.order_index - b.order_index)
      : [];

  const orphanQuestions = (): OrganizerBlock[] =>
    ctx
      ? ctx.blocks
          .filter((b) => !b.parent_id && b.block_type !== "section" && visible.has(b.id))
          .sort((a, b) => a.order_index - b.order_index)
      : [];

  const submitMut = useMutation({
    mutationFn: () => submit(),
    onSuccess: () => {
      toast.success("Submitted");
      qc.invalidateQueries({ queryKey: ["organizer", "wizard", deploymentId] });
      navigate({ to: exitTo });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const goPrev = useCallback(() => {
    setNavDirection(-1);
    setSectionIdx((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setNavDirection(1);
    setSectionIdx((i) => i + 1);
  }, []);

  const pendingSavesCount = Array.from(saveStatus.values()).filter((s) => s === "pending").length;

  const requestExit = useCallback(() => {
    if (pendingSavesCount > 0) {
      setExitOpen(true);
    } else {
      navigate({ to: exitTo });
    }
  }, [navigate, exitTo, pendingSavesCount]);

  // Keyboard shortcuts: ← / → navigate, Esc requests exit. Disabled when
  // focus is inside a text input / contentEditable so typing isn't hijacked.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "Escape") {
        e.preventDefault();
        requestExit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, requestExit]);

  if (isLoading || !ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }

  const dep = ctx.deployment;
  const readOnly = !["not_started", "in_progress", "returned"].includes(dep.status);

  const pages = [
    ...(orphanQuestions().length > 0 ? [{ id: "__orphans", title: "Questions" }] : []),
    ...sections.map((s) => ({ id: s.id, title: s.question_text || "Section" })),
  ];
  const totalPages = pages.length;
  const currentPage = pages[Math.min(sectionIdx, totalPages - 1)];

  const requiredVisible = ctx.blocks.filter(
    (b) =>
      b.is_required && visible.has(b.id) && b.block_type !== "section" && b.block_type !== "info",
  );
  const answeredRequired = requiredVisible.filter((b) => {
    const v = answers.get(b.id);
    return v !== undefined && v !== null && v !== "";
  });
  const progress =
    requiredVisible.length === 0
      ? 100
      : Math.round((answeredRequired.length / requiredVisible.length) * 100);

  const pendingSaves = pendingSavesCount;
  const animKey = reviewMode ? "__review" : (currentPage?.id ?? "__none");

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-3 flex items-center gap-3 sm:gap-4">
          <Button variant="ghost" size="sm" onClick={requestExit} className="shrink-0">
            <ArrowLeft className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">{exitLabel}</span>
          </Button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{ctx.template.name}</div>
            <div className="text-xs text-muted-foreground">
              {currentPage
                ? `Page ${Math.min(sectionIdx, totalPages - 1) + 1} of ${totalPages} — ${currentPage.title}`
                : "Review"}
            </div>
          </div>
          <div className="hidden sm:block text-xs text-muted-foreground min-w-[7rem] text-right">
            {pendingSaves > 0 ? (
              <span className="flex items-center gap-1 justify-end">
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </span>
            ) : lastSavedAt ? (
              <span
                className="flex items-center gap-1 justify-end"
                title={new Date(lastSavedAt).toLocaleString()}
              >
                <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Saved{" "}
                {formatRelative(lastSavedAt)}
              </span>
            ) : (
              <span className="text-muted-foreground/70">Not started</span>
            )}
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-3 sm:px-6 pb-3">
          <Progress value={progress} className="h-1.5" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-4">
          {readOnly && (
            <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-sm">
              This deployment is <strong>{dep.status}</strong> — answers are read-only.
            </Card>
          )}

          <AnimatePresence mode="wait" initial={false} custom={navDirection}>
            <motion.div
              key={animKey}
              custom={navDirection}
              initial={{ opacity: 0, x: navDirection * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: navDirection * -24 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {reviewMode ? (
                <ReviewPage
                  blocks={ctx.blocks}
                  answers={answers}
                  visible={visible}
                  onJump={(sId, blockId) => {
                    setReviewMode(false);
                    const idx = pages.findIndex((p) => p.id === sId);
                    if (idx >= 0) {
                      setNavDirection(-1);
                      setSectionIdx(idx);
                    }
                    if (blockId) {
                      setTimeout(() => {
                        const el = document.getElementById(`q-${blockId}`);
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth", block: "center" });
                          el.classList.add("ring-2", "ring-amber-400");
                          setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 1600);
                        }
                      }, 50);
                    }
                  }}
                />
              ) : currentPage?.id === "__orphans" ? (
                <PageRenderer
                  questions={orphanQuestions()}
                  answers={answers}
                  setAnswer={setAnswer}
                  saveStatus={saveStatus}
                  readOnly={readOnly}
                  deploymentId={deploymentId}
                  resolvePiping={resolvePiping}
                />
              ) : currentPage ? (
                <SectionPage
                  section={ctx.blocks.find((b) => b.id === currentPage.id)!}
                  questions={sectionQuestions(currentPage.id)}
                  answers={answers}
                  setAnswer={setAnswer}
                  saveStatus={saveStatus}
                  readOnly={readOnly}
                  deploymentId={deploymentId}
                  resolvePiping={resolvePiping}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>

          <p className="text-[11px] text-muted-foreground/70 text-center pt-2">
            Tip: use <kbd className="px-1 py-0.5 rounded border bg-muted">←</kbd>{" "}
            <kbd className="px-1 py-0.5 rounded border bg-muted">→</kbd> to navigate,{" "}
            <kbd className="px-1 py-0.5 rounded border bg-muted">Esc</kbd> to exit.
          </p>
        </div>
      </div>

      <div className="border-t bg-background">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-2">
          <Button variant="outline" disabled={sectionIdx === 0 || reviewMode} onClick={goPrev}>
            Back
          </Button>
          <div className="flex-1" />
          {!reviewMode && sectionIdx < totalPages - 1 && (
            <Button onClick={goNext}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {!reviewMode && sectionIdx === totalPages - 1 && (
            <Button onClick={() => setReviewMode(true)}>Review</Button>
          )}
          {reviewMode && (
            <>
              <Button variant="outline" onClick={() => setReviewMode(false)}>
                Back to questions
              </Button>
              <Button
                onClick={() => submitMut.mutate()}
                disabled={
                  readOnly ||
                  submitMut.isPending ||
                  answeredRequired.length < requiredVisible.length
                }
              >
                {submitMut.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Submit
              </Button>
            </>
          )}
        </div>
      </div>

      <AlertDialog open={exitOpen} onOpenChange={setExitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without finishing saving?</AlertDialogTitle>
            <AlertDialogDescription>
              Some answers are still being saved. If you leave now, the most recent edits may be
              lost. You can resume from this exact spot next time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setExitOpen(false);
                navigate({ to: exitTo });
              }}
            >
              <X className="h-4 w-4 mr-1" /> Leave anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SectionPage({
  section,
  questions,
  answers,
  setAnswer,
  saveStatus,
  readOnly,
  deploymentId,
  resolvePiping,
}: {
  section: OrganizerBlock;
  questions: OrganizerBlock[];
  answers: AnswerMap;
  setAnswer: (id: string, v: unknown) => void;
  saveStatus: Map<string, "pending" | "saved" | "error">;
  readOnly: boolean;
  deploymentId: string;
  resolvePiping: PipingResolver;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">
        {resolvePiping(section.question_text) || "Section"}
      </h2>
      {section.help_text && (
        <p className="text-sm text-muted-foreground">{resolvePiping(section.help_text)}</p>
      )}
      <PageRenderer
        questions={questions}
        answers={answers}
        setAnswer={setAnswer}
        saveStatus={saveStatus}
        readOnly={readOnly}
        deploymentId={deploymentId}
        resolvePiping={resolvePiping}
      />
    </div>
  );
}

function PageRenderer({
  questions,
  answers,
  setAnswer,
  saveStatus,
  readOnly,
  deploymentId,
  resolvePiping,
}: {
  questions: OrganizerBlock[];
  answers: AnswerMap;
  setAnswer: (id: string, v: unknown) => void;
  saveStatus: Map<string, "pending" | "saved" | "error">;
  readOnly: boolean;
  deploymentId: string;
  resolvePiping: PipingResolver;
}) {
  if (questions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No questions visible based on previous answers.
      </p>
    );
  }
  return (
    <div className="space-y-5">
      {questions.map((q) => (
        <Card key={q.id} id={`q-${q.id}`} className="p-5 transition-shadow">
          <QuestionRenderer
            block={q}
            value={answers.get(q.id)}
            onChange={(v) => setAnswer(q.id, v)}
            status={saveStatus.get(q.id)}
            readOnly={readOnly}
            deploymentId={deploymentId}
            resolvePiping={resolvePiping}
            answers={answers}
          />
        </Card>
      ))}
    </div>
  );
}

export function QuestionRenderer({
  block,
  value,
  onChange,
  status,
  readOnly,
  deploymentId,
  resolvePiping,
  answers,
}: {
  block: OrganizerBlock;
  value: unknown;
  onChange: (v: unknown) => void;
  status?: "pending" | "saved" | "error";
  readOnly: boolean;
  deploymentId: string;
  resolvePiping: PipingResolver;
  answers: AnswerMap;
}) {
  const cfg = block.config_json as JsonObject;
  const questionText = resolvePiping(block.question_text);
  const helpText = resolvePiping(block.help_text);

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <label className="font-medium flex-1">
          {questionText}
          {block.is_required && <span className="text-destructive ml-1">*</span>}
        </label>
        {status === "error" && <span className="text-xs text-destructive">retry pending…</span>}
      </div>
      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}

      {block.block_type === "short_text" && (
        <Input
          value={readVal<string>(value, "text") ?? ""}
          placeholder={typeof cfg.placeholder === "string" ? cfg.placeholder : ""}
          disabled={readOnly}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      )}

      {block.block_type === "long_text" && (
        <Textarea
          rows={4}
          value={readVal<string>(value, "text") ?? ""}
          placeholder={typeof cfg.placeholder === "string" ? cfg.placeholder : ""}
          disabled={readOnly}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      )}

      {block.block_type === "rich_text" && (
        <RichTextField
          value={value}
          disabled={readOnly}
          onChange={(v) => onChange(v)}
          placeholder={typeof cfg.placeholder === "string" ? cfg.placeholder : ""}
        />
      )}

      {(block.block_type === "number" || block.block_type === "currency") && (
        <Input
          type="number"
          value={readVal<number>(value, "value") ?? ""}
          disabled={readOnly}
          onChange={(e) =>
            onChange({
              value: e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      )}

      {block.block_type === "yes_no" && (
        <div className="flex gap-2">
          {[
            { v: true, l: "Yes" },
            { v: false, l: "No" },
          ].map((o) => {
            const selected = readVal<boolean>(value, "value") === o.v;
            return (
              <Button
                key={o.l}
                type="button"
                variant={selected ? "default" : "outline"}
                disabled={readOnly}
                onClick={() => onChange({ value: o.v })}
              >
                {o.l}
              </Button>
            );
          })}
        </div>
      )}

      {block.block_type === "single_choice" && (
        <SingleChoiceField
          cfg={cfg}
          value={readVal<string>(value, "optionId") ?? ""}
          disabled={readOnly}
          onChange={(id) => onChange({ optionId: id })}
        />
      )}

      {block.block_type === "multi_choice" && (
        <MultiChoiceField
          cfg={cfg}
          value={readVal<string[]>(value, "optionIds") ?? []}
          disabled={readOnly}
          onChange={(ids) => onChange({ optionIds: ids })}
        />
      )}

      {block.block_type === "date" && (
        <Input
          type="date"
          value={readVal<string>(value, "iso") ?? ""}
          disabled={readOnly}
          onChange={(e) => onChange({ iso: e.target.value })}
        />
      )}

      {block.block_type === "date_range" && (
        <DateRangeField
          value={value as { startIso?: string; endIso?: string } | undefined}
          disabled={readOnly}
          onChange={(v) => onChange(v)}
        />
      )}

      {block.block_type === "address" && (
        <AddressField
          value={value as Record<string, string> | undefined}
          disabled={readOnly}
          onChange={(v) => onChange(v)}
        />
      )}

      {block.block_type === "signature" && (
        <SignatureField
          deploymentId={deploymentId}
          blockId={block.id}
          value={value}
          disabled={readOnly}
          onChange={(v) => onChange(v)}
          config={cfg as Record<string, unknown>}
        />
      )}

      {block.block_type === "matrix" && (
        <MatrixField
          blockId={block.id}
          value={value}
          disabled={readOnly}
          onChange={(v) => onChange(v)}
          config={cfg as Record<string, unknown>}
        />
      )}

      {block.block_type === "calculated" && (
        <CalculatedField
          blockId={block.id}
          value={value}
          answers={answers}
          onChange={(v) => onChange(v)}
          config={cfg as Record<string, unknown>}
        />
      )}

      {block.block_type === "file_upload" && (
        <WizardFileUpload
          deploymentId={deploymentId}
          blockId={block.id}
          value={value}
          disabled={readOnly}
          onChange={(v) => onChange(v)}
          config={cfg as Record<string, unknown>}
        />
      )}

      {block.block_type === "multi_file" && (
        <MultiFileUploadField
          deploymentId={deploymentId}
          blockId={block.id}
          value={value}
          disabled={readOnly}
          onChange={(v) => onChange(v)}
          config={cfg as Record<string, unknown>}
        />
      )}

      {block.block_type === "table" && (
        <WizardTableField
          value={value}
          disabled={readOnly}
          onChange={(v) => onChange(v)}
          config={cfg as Record<string, unknown>}
        />
      )}

      {block.block_type === "info" &&
        (typeof cfg.body === "string" && cfg.body.trim().startsWith("<") ? (
          <RichTextViewer value={{ kind: "rich", html: resolvePiping(cfg.body), json: {} }} />
        ) : (
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {resolvePiping(typeof cfg.body === "string" ? cfg.body : "")}
          </p>
        ))}
    </div>
  );
}

function readVal<T>(v: unknown, key: string): T | undefined {
  if (v && typeof v === "object" && key in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>)[key] as T;
  }
  return undefined;
}

function SingleChoiceField({
  cfg,
  value,
  disabled,
  onChange,
}: {
  cfg: JsonObject;
  value: string;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  const opts = Array.isArray(cfg.options)
    ? (cfg.options as unknown as Array<{ id: string; label: string }>)
    : [];
  const layout = typeof cfg.layout === "string" ? cfg.layout : "radio";

  if (layout === "dropdown") {
    return (
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {opts.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  return (
    <div className="space-y-1.5">
      {opts.map((o) => (
        <label key={o.id} className="flex items-center gap-2 cursor-pointer text-sm">
          <input
            type="radio"
            checked={value === o.id}
            disabled={disabled}
            onChange={() => onChange(o.id)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function MultiChoiceField({
  cfg,
  value,
  disabled,
  onChange,
}: {
  cfg: JsonObject;
  value: string[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const opts = Array.isArray(cfg.options)
    ? (cfg.options as unknown as Array<{ id: string; label: string }>)
    : [];
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="space-y-1.5">
      {opts.map((o) => (
        <label key={o.id} className="flex items-center gap-2 cursor-pointer text-sm">
          <Checkbox
            checked={value.includes(o.id)}
            disabled={disabled}
            onCheckedChange={() => toggle(o.id)}
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function DateRangeField({
  value,
  disabled,
  onChange,
}: {
  value: { startIso?: string; endIso?: string } | undefined;
  disabled: boolean;
  onChange: (v: { startIso: string; endIso: string }) => void;
}) {
  const v = value ?? { startIso: "", endIso: "" };
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input
        type="date"
        value={v.startIso ?? ""}
        disabled={disabled}
        onChange={(e) => onChange({ startIso: e.target.value, endIso: v.endIso ?? "" })}
      />
      <Input
        type="date"
        value={v.endIso ?? ""}
        disabled={disabled}
        onChange={(e) => onChange({ startIso: v.startIso ?? "", endIso: e.target.value })}
      />
    </div>
  );
}

function AddressField({
  value,
  disabled,
  onChange,
}: {
  value: Record<string, string> | undefined;
  disabled: boolean;
  onChange: (v: Record<string, string>) => void;
}) {
  const v = value ?? {};
  const set = (k: string, val: string) => onChange({ ...v, [k]: val });
  return (
    <div className="grid grid-cols-2 gap-2">
      <Input
        placeholder="Address line 1"
        className="col-span-2"
        value={v.line1 ?? ""}
        disabled={disabled}
        onChange={(e) => set("line1", e.target.value)}
      />
      <Input
        placeholder="Address line 2"
        className="col-span-2"
        value={v.line2 ?? ""}
        disabled={disabled}
        onChange={(e) => set("line2", e.target.value)}
      />
      <Input
        placeholder="City"
        value={v.city ?? ""}
        disabled={disabled}
        onChange={(e) => set("city", e.target.value)}
      />
      <Input
        placeholder="State / Region"
        value={v.region ?? ""}
        disabled={disabled}
        onChange={(e) => set("region", e.target.value)}
      />
      <Input
        placeholder="Postal code"
        value={v.postalCode ?? ""}
        disabled={disabled}
        onChange={(e) => set("postalCode", e.target.value)}
      />
      <Input
        placeholder="Country"
        value={v.country ?? ""}
        disabled={disabled}
        onChange={(e) => set("country", e.target.value)}
      />
    </div>
  );
}

function ReviewPage({
  blocks,
  answers,
  visible,
  onJump,
}: {
  blocks: OrganizerBlock[];
  answers: AnswerMap;
  visible: Set<string>;
  onJump: (sectionId: string, blockId?: string) => void;
}) {
  const sections = blocks
    .filter((b) => b.block_type === "section")
    .sort((a, b) => a.order_index - b.order_index);

  const isAnswered = (b: OrganizerBlock) => {
    const v = answers.get(b.id);
    return v !== undefined && v !== null && v !== "";
  };

  // Compute first unanswered required block, across the whole template, in document order.
  const orderedAll = [...blocks].sort((a, b) => a.order_index - b.order_index);
  const firstUnanswered = orderedAll.find(
    (b) =>
      b.is_required &&
      visible.has(b.id) &&
      b.block_type !== "section" &&
      b.block_type !== "info" &&
      !isAnswered(b),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 className="text-2xl font-semibold">Review your answers</h2>
          <p className="text-sm text-muted-foreground">
            Confirm everything looks correct before submitting.
          </p>
        </div>
        {firstUnanswered && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onJump(firstUnanswered.parent_id ?? firstUnanswered.id, firstUnanswered.id)
            }
          >
            Jump to first unanswered
          </Button>
        )}
      </div>
      {sections.map((s) => {
        const qs = blocks
          .filter((b) => b.parent_id === s.id && visible.has(b.id))
          .sort((a, b) => a.order_index - b.order_index);
        const required = qs.filter(
          (q) => q.is_required && q.block_type !== "section" && q.block_type !== "info",
        );
        const answeredCount = required.filter(isAnswered).length;
        const pct =
          required.length === 0 ? 100 : Math.round((answeredCount / required.length) * 100);
        const complete = pct === 100;
        return (
          <Card key={s.id} className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold flex-1">{s.question_text}</h3>
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${
                  complete
                    ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
                    : "border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10"
                }`}
              >
                {required.length === 0
                  ? "Optional"
                  : `${answeredCount}/${required.length} required • ${pct}%`}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onJump(s.id)}>
                Edit
              </Button>
            </div>
            <dl className="text-sm space-y-1">
              {qs.map((q) => {
                const answered = isAnswered(q);
                const missing = q.is_required && !answered && q.block_type !== "info";
                return (
                  <div
                    key={q.id}
                    className={`grid grid-cols-[1fr_2fr] gap-2 rounded px-2 py-1 ${
                      missing ? "bg-amber-500/10" : ""
                    }`}
                  >
                    <dt className="text-muted-foreground truncate flex items-center gap-1">
                      {missing && <span className="text-amber-600">●</span>}
                      {q.question_text}
                      {q.is_required && <span className="text-red-500">*</span>}
                    </dt>
                    <dd
                      className={`font-medium ${missing ? "text-amber-700 dark:text-amber-400" : ""}`}
                    >
                      {answered ? (
                        formatAnswer(answers.get(q.id))
                      ) : (
                        <span className="italic text-muted-foreground">Not answered</span>
                      )}
                      {missing && (
                        <Button
                          variant="link"
                          size="sm"
                          className="ml-2 h-auto p-0 text-amber-700 dark:text-amber-400"
                          onClick={() => onJump(s.id, q.id)}
                        >
                          Answer →
                        </Button>
                      )}
                    </dd>
                  </div>
                );
              })}
              {qs.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  No questions visible in this section.
                </div>
              )}
            </dl>
          </Card>
        );
      })}
    </div>
  );
}

export function formatRelative(iso: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

export function formatAnswer(v: unknown): string {
  if (v === undefined || v === null) return "—";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.kind === "rich") return stripHtml(String(o.html ?? "")) || "—";
    if (o.kind === "plain") return String(o.text ?? "—");
    if (o.kind === "drawn") return "Signature (drawn)";
    if (o.kind === "typed") return `Signed: ${o.typedName ?? "—"}`;
    if ("selections" in o) {
      const sel = o.selections as Record<string, unknown>;
      return (
        Object.entries(sel)
          .map(([k, v2]) => `${k}: ${Array.isArray(v2) ? v2.join(", ") : v2}`)
          .join(" · ") || "—"
      );
    }
    if ("files" in o && Array.isArray((o as { files: unknown[] }).files))
      return `${(o as { files: unknown[] }).files.length} file(s)`;
    if ("formula" in o && "value" in o) return o.value === null ? "—" : String(o.value);
    if ("text" in o) return String(o.text ?? "—");
    if ("value" in o) return String(o.value);
    if ("optionId" in o) return String(o.optionId ?? "—");
    if ("optionIds" in o) return (o.optionIds as string[]).join(", ");
    if ("iso" in o) return String(o.iso ?? "—");
    if ("startIso" in o) return `${o.startIso ?? "—"} → ${o.endIso ?? "—"}`;
    if ("typedName" in o) return `Signed: ${o.typedName ?? "—"}`;
    if ("line1" in o)
      return [o.line1, o.city, o.region, o.postalCode, o.country].filter(Boolean).join(", ");
    return JSON.stringify(v);
  }
  return String(v);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
