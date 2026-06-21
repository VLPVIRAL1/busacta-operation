import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleDashed,
  FileText,
  Loader2,
  Menu,
  Send,
  ShieldCheck,
  StickyNote,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/shared/utils";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  QuestionRenderer,
  formatRelative,
  type WizardTransport,
} from "@/components/organizer/respondent-wizard";
import { type OrganizerBlock } from "@/lib/organizer/schemas";
import { computeVisibleBlockIds } from "@/lib/organizer/evaluate-rules";
import { createPipingResolver, type PipingResolver } from "@/lib/organizer/rich-text";
import { RichTextViewer } from "@/components/organizer/fields";

type AnswerMap = Map<string, unknown>;

/**
 * Single-page client-facing form view used for public organizer links (/o/$token).
 * Three-column layout: outline (left 20%) · form (center) · section notes (right ~25%).
 * Clicking an item in the outline scrolls the center and updates the right pane.
 */
export function RespondentSinglePage({
  deploymentId,
  exitTo = "/",
  exitLabel = "Close",
  transport,
}: {
  deploymentId: string;
  exitTo?: string;
  exitLabel?: string;
  transport: WizardTransport;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["organizer", "single", deploymentId],
    queryFn: () => transport.fetchCtx(),
  });

  const [answers, setAnswers] = useState<AnswerMap>(new Map());
  const [saveStatus, setSaveStatus] = useState<Map<string, "pending" | "saved" | "error">>(
    new Map(),
  );
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [submittedDone, setSubmittedDone] = useState(false);

  const centerScrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const inFlight = useRef<Map<string, boolean>>(new Map());
  const pending = useRef<Map<string, unknown>>(new Map());

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
  }, [data]);

  const flush = async (blockId: string) => {
    if (inFlight.current.get(blockId)) return;
    const value = pending.current.get(blockId);
    if (value === undefined) return;
    pending.current.delete(blockId);
    inFlight.current.set(blockId, true);
    setSaveStatus((m) => new Map(m).set(blockId, "pending"));
    try {
      await transport.save({
        block_id: blockId,
        value_json: value ?? null,
        last_visited_block_id: blockId,
      });
      setSaveStatus((m) => new Map(m).set(blockId, "saved"));
      setLastSavedAt(new Date().toISOString());
    } catch (e) {
      setSaveStatus((m) => new Map(m).set(blockId, "error"));
      toast.error(`Save failed: ${(e as Error).message}`);
    } finally {
      inFlight.current.set(blockId, false);
      if (pending.current.has(blockId)) flush(blockId);
    }
  };

  const setAnswer = useCallback((blockId: string, value: unknown) => {
    setAnswers((prev) => new Map(prev).set(blockId, value));
    pending.current.set(blockId, value);
    const t = setTimeout(() => flush(blockId), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const sectionQuestions = useCallback(
    (sectionId: string): OrganizerBlock[] =>
      ctx
        ? ctx.blocks
            .filter((b) => b.parent_id === sectionId && visible.has(b.id))
            .sort((a, b) => a.order_index - b.order_index)
        : [],
    [ctx, visible],
  );

  const orphanQuestions = useMemo<OrganizerBlock[]>(
    () =>
      ctx
        ? ctx.blocks
            .filter((b) => !b.parent_id && b.block_type !== "section" && visible.has(b.id))
            .sort((a, b) => a.order_index - b.order_index)
        : [],
    [ctx, visible],
  );

  const pages = useMemo(
    () => [
      ...(orphanQuestions.length > 0
        ? [{ id: "__orphans", title: "General", helpText: null as string | null }]
        : []),
      ...sections.map((s) => ({
        id: s.id,
        title: s.question_text || "Section",
        helpText: s.help_text,
      })),
    ],
    [orphanQuestions.length, sections],
  );

  useEffect(() => {
    if (!activeSectionId && pages.length > 0) setActiveSectionId(pages[0].id);
  }, [pages, activeSectionId]);

  // Active section tracker via IntersectionObserver on section containers.
  useEffect(() => {
    if (!ctx) return;
    const root = centerScrollRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visibleEntries[0]) {
          const id = (visibleEntries[0].target as HTMLElement).dataset.sectionId;
          if (id) setActiveSectionId(id);
        }
      },
      { root, rootMargin: "-30% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const el of sectionRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [ctx, pages]);

  const scrollToBlock = useCallback((sectionId: string, blockId?: string) => {
    setActiveSectionId(sectionId);
    setMobileNavOpen(false);
    requestAnimationFrame(() => {
      const target = blockId
        ? document.getElementById(`q-${blockId}`)
        : sectionRefs.current.get(sectionId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.classList.add("ring-2", "ring-primary/40");
        setTimeout(() => target.classList.remove("ring-2", "ring-primary/40"), 1200);
      }
    });
  }, []);

  const submitMut = useMutation({
    mutationFn: () => transport.submit(),
    onSuccess: () => {
      toast.success("Submitted — thank you");
      qc.invalidateQueries({ queryKey: ["organizer", "single", deploymentId] });
      setSubmittedDone(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingSavesCount = Array.from(saveStatus.values()).filter((s) => s === "pending").length;

  const requestExit = useCallback(() => {
    if (pendingSavesCount > 0) setExitOpen(true);
    else navigate({ to: exitTo });
  }, [navigate, exitTo, pendingSavesCount]);

  if (isLoading || !ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background to-secondary/30">
        <Skeleton className="h-64 w-full max-w-2xl" />
      </div>
    );
  }

  const dep = ctx.deployment;
  const readOnly = !["not_started", "in_progress", "returned"].includes(dep.status);

  const requiredVisible = ctx.blocks.filter(
    (b) =>
      b.is_required && visible.has(b.id) && b.block_type !== "section" && b.block_type !== "info",
  );
  const isAnswered = (b: OrganizerBlock) => {
    const v = answers.get(b.id);
    return v !== undefined && v !== null && v !== "";
  };
  const answeredRequired = requiredVisible.filter(isAnswered);
  const progress =
    requiredVisible.length === 0
      ? 100
      : Math.round((answeredRequired.length / requiredVisible.length) * 100);

  const activeSection = pages.find((p) => p.id === activeSectionId) ?? pages[0];
  const activeSectionBlock =
    activeSection && activeSection.id !== "__orphans"
      ? ctx.blocks.find((b) => b.id === activeSection.id)
      : null;
  const activeSectionNote = activeSection?.helpText ?? null;

  if (submittedDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-primary/5 p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-3 border-primary/10 shadow-xl">
          <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
            <ShieldCheck className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Thank you</h1>
          <p className="text-sm text-muted-foreground">
            Your response has been submitted securely. You can safely close this page.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="h-screen flex flex-col overflow-hidden relative"
      style={{
        backgroundImage:
          "radial-gradient(1200px 600px at 0% 0%, color-mix(in oklch, var(--primary) 14%, transparent), transparent 60%), radial-gradient(900px 500px at 100% 100%, color-mix(in oklch, var(--primary) 8%, transparent), transparent 60%), linear-gradient(180deg, var(--background), color-mix(in oklch, var(--secondary) 40%, var(--background)))",
      }}
    >
      {/* faint dot pattern overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.25] [background-image:radial-gradient(circle_at_1px_1px,color-mix(in_oklch,var(--foreground)_8%,transparent)_1px,transparent_0)] [background-size:22px_22px]"
        aria-hidden
      />

      {/* ---------- Top brand bar ---------- */}
      <header className="relative z-30 px-3 lg:px-4 pt-3 shrink-0">
        <div className="rounded-2xl border bg-card/70 backdrop-blur-xl shadow-sm overflow-hidden">
          <div className="px-3 lg:px-5 h-14 flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={requestExit}
              className="text-muted-foreground hover:text-foreground rounded-full"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> {exitLabel}
            </Button>
            <div className="hidden lg:flex items-center gap-2 pl-3 border-l">
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center text-xs font-bold shadow-sm">
                B
              </div>
              <div className="text-sm font-semibold tracking-tight">
                BusAcTa <span className="text-primary">One</span>
              </div>
            </div>
            <div className="flex-1 min-w-0 px-2">
              <div className="text-sm font-semibold truncate">{ctx.template.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {progress}% complete · {answeredRequired.length} of {requiredVisible.length}{" "}
                required answered
              </div>
            </div>
            <SaveBadge pending={pendingSavesCount} lastSavedAt={lastSavedAt} />
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden rounded-full"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="Toggle outline"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
          <div className="h-1 w-full bg-muted/50">
            <motion.div
              className="h-full bg-gradient-to-r from-primary via-primary to-primary/60"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>
      </header>

      {/* ---------- 3-column body (resizable, independently scrollable) ---------- */}
      <div className="flex-1 min-h-0 relative z-10 p-3 lg:p-4">
        {/* Mobile fallback: outline as overlay, main as block scroll */}
        <div className="lg:hidden h-full flex flex-col gap-3">
          {mobileNavOpen && (
            <div className="absolute inset-x-3 top-3 bottom-3 z-30 rounded-2xl border bg-card/95 backdrop-blur-xl shadow-xl overflow-hidden">
              <div className="h-full overflow-y-auto">
                <Outline
                  pages={pages}
                  blocks={ctx.blocks}
                  sectionQuestions={sectionQuestions}
                  orphanQuestions={orphanQuestions}
                  activeSectionId={activeSection?.id ?? null}
                  answers={answers}
                  visible={visible}
                  onJump={scrollToBlock}
                  resolvePiping={resolvePiping}
                />
              </div>
            </div>
          )}
          <PaneShell className="flex-1 min-h-0">
            <div ref={centerScrollRef} className="h-full overflow-y-auto">
              <CenterContent
                readOnly={readOnly}
                depStatus={dep.status}
                template={ctx.template}
                progress={progress}
                orphanQuestions={orphanQuestions}
                sections={sections}
                sectionRefs={sectionRefs}
                sectionQuestions={sectionQuestions}
                answers={answers}
                setAnswer={setAnswer}
                saveStatus={saveStatus}
                deploymentId={deploymentId}
                resolvePiping={resolvePiping}
                answeredRequiredCount={answeredRequired.length}
                requiredCount={requiredVisible.length}
                submitting={submitMut.isPending}
                onSubmit={() => submitMut.mutate()}
                pagesLength={pages.length}
              />
            </div>
          </PaneShell>
        </div>

        {/* Desktop: resizable 3-column */}
        <ResizablePanelGroup direction="horizontal" className="hidden lg:flex h-full w-full gap-3">
          <ResizablePanel
            defaultSize={"20%" as unknown as number}
            minSize={"14%" as unknown as number}
            maxSize={"32%" as unknown as number}
            className="!overflow-visible"
          >
            <PaneShell className="h-full">
              <div className="h-full overflow-y-auto">
                <Outline
                  pages={pages}
                  blocks={ctx.blocks}
                  sectionQuestions={sectionQuestions}
                  orphanQuestions={orphanQuestions}
                  activeSectionId={activeSection?.id ?? null}
                  answers={answers}
                  visible={visible}
                  onJump={scrollToBlock}
                  resolvePiping={resolvePiping}
                />
              </div>
            </PaneShell>
          </ResizablePanel>
          <ResizableHandle className="!bg-transparent cursor-col-resize w-2 after:rounded-full after:w-1 after:bg-border/40 hover:after:bg-primary/50 data-[resize-handle-state=drag]:after:bg-primary transition-colors" />
          <ResizablePanel
            defaultSize={"55%" as unknown as number}
            minSize={"40%" as unknown as number}
            className="!overflow-visible"
          >
            <PaneShell className="h-full">
              <div ref={centerScrollRef} className="h-full overflow-y-auto">
                <CenterContent
                  readOnly={readOnly}
                  depStatus={dep.status}
                  template={ctx.template}
                  progress={progress}
                  orphanQuestions={orphanQuestions}
                  sections={sections}
                  sectionRefs={sectionRefs}
                  sectionQuestions={sectionQuestions}
                  answers={answers}
                  setAnswer={setAnswer}
                  saveStatus={saveStatus}
                  deploymentId={deploymentId}
                  resolvePiping={resolvePiping}
                  answeredRequiredCount={answeredRequired.length}
                  requiredCount={requiredVisible.length}
                  submitting={submitMut.isPending}
                  onSubmit={() => submitMut.mutate()}
                  pagesLength={pages.length}
                />
              </div>
            </PaneShell>
          </ResizablePanel>
          <ResizableHandle className="!bg-transparent cursor-col-resize w-2 after:rounded-full after:w-1 after:bg-border/40 hover:after:bg-primary/50 data-[resize-handle-state=drag]:after:bg-primary transition-colors" />
          <ResizablePanel
            defaultSize={"25%" as unknown as number}
            minSize={"16%" as unknown as number}
            maxSize={"40%" as unknown as number}
            className="!overflow-visible"
          >
            <PaneShell className="h-full">
              <div className="h-full overflow-y-auto">
                <SectionNotesPanel
                  sectionTitle={activeSection?.title ?? null}
                  sectionBlock={activeSectionBlock ?? null}
                  note={activeSectionNote}
                  answeredCount={
                    activeSection && activeSection.id !== "__orphans"
                      ? sectionQuestions(activeSection.id).filter(isAnswered).length
                      : orphanQuestions.filter(isAnswered).length
                  }
                  totalCount={
                    activeSection && activeSection.id !== "__orphans"
                      ? sectionQuestions(activeSection.id).length
                      : orphanQuestions.length
                  }
                  resolvePiping={resolvePiping}
                />
              </div>
            </PaneShell>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <AlertDialog open={exitOpen} onOpenChange={setExitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without finishing saving?</AlertDialogTitle>
            <AlertDialogDescription>
              Some answers are still being saved. If you leave now the most recent edits may be
              lost.
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

// ---------- subcomponents ----------

function PaneShell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl shadow-sm overflow-hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

function CenterContent({
  readOnly,
  depStatus,
  template,
  progress,
  orphanQuestions,
  sections,
  sectionRefs,
  sectionQuestions,
  answers,
  setAnswer,
  saveStatus,
  deploymentId,
  resolvePiping,
  answeredRequiredCount,
  requiredCount,
  submitting,
  onSubmit,
  pagesLength,
}: {
  readOnly: boolean;
  depStatus: string;
  template: { name: string };
  progress: number;
  orphanQuestions: OrganizerBlock[];
  sections: OrganizerBlock[];
  sectionRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  sectionQuestions: (id: string) => OrganizerBlock[];
  answers: AnswerMap;
  setAnswer: (id: string, v: unknown) => void;
  saveStatus: Map<string, "pending" | "saved" | "error">;
  deploymentId: string;
  resolvePiping: PipingResolver;
  answeredRequiredCount: number;
  requiredCount: number;
  submitting: boolean;
  onSubmit: () => void;
  pagesLength: number;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8 space-y-10">
      {readOnly && (
        <Card className="p-4 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-sm rounded-2xl">
          This form is <strong>{depStatus}</strong> — answers are read-only.
        </Card>
      )}

      <FormIntro template={template} progress={progress} />

      {orphanQuestions.length > 0 && (
        <SectionBlock
          ref={(el) => {
            if (el) sectionRefs.current.set("__orphans", el);
            else sectionRefs.current.delete("__orphans");
          }}
          sectionId="__orphans"
          index={1}
          total={pagesLength}
          title="General"
          helpText={null}
          questions={orphanQuestions}
          answers={answers}
          setAnswer={setAnswer}
          saveStatus={saveStatus}
          readOnly={readOnly}
          deploymentId={deploymentId}
          resolvePiping={resolvePiping}
        />
      )}

      {sections.map((s, i) => {
        const sectionIndex = (orphanQuestions.length > 0 ? 1 : 0) + i + 1;
        return (
          <SectionBlock
            key={s.id}
            ref={(el) => {
              if (el) sectionRefs.current.set(s.id, el);
              else sectionRefs.current.delete(s.id);
            }}
            sectionId={s.id}
            index={sectionIndex}
            total={pagesLength}
            title={resolvePiping(s.question_text) || "Section"}
            helpText={null}
            questions={sectionQuestions(s.id)}
            answers={answers}
            setAnswer={setAnswer}
            saveStatus={saveStatus}
            readOnly={readOnly}
            deploymentId={deploymentId}
            resolvePiping={resolvePiping}
          />
        );
      })}

      {/* Submit area */}
      <Card className="p-6 border-primary/20 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent rounded-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1 space-y-1">
            <h3 className="font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Ready to submit?
            </h3>
            <p className="text-sm text-muted-foreground">
              {answeredRequiredCount < requiredCount
                ? `${requiredCount - answeredRequiredCount} required question(s) still need an answer.`
                : "All required questions are answered. You can submit now."}
            </p>
          </div>
          <Button
            size="lg"
            onClick={onSubmit}
            disabled={readOnly || submitting || answeredRequiredCount < requiredCount}
            className="rounded-full px-6 shadow-md shadow-primary/20"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Submit form
          </Button>
        </div>
      </Card>

      <p className="text-[11px] text-muted-foreground/70 text-center pb-4">
        Your answers are auto-saved. Powered by BusAcTa Operations · secured with end-to-end
        encryption.
      </p>
    </div>
  );
}

function SaveBadge({ pending, lastSavedAt }: { pending: number; lastSavedAt: string | null }) {
  return (
    <div className="hidden md:flex text-xs text-muted-foreground min-w-[9rem] justify-end">
      {pending > 0 ? (
        <span className="flex items-center gap-1.5">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving…
        </span>
      ) : lastSavedAt ? (
        <span className="flex items-center gap-1.5" title={new Date(lastSavedAt).toLocaleString()}>
          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
          Saved {formatRelative(lastSavedAt)}
        </span>
      ) : (
        <span className="text-muted-foreground/70">Auto-save on</span>
      )}
    </div>
  );
}

function FormIntro({ template, progress }: { template: { name: string }; progress: number }) {
  return (
    <div className="space-y-3">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
        <FileText className="h-3 w-3" /> Client form
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">{template.name}</h1>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Please fill out the sections below. Use the outline on the left to jump between sections —
        notes from our team appear on the right.
      </p>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary/60 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="tabular-nums">{progress}%</span>
      </div>
    </div>
  );
}

const SectionBlock = (() => {
  // forwardRef-style via function with ref prop
  type Props = {
    sectionId: string;
    index: number;
    total: number;
    title: string;
    helpText: string | null;
    questions: OrganizerBlock[];
    answers: AnswerMap;
    setAnswer: (id: string, v: unknown) => void;
    saveStatus: Map<string, "pending" | "saved" | "error">;
    readOnly: boolean;
    deploymentId: string;
    resolvePiping: PipingResolver;
    ref?: (el: HTMLElement | null) => void;
  };
  function Inner({
    sectionId,
    index,
    total,
    title,
    helpText,
    questions,
    answers,
    setAnswer,
    saveStatus,
    readOnly,
    deploymentId,
    resolvePiping,
    ref,
  }: Props) {
    return (
      <section
        ref={ref}
        data-section-id={sectionId}
        id={`section-${sectionId}`}
        className="scroll-mt-20 space-y-4"
      >
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-mono text-primary/70 tabular-nums">
            {String(index).padStart(2, "0")}/{String(total).padStart(2, "0")}
          </span>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        </div>
        {helpText && <p className="text-sm text-muted-foreground">{helpText}</p>}
        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No questions visible in this section.
          </p>
        ) : (
          <div className="space-y-4">
            {questions.map((q) => (
              <Card
                key={q.id}
                id={`q-${q.id}`}
                className="p-5 rounded-2xl scroll-mt-20 transition-all duration-200 hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5"
              >
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
        )}
      </section>
    );
  }
  return Inner;
})();

function Outline({
  pages,
  blocks,
  sectionQuestions,
  orphanQuestions,
  activeSectionId,
  answers,
  visible,
  onJump,
  resolvePiping,
}: {
  pages: Array<{ id: string; title: string; helpText: string | null }>;
  blocks: OrganizerBlock[];
  sectionQuestions: (id: string) => OrganizerBlock[];
  orphanQuestions: OrganizerBlock[];
  activeSectionId: string | null;
  answers: AnswerMap;
  visible: Set<string>;
  onJump: (sectionId: string, blockId?: string) => void;
  resolvePiping: PipingResolver;
}) {
  void blocks;
  void visible;
  const isAnswered = (b: OrganizerBlock) => {
    const v = answers.get(b.id);
    return v !== undefined && v !== null && v !== "";
  };

  const sectionStats = (id: string) => {
    const qs = id === "__orphans" ? orphanQuestions : sectionQuestions(id);
    const required = qs.filter(
      (q) => q.is_required && q.block_type !== "section" && q.block_type !== "info",
    );
    const done = required.filter(isAnswered).length;
    return {
      total: required.length,
      done,
      complete: required.length > 0 && done === required.length,
      partial: done > 0 && done < required.length,
    };
  };

  return (
    <nav className="p-4 space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2 pb-2">
        Sections
      </div>
      {pages.map((p) => {
        const stats = sectionStats(p.id);
        const isActive = p.id === activeSectionId;
        const qs = p.id === "__orphans" ? orphanQuestions : sectionQuestions(p.id);
        return (
          <div key={p.id}>
            <button
              type="button"
              onClick={() => onJump(p.id)}
              className={cn(
                "w-full text-left px-2.5 py-2 rounded-md flex items-center gap-2 text-sm group transition-colors",
                isActive ? "bg-primary/10 text-foreground" : "hover:bg-muted text-foreground/80",
              )}
            >
              <SectionStatusDot
                complete={stats.complete}
                partial={stats.partial}
                active={isActive}
              />
              <span className="flex-1 truncate font-medium">{resolvePiping(p.title)}</span>
              {stats.total > 0 && (
                <span
                  className={cn(
                    "text-[10px] tabular-nums px-1.5 py-0.5 rounded",
                    stats.complete
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {stats.done}/{stats.total}
                </span>
              )}
            </button>
            {isActive && qs.length > 0 && (
              <div className="ml-3 mt-1 mb-2 border-l border-border/60 pl-2 space-y-0.5">
                {qs
                  .filter((q) => q.block_type !== "info")
                  .map((q) => {
                    const answered = isAnswered(q);
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => onJump(p.id, q.id)}
                        className="w-full text-left px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center gap-1.5 group"
                      >
                        {answered ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                        ) : (
                          <Circle className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                        )}
                        <span className="truncate flex-1">
                          {resolvePiping(q.question_text) || "Question"}
                        </span>
                        {q.is_required && (
                          <span className="text-destructive/70 text-[10px]">*</span>
                        )}
                        <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-60 shrink-0" />
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function SectionStatusDot({
  complete,
  partial,
  active,
}: {
  complete: boolean;
  partial: boolean;
  active: boolean;
}) {
  if (complete) {
    return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />;
  }
  if (partial) {
    return <CircleDashed className="h-4 w-4 text-primary shrink-0" />;
  }
  return (
    <Circle
      className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground/40")}
    />
  );
}

function SectionNotesPanel({
  sectionTitle,
  sectionBlock,
  note,
  answeredCount,
  totalCount,
  resolvePiping,
}: {
  sectionTitle: string | null;
  sectionBlock: OrganizerBlock | null;
  note: string | null;
  answeredCount: number;
  totalCount: number;
  resolvePiping: PipingResolver;
}) {
  const resolvedNote = note ? resolvePiping(note) : null;
  const isHtml = !!resolvedNote && resolvedNote.trim().startsWith("<");

  return (
    <div className="p-5 space-y-4 sticky top-0">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <StickyNote className="h-3.5 w-3.5" />
        Section notes
      </div>

      <Card className="p-4 bg-gradient-to-br from-primary/[0.07] via-primary/[0.02] to-transparent border-primary/15 rounded-2xl shadow-sm">
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Now viewing</div>
          <h3 className="font-semibold leading-snug">
            {sectionTitle ? resolvePiping(sectionTitle) : "—"}
          </h3>
          {totalCount > 0 && (
            <div className="text-xs text-muted-foreground">
              {answeredCount} of {totalCount} answered
            </div>
          )}
        </div>
      </Card>

      <div className="space-y-2">
        <div className="text-xs font-medium text-foreground/80">Notes from our team</div>
        {resolvedNote ? (
          <Card className="p-4 bg-amber-50/60 dark:bg-amber-950/20 border-amber-200/70 dark:border-amber-900/40 text-sm leading-relaxed rounded-2xl shadow-sm">
            {isHtml ? (
              <RichTextViewer value={{ kind: "rich", html: resolvedNote, json: {} }} />
            ) : (
              <p className="whitespace-pre-wrap text-foreground/90">{resolvedNote}</p>
            )}
          </Card>
        ) : (
          <Card className="p-4 border-dashed text-xs text-muted-foreground italic rounded-2xl bg-muted/30">
            No notes for this section. Helpful instructions will appear here when the form designer
            adds them.
          </Card>
        )}
      </div>

      {sectionBlock?.is_required && (
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
          <span className="text-destructive">*</span> Required fields are marked with an asterisk.
        </div>
      )}
    </div>
  );
}
