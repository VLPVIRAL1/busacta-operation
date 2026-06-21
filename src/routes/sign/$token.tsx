import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getSignerSession,
  submitSignerSubmission,
  declineSigning,
} from "@/lib/esign/signer.functions";
import { type PageSize } from "@/components/esign/pdf-page";
import { LazyPdfPage } from "@/components/esign/lazy-pdf-page";
import {
  useEsignPdfViewer,
  EsignPdfViewerToolbar,
  PDF_VIEWER_SHORTCUTS,
  PageThumbnailRail,
  ThumbnailToggleButton,
} from "@/components/esign/pdf-viewer-controls";

import { SignaturePad } from "@/components/esign/signature-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "@/components/ui/dialog";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileSignature,
  History,
  Keyboard,
  ShieldCheck,
  User,
  Users,
  XCircle,
} from "lucide-react";

import { toast } from "sonner";
import {
  isFieldVisible,
  validateFieldValue,
  type FieldConditional,
  type FieldOptions,
  type FieldType,
} from "@/lib/esign/schemas";
import { useScrollRestore, useSignerDraft } from "@/lib/esign/use-signer-draft";
import {
  READING_MODE_KEY,
  readingModeStorageValue,
  parseReadingModePref,
  nextRequiredCursor,
} from "@/lib/esign/reading-mode";
import {
  AuditTimelineRail,
  CollapseEdgeButton,
  ReadingActionCluster,
  SignHeaderBar,
  ZoomPill,
  useCockpitCollapse,
} from "@/components/esign/sign-cockpit";
import { cn } from "@/lib/shared/utils";

export const Route = createFileRoute("/sign/$token")({
  head: () => ({
    meta: [{ title: "Sign document" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: SignerPage,
  errorComponent: ({ error }) => (
    <CenterMsg
      icon={<XCircle className="h-10 w-10 text-destructive" />}
      title="Couldn't load this document"
      body={
        (error instanceof Error ? error.message : null) ??
        "Please refresh the page, or contact the sender for a fresh link."
      }
    />
  ),
});

type LocalValue = {
  text?: string;
  dataUrl?: string;
};

function SignerPage() {
  const { token } = useParams({ from: "/sign/$token" });
  const queryClient = useQueryClient();
  const fetchSession = useServerFn(getSignerSession);
  const submit = useServerFn(submitSignerSubmission);
  const decline = useServerFn(declineSigning);

  const { data, isLoading, error } = useQuery({
    queryKey: ["esign-signer", token],
    queryFn: () => fetchSession({ data: { token } }),
    retry: false,
  });

  const [values, setValues] = useState<Record<string, LocalValue>>({});
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(1);
  // Per-page sizes so each page's overlay is positioned independently.
  // Shared global pageSize caused all overlays to snap to the latest
  // page's dimensions on every onReady callback.
  const [pageSizes, setPageSizes] = useState<Record<number, PageSize>>({});
  const [padField, setPadField] = useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [consent, setConsent] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const [thumbsOpen, setThumbsOpen] = useState(false);
  void thumbsOpen;
  const { leftOpen, setLeftOpen, rightOpen, setRightOpen } = useCockpitCollapse();

  // Hydrate reading mode pref from localStorage on first mount.
  useEffect(() => {
    try {
      setReadingMode(parseReadingModePref(localStorage.getItem(READING_MODE_KEY)));
    } catch {
      /* noop */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(READING_MODE_KEY, readingModeStorageValue(readingMode));
    } catch {
      /* noop */
    }
  }, [readingMode]);

  // Per-field DOM refs — used for auto-scroll (B5) + arrow-key nav (B3).
  const fieldRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const setFieldRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) fieldRefs.current.set(id, el);
    else fieldRefs.current.delete(id);
  }, []);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scrollAndFocus = useCallback(
    (fieldId: string) => {
      const el = fieldRefs.current.get(fieldId);
      if (!el) return;
      el.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
      });
      // Focus the inner control if available, otherwise the wrapper.
      const focusable = el.querySelector<HTMLElement>(
        'button, input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      (focusable ?? el).focus({ preventScroll: true });
    },
    [prefersReducedMotion],
  );

  // Autosave + scroll restore
  const draft = useSignerDraft(token);
  const docs = data?.documents ?? [];
  const currentDocId = activeDocId ?? docs[0]?.id ?? null;
  const currentDoc = docs.find((d) => d.id === currentDocId) ?? null;
  useScrollRestore(`${token}:${currentDocId ?? "first"}`);

  // Hydrate from saved draft once the session is known.
  const hydratedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!draft.hydratedOnce) return;
    if (!data) return;
    if (data.recipient.completed_at || !data.is_active) return;
    if (hydratedKeyRef.current === token) return;
    hydratedKeyRef.current = token;
    if (draft.hydrated) {
      setValues(draft.hydrated.values ?? {});
      setConsent(!!draft.hydrated.consent);
      const recapture = Object.values(draft.hydrated.values ?? {}).some((v) => v?.needsRecapture);
      if (recapture) {
        toast.info("Some uploads were too large to save — please re-add them.");
      }
    }
  }, [draft.hydratedOnce, draft.hydrated, data, token]);

  // Persist values whenever they change.
  useEffect(() => {
    if (!draft.hydratedOnce || !data) return;
    if (data.recipient.completed_at || !data.is_active) return;
    draft.save({
      values,
      consent,
      updatedAt: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, consent]);

  // Responsive PDF container — drives pageSize.width from layout width on mobile
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLElement | null>>(new Map());
  const setPageRef = useCallback((idx: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(idx, el);
    else pageRefs.current.delete(idx);
  }, []);
  const firstSize = pageSizes[0];
  const pageAspect = firstSize && firstSize.width > 0 ? firstSize.height / firstSize.width : 1.294;
  const viewer = useEsignPdfViewer({
    scrollRef: stageRef,
    pageRefs,
    pageCount,
    pageAspect,
    windowScroll: false,
    enabled: !declineOpen && !confirmOpen && !helpOpen && !padField,
  });
  const renderWidth = viewer.renderWidth;

  const myFields = data?.fields ?? [];

  // Parse JSON columns once
  const parsedFields = useMemo(() => {
    return (data?.fields ?? []).map((f) => {
      let opts: FieldOptions | null = null;
      let cond: FieldConditional | null = null;
      try {
        if (f.options_json) opts = JSON.parse(f.options_json) as FieldOptions;
      } catch {
        opts = null;
      }
      try {
        if (f.conditional_json) cond = JSON.parse(f.conditional_json) as FieldConditional;
      } catch {
        cond = null;
      }
      return { ...f, opts, cond };
    });
  }, [data?.fields]);

  // Resolve current text-equivalent value for a given field id (used by
  // conditional evaluator)
  const resolveValue = (fieldId: string) => {
    const v = values[fieldId];
    if (v?.dataUrl) return "true";
    if (v?.text != null) return v.text;
    const existing = parsedFields.find((x) => x.id === fieldId);
    return existing?.existing_value_text ?? "";
  };

  const visibilityById = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const f of parsedFields) m.set(f.id, isFieldVisible(f.cond, resolveValue));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedFields, values]);

  const fieldErrors = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of parsedFields) {
      const visible = visibilityById.get(f.id) ?? true;
      if (!visible) continue;
      const v = values[f.id];
      const isImg = f.field_type === "signature" || f.field_type === "initials";
      const isIdDoc = f.field_type === "signer_id_document";
      if (isImg || isIdDoc) {
        if (f.is_required && !v?.dataUrl && !f.existing_value_image_path) {
          m.set(f.id, isIdDoc ? "ID upload required" : "Signature required");
        }
        continue;
      }
      // date_signed auto-fills to today on submit; never block on it.
      if (f.field_type === "date_signed") continue;
      const text = v?.text ?? f.existing_value_text ?? "";
      const err = validateFieldValue(f.field_type as FieldType, f.is_required, true, text, f.opts);
      if (err) m.set(f.id, err);
    }
    return m;
  }, [parsedFields, values, visibilityById]);

  const requiredRemaining = fieldErrors.size;

  // Ordered list of required, visible, currently-unfilled field ids — for
  // auto-scroll (B5), floating Prev/Next cluster (B4), keyboard nav (B3).
  const orderedRequiredEmpty = useMemo(() => {
    return parsedFields
      .filter((f) => {
        if (!f.is_required) return false;
        if (!(visibilityById.get(f.id) ?? true)) return false;
        return fieldErrors.has(f.id);
      })
      .sort((a, b) => {
        const pa = a.page_index ?? 0;
        const pb = b.page_index ?? 0;
        if (pa !== pb) return pa - pb;
        return (a.tab_order ?? 9999) - (b.tab_order ?? 9999);
      })
      .map((f) => f.id);
  }, [parsedFields, visibilityById, fieldErrors]);

  // Ordered list of all visible fields — for arrow-key nav.
  const orderedAllVisible = useMemo(() => {
    return parsedFields
      .filter((f) => visibilityById.get(f.id) ?? true)
      .sort((a, b) => {
        const pa = a.page_index ?? 0;
        const pb = b.page_index ?? 0;
        if (pa !== pb) return pa - pb;
        return (a.tab_order ?? 9999) - (b.tab_order ?? 9999);
      })
      .map((f) => f.id);
  }, [parsedFields, visibilityById]);

  // Ordered list of all required, visible fields — for the reading-mode
  // floating Prev/Next cluster (B4). Unlike orderedRequiredEmpty this keeps
  // already-filled fields so the cursor can step over the full required set.
  const orderedRequiredAll = useMemo(() => {
    return parsedFields
      .filter((f) => f.is_required && (visibilityById.get(f.id) ?? true))
      .sort((a, b) => {
        const pa = a.page_index ?? 0;
        const pb = b.page_index ?? 0;
        if (pa !== pb) return pa - pb;
        return (a.tab_order ?? 9999) - (b.tab_order ?? 9999);
      })
      .map((f) => f.id);
  }, [parsedFields, visibilityById]);

  // Cursor used by the reading-mode floating cluster Prev/Next buttons.
  const reqCursorRef = useRef(0);
  const gotoRequired = useCallback(
    (dir: 1 | -1) => {
      const list = orderedRequiredAll;
      if (list.length === 0) return;
      const next = nextRequiredCursor(reqCursorRef.current, dir, list.length);
      reqCursorRef.current = next;
      scrollAndFocus(list[next]);
    },
    [orderedRequiredAll, scrollAndFocus],
  );

  const toggleReadingMode = useCallback(() => setReadingMode((v) => !v), []);

  // B5: auto-scroll to next required field when one becomes complete.
  const prevErrorsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const prev = prevErrorsRef.current;
    const next = new Set(fieldErrors.keys());
    // Detect a field that was invalid before and is now valid.
    let justCompleted = false;
    for (const id of prev) {
      if (!next.has(id)) {
        justCompleted = true;
        break;
      }
    }
    prevErrorsRef.current = next;
    if (!justCompleted) return;
    if (orderedRequiredEmpty.length === 0) return;
    // Slight delay so React paints the filled state before scrolling.
    const t = setTimeout(() => scrollAndFocus(orderedRequiredEmpty[0]), 120);
    return () => clearTimeout(t);
  }, [fieldErrors, orderedRequiredEmpty, scrollAndFocus]);

  // B3: keyboard navigation on the main signing area.
  const handleKeyNav = useCallback(
    (e: React.KeyboardEvent) => {
      // '?' opens shortcuts help, unless typing in a text field.
      if (e.key === "?" && !(e.target instanceof HTMLTextAreaElement)) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          setHelpOpen(true);
          return;
        }
      }
      if ((e.key === "t" || e.key === "T") && !e.ctrlKey && !e.metaKey) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        const editable =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          (e.target as HTMLElement | null)?.isContentEditable;
        if (!editable) {
          e.preventDefault();
          setThumbsOpen((v) => !v);
          return;
        }
      }

      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      // Find which field currently has focus.
      const wrapper = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-field-id]");
      if (!wrapper) return;
      const currentId = wrapper.getAttribute("data-field-id");
      if (!currentId) return;
      const list = orderedAllVisible;
      const idx = list.indexOf(currentId);
      if (idx < 0) return;
      const nextIdx =
        e.key === "ArrowDown" ? Math.min(list.length - 1, idx + 1) : Math.max(0, idx - 1);
      if (nextIdx === idx) return;
      e.preventDefault();
      scrollAndFocus(list[nextIdx]);
    },
    [orderedAllVisible, scrollAndFocus],
  );

  const submitMutation = useMutation({
    mutationFn: async () => {
      const payload = parsedFields
        .map((f) => {
          const visible = visibilityById.get(f.id) ?? true;
          if (!visible) return null;
          const v = values[f.id];
          const isImg = f.field_type === "signature" || f.field_type === "initials";
          const isIdDoc = f.field_type === "signer_id_document";
          if (isImg || isIdDoc) {
            if (!v?.dataUrl && !f.existing_value_image_path) return null;
            return {
              field_id: f.id,
              value_image_data_url: v?.dataUrl ?? null,
              value_text: null,
            };
          }
          if (f.field_type === "date_signed") {
            return {
              field_id: f.id,
              value_text: new Date().toISOString().slice(0, 10),
            };
          }
          const text = v?.text ?? f.existing_value_text ?? "";
          if (!text && !f.is_required) return null;
          return { field_id: f.id, value_text: text };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
      return submit({ data: { token, values: payload } });
    },
    onSuccess: (res) => {
      if (!res.ok) {
        toast.error(res.errors.join(", "));
        return;
      }
      toast.success("Document signed");
      draft.clear();
      queryClient.invalidateQueries({ queryKey: ["esign-signer", token] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const declineMutation = useMutation({
    mutationFn: () => decline({ data: { token, reason: declineReason } }),
    onSuccess: () => {
      toast.success("You have declined to sign");
      setDeclineOpen(false);
      draft.clear();
      queryClient.invalidateQueries({ queryKey: ["esign-signer", token] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <CenterMsg title="Loading document…" />;
  }
  if (error) {
    return (
      <CenterMsg
        icon={<XCircle className="h-10 w-10 text-destructive" />}
        title="Cannot open signing session"
        body={(error as Error).message}
      />
    );
  }
  if (!data) return null;

  if (data.recipient.completed_at) {
    return (
      <CenterMsg
        icon={<CheckCircle2 className="h-10 w-10 text-emerald-500" />}
        title="You're all set"
        body={`You completed "${data.envelope.title}" on ${new Date(
          data.recipient.completed_at,
        ).toLocaleString()}.`}
      />
    );
  }
  if (!data.is_active) {
    return (
      <CenterMsg
        icon={<ShieldCheck className="h-10 w-10 text-primary" />}
        title="Waiting your turn"
        body="An earlier signer has not finished yet. We'll email you when it's your turn."
      />
    );
  }

  const totalRequired = parsedFields.filter((f) => {
    const visible = visibilityById.get(f.id) ?? true;
    return visible && f.is_required;
  }).length;
  const completedRequired = Math.max(0, totalRequired - requiredRemaining);
  const progressPct =
    totalRequired === 0 ? 100 : Math.round((completedRequired / totalRequired) * 100);

  // ------------------------------------------------------------------ shell
  const totalRequiredAll = parsedFields.filter(
    (f) => f.is_required && (visibilityById.get(f.id) ?? true),
  ).length;
  const primary = (() => {
    if (orderedRequiredEmpty.length === 0) {
      return {
        label: submitMutation.isPending ? "Submitting…" : "Save & Submit",
        onClick: () => setConfirmOpen(true),
        disabled: submitMutation.isPending,
      };
    }
    if (orderedRequiredEmpty.length === totalRequiredAll) {
      return {
        label: "Start Signing",
        onClick: () => scrollAndFocus(orderedRequiredEmpty[0]),
        disabled: false,
      };
    }
    return {
      label: `Next Required (${orderedRequiredEmpty.length})`,
      onClick: () => scrollAndFocus(orderedRequiredEmpty[0]),
      disabled: false,
    };
  })();

  return (
    <div className="esign-scope h-screen w-screen flex flex-col overflow-hidden bg-slate-900 text-slate-100">
      {/* Skip-to-next-required link for keyboard / screen-reader users. */}
      <a
        href="#esign-next-required"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-emerald-500 focus:text-slate-950 focus:px-3 focus:py-2 focus:rounded-md focus:text-sm"
        onClick={(e) => {
          e.preventDefault();
          if (orderedRequiredEmpty.length > 0) scrollAndFocus(orderedRequiredEmpty[0]);
        }}
      >
        Skip to next required field
      </a>

      <SignHeaderBar
        title={data.envelope.title}
        recipientName={data.recipient.full_name}
        recipientEmail={data.recipient.email}
        recipientColor={data.recipient.color_hex}
        pageIndex={viewer.currentPage}
        pageCount={pageCount}
        primaryLabel={primary.label}
        primaryDisabled={primary.disabled}
        onPrimary={primary.onClick}
        onDecline={() => setDeclineOpen(true)}
        declineDisabled={declineMutation.isPending}
        readingMode={readingMode}
        onToggleReadingMode={toggleReadingMode}
        progressPct={progressPct}
        trailing={
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setHelpOpen(true)}
              className="h-9 w-9 text-slate-300 hover:bg-slate-800 hover:text-slate-50"
              title="Keyboard shortcuts (?)"
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="h-4 w-4" />
            </Button>
            {docs.length > 1 && (
              <Select value={currentDocId ?? undefined} onValueChange={(v) => setActiveDocId(v)}>
                <SelectTrigger className="h-9 w-28 sm:w-44 bg-slate-900 border-slate-700 text-slate-200 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {docs.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        }
      />

      <div className="flex-1 min-h-0 flex relative">
        {/* LEFT — thumbnails (hidden in reading mode) */}
        <aside
          className={cn(
            "shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out",
            "border-r border-slate-800 bg-slate-950/40",
            readingMode ? "hidden" : leftOpen ? "w-60" : "w-0",
          )}
          aria-label="Page thumbnails"
        >
          <div className="w-60 h-full flex flex-col">
            <div className="px-4 py-3 border-b border-slate-800 shrink-0">
              <h2 className="text-xs font-semibold tracking-wide uppercase text-slate-400">
                Pages
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">{pageCount} total · click to jump</p>
            </div>
            <div className="flex-1 overflow-hidden">
              {currentDoc && (
                <PageThumbnailRail
                  url={currentDoc.signed_url}
                  pageCount={pageCount}
                  pageSizes={pageSizes}
                  viewer={viewer}
                  width={240}
                  className="h-full !border-r-0 !bg-transparent"
                />
              )}
            </div>
          </div>
        </aside>
        {!readingMode && (
          <CollapseEdgeButton
            side="left"
            open={leftOpen}
            onToggle={() => setLeftOpen((v) => !v)}
            offset={leftOpen ? 240 - 10 : -10}
          />
        )}

        {/* CENTER — PDF kiosk */}
        <main
          ref={stageRef}
          onKeyDown={handleKeyNav}
          className="flex-1 h-full overflow-y-auto bg-slate-800/90 relative select-none px-6 py-6"
        >
          <span id="esign-next-required" tabIndex={-1} className="sr-only" />

          {data.envelope.message && !readingMode && (
            <div className="mx-auto max-w-4xl mb-4 rounded-md border border-slate-700/60 bg-slate-900/60 px-4 py-3 text-xs text-slate-200">
              <p className="font-semibold mb-1 text-slate-100">Message from sender</p>
              <p className="whitespace-pre-wrap text-slate-300">{data.envelope.message}</p>
            </div>
          )}

          {currentDoc &&
            Array.from({ length: pageCount }).map((_, pageIndex) => {
              const pageFields = parsedFields
                .filter((f) => f.document_id === currentDocId && f.page_index === pageIndex)
                .sort((a, b) => (a.tab_order ?? 9999) - (b.tab_order ?? 9999));
              const fallback = pageSizes[0] ?? {
                width: renderWidth ?? 800,
                height: (renderWidth ?? 800) * 1.294,
              };
              const thisPageSize: PageSize = pageSizes[pageIndex] ?? fallback;
              return (
                <div
                  key={`${currentDoc.id}-${pageIndex}`}
                  ref={(el) => setPageRef(pageIndex, el)}
                  className="bg-white shadow-2xl mx-auto mb-8 relative border border-slate-700/40 rounded-sm overflow-hidden"
                  style={{ width: thisPageSize.width, maxWidth: "100%" }}
                >
                  <LazyPdfPage
                    url={currentDoc.signed_url}
                    pageIndex={pageIndex}
                    renderWidth={renderWidth}
                    eager={pageIndex === 0}
                    reservedSize={thisPageSize}
                    onReady={(total: number, size: PageSize) => {
                      setPageCount(total);
                      setPageSizes((prev) =>
                        prev[pageIndex]?.width === size.width &&
                        prev[pageIndex]?.height === size.height
                          ? prev
                          : { ...prev, [pageIndex]: size },
                      );
                    }}
                  />
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      width: thisPageSize.width,
                      height: thisPageSize.height,
                    }}
                  >
                    {pageFields.map((f) => {
                      const visible = visibilityById.get(f.id) ?? true;
                      if (!visible) return null;
                      const v = values[f.id];
                      const left = f.x_pt * thisPageSize.width;
                      const top = f.y_pt * thisPageSize.height;
                      const w = f.width_pt * thisPageSize.width;
                      const h = f.height_pt * thisPageSize.height;
                      const color = data.recipient.color_hex;
                      const filled =
                        f.field_type === "signature" ||
                        f.field_type === "initials" ||
                        f.field_type === "signer_id_document"
                          ? !!(
                              v?.dataUrl ||
                              f.existing_value_image_url ||
                              f.existing_value_image_path
                            )
                          : f.field_type === "date_signed"
                            ? true
                            : !!(v?.text ?? f.existing_value_text);
                      const err = fieldErrors.get(f.id) ?? null;
                      const showErr = !!err && v != null;
                      const borderColor = showErr ? "#dc2626" : color;
                      const needsAttention = !filled && f.is_required && !showErr;
                      return (
                        <div
                          key={f.id}
                          ref={(el) => setFieldRef(f.id, el)}
                          data-field-id={f.id}
                          tabIndex={0}
                          className={
                            "absolute pointer-events-auto outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 " +
                            (needsAttention ? "esign-pulse-ring" : "")
                          }
                          title={f.opts?.tooltip ?? err ?? undefined}
                          style={{
                            left,
                            top,
                            width: w,
                            height: h,
                            minWidth: 44,
                            minHeight: 36,
                            borderRadius: 6,
                            border: `1.5px ${filled ? "solid" : "dashed"} ${borderColor}`,
                            background: filled ? "transparent" : `${borderColor}1a`,
                            transition: "background-color 200ms ease, border-color 200ms ease",
                          }}
                        >
                          <FieldEditor
                            field={f}
                            value={v}
                            existingImageUrl={f.existing_value_image_url}
                            recipientName={data.recipient.full_name}
                            recipientEmail={data.recipient.email}
                            options={f.opts}
                            onText={(text) =>
                              setValues((prev) => ({
                                ...prev,
                                [f.id]: { ...prev[f.id], text },
                              }))
                            }
                            onFile={(dataUrl) =>
                              setValues((prev) => ({
                                ...prev,
                                [f.id]: { ...prev[f.id], dataUrl },
                              }))
                            }
                            onOpenPad={() => setPadField(f.id)}
                          />
                          {showErr && (
                            <div className="absolute -bottom-4 left-0 text-[10px] text-destructive whitespace-nowrap">
                              {err}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

          <ZoomPill
            zoomPercent={viewer.zoomPercent}
            onZoomIn={viewer.zoomIn}
            onZoomOut={viewer.zoomOut}
            onFitWidth={() => viewer.setZoomMode("fit-width")}
          />
        </main>

        {!readingMode && (
          <CollapseEdgeButton
            side="right"
            open={rightOpen}
            onToggle={() => setRightOpen((v) => !v)}
            offset={rightOpen ? 288 - 10 : -10}
          />
        )}

        {/* RIGHT — audit timeline (hidden in reading mode) */}
        <aside
          className={cn(
            "shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out",
            "border-l border-slate-800 bg-slate-950/40",
            readingMode ? "hidden" : rightOpen ? "w-72" : "w-0",
          )}
          aria-label="Audit trail"
        >
          <AuditTimelineRail events={data.audit_log} recipients={data.all_recipients} />
        </aside>
      </div>

      {/* B4: reading-mode floating action cluster (Prev/Next required + Finish) */}
      {readingMode && (
        <ReadingActionCluster
          onPrev={() => gotoRequired(-1)}
          onNext={() => gotoRequired(1)}
          onFinish={primary.onClick}
          finishDisabled={primary.disabled}
          remaining={orderedRequiredEmpty.length}
        />
      )}

      <SignaturePad
        open={padField !== null}
        onClose={() => setPadField(null)}
        defaultName={data.recipient.full_name}
        title={
          padField && myFields.find((x) => x.id === padField)?.field_type === "initials"
            ? "Adopt your initials"
            : "Adopt your signature"
        }
        onConfirm={(dataUrl) => {
          if (!padField) return;
          setValues((prev) => ({
            ...prev,
            [padField]: { ...prev[padField], dataUrl },
          }));
        }}
      />

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline to sign</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder="Reason (shared with sender)"
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={4}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeclineOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => declineMutation.mutate()}
              disabled={declineReason.trim().length < 3 || declineMutation.isPending}
            >
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save &amp; submit your signature</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              By clicking <strong>Save &amp; Submit</strong>, you agree your electronic signature is
              the legal equivalent of your handwritten signature and consent to the electronic
              delivery of this document and any related communications.
            </p>
            {(() => {
              const remaining = data.all_recipients.filter(
                (r) =>
                  r.id !== data.recipient.id &&
                  !r.completed_at &&
                  (r.role === "signer" || r.role === "approver"),
              );
              if (remaining.length === 0) {
                return (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900 px-3 py-2 text-emerald-800 dark:text-emerald-200">
                    You're the last signer — submitting will complete the document and finalize the
                    signed PDF.
                  </div>
                );
              }
              const next =
                data.envelope.routing_mode === "sequential"
                  ? remaining.sort((a, b) => a.routing_order - b.routing_order)[0]
                  : null;
              return (
                <div className="rounded-md border bg-muted/40 px-3 py-2">
                  <p className="font-medium mb-1">What happens next</p>
                  {next ? (
                    <p className="text-muted-foreground">
                      <strong>{next.full_name}</strong> ({next.email}) will be notified by email
                      that it's their turn to sign.
                      {remaining.length > 1 && (
                        <> {remaining.length - 1} more signer(s) will follow.</>
                      )}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      {remaining.length} other signer(s) are signing in parallel and will be
                      reminded.
                    </p>
                  )}
                </div>
              );
            })()}
            <label className="flex items-start gap-2">
              <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
              <span className="text-muted-foreground">
                I agree to use electronic records and signatures (ESIGN / UETA).
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                submitMutation.mutate();
                setConfirmOpen(false);
              }}
              disabled={!consent || submitMutation.isPending}
            >
              Save &amp; Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <div className="text-sm space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Signing</div>
            <KeyRow keys={["Tab", "Shift+Tab"]} label="Move between fields" />
            <KeyRow keys={["↓", "↑"]} label="Next / previous field (when focused on a field)" />
            <KeyRow keys={["Enter"]} label="Open signature / activate field" />
            <KeyRow keys={["Esc"]} label="Close a dialog" />
            <KeyRow keys={["?"]} label="Show this help" />
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground pt-2">
              Document viewer
            </div>
            {PDF_VIEWER_SHORTCUTS.map((r) => (
              <KeyRow key={r.label} keys={r.keys} label={r.label} />
            ))}
          </div>

          <DialogFooter>
            <Button onClick={() => setHelpOpen(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KeyRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex gap-1">
        {keys.map((k) => (
          <kbd key={k} className="px-2 py-0.5 rounded border bg-muted text-[11px] font-mono">
            {k}
          </kbd>
        ))}
      </div>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function FieldEditor({
  field,
  value,
  existingImageUrl,
  recipientName,
  recipientEmail,
  options,
  onText,
  onFile,
  onOpenPad,
}: {
  field: {
    id: string;
    field_type: string;
    is_required: boolean;
    default_value: string | null;
  };
  value: LocalValue | undefined;
  existingImageUrl: string | null;
  recipientName: string;
  recipientEmail: string;
  options: FieldOptions | null;
  onText: (text: string) => void;
  onFile: (dataUrl: string) => void;
  onOpenPad: () => void;
}) {
  const t = field.field_type;
  if (t === "signature" || t === "initials") {
    const img = value?.dataUrl ?? existingImageUrl ?? null;
    return (
      <button
        type="button"
        onClick={onOpenPad}
        className="w-full h-full flex items-center justify-center text-xs font-medium"
        style={{ color: "#0b1437" }}
      >
        {img ? (
          <img src={img} alt="signature" className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="opacity-70">{t === "initials" ? "Initial" : "Sign here"}</span>
        )}
      </button>
    );
  }
  if (t === "signer_id_document") {
    const hasUpload = !!(value?.dataUrl || existingImageUrl);
    const mime = value?.dataUrl?.match(/^data:([^;]+);/)?.[1] ?? "";
    const isImage = mime.startsWith("image/") || (!mime && !!existingImageUrl);
    return (
      <label className="w-full h-full flex items-center justify-center cursor-pointer text-[10px] px-1 text-center gap-1 leading-tight">
        <input
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) {
              toast.error("ID file must be under 8 MB");
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result;
              if (typeof result === "string") onFile(result);
            };
            reader.readAsDataURL(file);
          }}
        />
        {hasUpload ? (
          isImage && value?.dataUrl ? (
            <img
              src={value.dataUrl}
              alt="ID document"
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              ✓ ID attached — click to replace
            </span>
          )
        ) : (
          <span className="opacity-80 font-medium">Upload ID (image or PDF)</span>
        )}
      </label>
    );
  }
  if (t === "date_signed") {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs px-1 text-foreground">
        {new Date().toLocaleDateString()}
      </div>
    );
  }
  if (t === "name") {
    return <div className="w-full h-full flex items-center px-1 text-xs">{recipientName}</div>;
  }
  if (t === "email") {
    return <div className="w-full h-full flex items-center px-1 text-xs">{recipientEmail}</div>;
  }
  if (t === "checkbox") {
    const checked = (value?.text ?? "") === "true";
    return (
      <button
        type="button"
        onClick={() => onText(checked ? "" : "true")}
        className="w-full h-full flex items-center justify-center"
      >
        <div className="h-4 w-4 rounded border border-foreground/60 flex items-center justify-center">
          {checked && <CheckCircle2 className="h-3 w-3 text-primary" />}
        </div>
      </button>
    );
  }
  if (t === "radio") {
    const choices = options?.choices ?? [];
    return (
      <Select value={value?.text ?? ""} onValueChange={onText}>
        <SelectTrigger className="w-full h-full border-0 bg-transparent px-1 text-xs">
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {choices.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No choices configured</div>
          ) : (
            choices.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    );
  }
  // text / company / title / attachment fallback
  return (
    <Input
      className="w-full h-full border-0 bg-transparent px-1 text-xs focus-visible:ring-0"
      value={value?.text ?? field.default_value ?? ""}
      onChange={(e) => onText(e.target.value)}
      placeholder={options?.tooltip ?? t}
    />
  );
}

function CenterMsg({
  title,
  body,
  icon,
}: {
  title: string;
  body?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        <div className="flex justify-center">
          {icon ?? <AlertCircle className="h-10 w-10 text-muted-foreground" />}
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-signer progress strip
// ---------------------------------------------------------------------------

type StripRecipient = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  routing_order: number;
  color_hex: string;
  completed_at: string | null;
};

function SignersStrip({
  recipients,
  currentRecipientId,
  routingMode,
  currentNode,
}: {
  recipients: StripRecipient[];
  currentRecipientId: string;
  routingMode: string;
  currentNode: number;
}) {
  const sorted = [...recipients].sort((a, b) => a.routing_order - b.routing_order);
  const signedCount = sorted.filter((r) => r.completed_at).length;
  const isSeq = routingMode === "sequential";
  const me = sorted.find((r) => r.id === currentRecipientId);
  const meIsDone = !!me?.completed_at;

  // Compute who is "current" and who is "next" based on routing mode.
  const pendingAfterMe = sorted.filter(
    (r) => !r.completed_at && r.status !== "declined" && r.id !== currentRecipientId,
  );
  let nextUp: StripRecipient | null = null;
  let nextUpAll: StripRecipient[] = [];
  if (isSeq) {
    // Next = lowest routing_order among pending, excluding me (since I'm the current actor in seq turn).
    nextUp =
      pendingAfterMe
        .filter((r) => r.routing_order > (me?.routing_order ?? currentNode))
        .sort((a, b) => a.routing_order - b.routing_order)[0] ?? null;
  } else {
    nextUpAll = pendingAfterMe;
  }

  const formatTs = (iso: string | null) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="esign-card px-4 py-3">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--esign-ink)]">
          <Users className="h-4 w-4 text-[var(--esign-primary)]" />
          Signers ({signedCount}/{sorted.length} signed)
        </div>
        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
          {isSeq ? "Sequential routing" : "Parallel routing"}
        </span>
      </div>
      <ol className="flex flex-wrap items-stretch gap-2">
        {sorted.map((r, idx) => {
          const isMe = r.id === currentRecipientId;
          const isDone = !!r.completed_at;
          const isDeclined = r.status === "declined";
          const isCurrent = isSeq
            ? r.routing_order === currentNode && !isDone
            : !isDone && !isDeclined;
          const isNext = nextUp?.id === r.id;
          const dotBg = isDeclined
            ? "#dc2626"
            : isDone
              ? "#16a34a"
              : isCurrent
                ? r.color_hex || "#2563eb"
                : isNext
                  ? "#f59e0b"
                  : "#cbd5e1";
          const label = isDeclined
            ? "Declined"
            : isDone
              ? `Signed · ${formatTs(r.completed_at)}`
              : isCurrent
                ? isMe
                  ? "Your turn"
                  : "Signing now"
                : isNext
                  ? "Next up"
                  : "Waiting";
          return (
            <li
              key={r.id}
              className={
                "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs " +
                (isMe
                  ? "border-[var(--esign-primary)] bg-[var(--esign-primary-soft)]"
                  : isNext
                    ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30"
                    : "border-[var(--esign-border)] bg-[var(--esign-surface)]")
              }
              title={`${r.full_name} <${r.email}> · ${label}`}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                style={{ background: dotBg }}
                aria-hidden
              >
                {isDone ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : isDeclined ? (
                  <XCircle className="h-3.5 w-3.5" />
                ) : (
                  idx + 1
                )}
              </span>
              <span className="flex flex-col leading-tight min-w-0">
                <span className="font-medium text-[var(--esign-ink)] truncate max-w-[180px]">
                  {r.full_name}
                  {isMe && (
                    <span className="ml-1 text-[10px] font-semibold text-[var(--esign-primary)]">
                      (you)
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                  {label}
                </span>
              </span>
              {isSeq && idx < sorted.length - 1 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground ml-1 shrink-0" />
              )}
            </li>
          );
        })}
      </ol>

      {/* Next-up banner */}
      <NextUpBanner
        isSeq={isSeq}
        meIsDone={meIsDone}
        meName={me?.full_name ?? "You"}
        nextUp={nextUp}
        nextUpAll={nextUpAll}
        pendingCount={pendingAfterMe.length + (meIsDone ? 0 : 1)}
        totalCount={sorted.length}
        signedCount={signedCount}
      />
    </div>
  );
}

function NextUpBanner({
  isSeq,
  meIsDone,
  meName,
  nextUp,
  nextUpAll,
  pendingCount,
  totalCount,
  signedCount,
}: {
  isSeq: boolean;
  meIsDone: boolean;
  meName: string;
  nextUp: StripRecipient | null;
  nextUpAll: StripRecipient[];
  pendingCount: number;
  totalCount: number;
  signedCount: number;
}) {
  const maskEmail = (email: string) => {
    const [user, domain] = email.split("@");
    if (!user || !domain) return email;
    const visible = user.slice(0, Math.min(2, user.length));
    return `${visible}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
  };

  let body: React.ReactNode;
  if (isSeq) {
    if (nextUp) {
      body = (
        <>
          <span className="font-medium text-[var(--esign-ink)]">Next: {nextUp.full_name}</span>{" "}
          <span className="text-muted-foreground">({maskEmail(nextUp.email)})</span> will receive an
          email invitation{" "}
          {meIsDone
            ? "shortly — your signature has been recorded."
            : "the moment you press Save & Submit."}
        </>
      );
    } else {
      body = meIsDone ? (
        <>
          All signers have completed. The document will be finalized and a certificate of completion
          sent to everyone.
        </>
      ) : (
        <>
          You are the <span className="font-medium">final signer</span>. The document will be
          finalized and distributed to all parties when you press Save & Submit.
        </>
      );
    }
  } else {
    // Parallel
    if (nextUpAll.length === 0) {
      body = meIsDone ? (
        <>All signers have completed. Finalizing the document now.</>
      ) : (
        <>
          You are the <span className="font-medium">last remaining signer</span>. Saving will
          finalize the document.
        </>
      );
    } else {
      const names = nextUpAll
        .slice(0, 3)
        .map((r) => r.full_name)
        .join(", ");
      const more = nextUpAll.length > 3 ? ` and ${nextUpAll.length - 3} more` : "";
      body = (
        <>
          Parallel routing: all recipients were notified at the same time.{" "}
          <span className="font-medium text-[var(--esign-ink)]">Still pending:</span> {names}
          {more}. Your submission does not block them.
        </>
      );
    }
  }

  return (
    <div className="mt-3 flex items-start gap-2 rounded-md border border-[var(--esign-border)] bg-[var(--esign-surface)] px-3 py-2 text-[12px] leading-snug text-[var(--esign-ink-soft)]">
      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--esign-primary)]" />
      <div className="flex-1">
        {body}
        <div className="mt-1 text-[10px] text-muted-foreground">
          {signedCount} of {totalCount} signed · {pendingCount} remaining
          {isSeq ? " · notified in order" : " · notified simultaneously"}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit Trail panel
// ---------------------------------------------------------------------------

const EVENT_LABELS: Record<string, string> = {
  envelope_created: "Document created",
  envelope_sent: "Document sent",
  envelope_completed: "Document completed",
  envelope_voided: "Document voided",
  envelope_expired: "Document expired",
  document_viewed: "Document viewed",
  recipient_completed: "Recipient signed",
  recipient_declined: "Recipient declined",
  reminder_sent: "Reminder sent",
  auth_passed: "Identity verified",
  auth_failed: "Identity check failed",
  auth_challenged: "Identity challenge issued",
  consent_accepted: "Consent accepted",
  certificate_generated: "Certificate generated",
  verification_scanned: "Certificate verified",
};

function AuditTrailPanel({
  events,
  recipients,
}: {
  events: Array<{
    id: string;
    event: string;
    actor_email: string | null;
    recipient_id: string | null;
    created_at: string;
    metadata_json: string | null;
  }>;
  recipients: StripRecipient[];
}) {
  const [open, setOpen] = useState(false);
  const rcpById = useMemo(() => {
    const m = new Map<string, StripRecipient>();
    for (const r of recipients) m.set(r.id, r);
    return m;
  }, [recipients]);
  const count = events.length;
  return (
    <div className="esign-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-medium text-[var(--esign-ink)]">
          <History className="h-4 w-4 text-[var(--esign-primary)]" />
          Audit trail
          <span className="text-[11px] text-muted-foreground font-normal">
            ({count} event{count === 1 ? "" : "s"})
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="border-t border-[var(--esign-border)] max-h-72 overflow-y-auto">
          {count === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground text-center">No events yet.</p>
          ) : (
            <ol className="divide-y divide-[var(--esign-border)]">
              {events.map((ev) => {
                const rcp = ev.recipient_id ? rcpById.get(ev.recipient_id) : null;
                const who = rcp?.full_name ?? ev.actor_email ?? "System";
                return (
                  <li key={ev.id} className="px-4 py-2.5 text-xs flex items-start gap-3">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium text-[var(--esign-ink)]">
                          {EVENT_LABELS[ev.event] ?? ev.event}
                        </span>
                        <span className="text-muted-foreground truncate">by {who}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {new Date(ev.created_at).toLocaleString()}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
