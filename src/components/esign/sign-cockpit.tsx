/**
 * Three-pane signing cockpit chrome for /sign/$token.
 *
 * This file owns ONLY the layout shell (header bar, collapsible rails, edge
 * toggle, zoom pill, audit timeline). The signing business logic — token
 * auth, signer session loading, field validation, draft autosave, submit /
 * decline mutations — stays in `routes/sign/$token.tsx` untouched.
 */
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  BookOpenCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Eye,
  FileSignature,
  Mail,
  Maximize2,
  Minus,
  PenLine,
  Plus,
  ShieldCheck,
  XCircle,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

const LS_LEFT = "esign:cockpit:left";
const LS_RIGHT = "esign:cockpit:right";

export function useCockpitCollapse() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  useEffect(() => {
    try {
      const isMobile =
        typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
      if (isMobile) {
        setLeftOpen(false);
        setRightOpen(false);
        return;
      }
      const l = localStorage.getItem(LS_LEFT);
      const r = localStorage.getItem(LS_RIGHT);
      if (l != null) setLeftOpen(l === "1");
      if (r != null) setRightOpen(r === "1");
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_LEFT, leftOpen ? "1" : "0");
    } catch {
      /* noop */
    }
  }, [leftOpen]);
  useEffect(() => {
    try {
      localStorage.setItem(LS_RIGHT, rightOpen ? "1" : "0");
    } catch {
      /* noop */
    }
  }, [rightOpen]);

  return { leftOpen, setLeftOpen, rightOpen, setRightOpen };
}

// ---------------------------------------------------------------------------
// Header bar
// ---------------------------------------------------------------------------

function ReadingModeToggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onToggle}
      aria-pressed={active}
      title={active ? "Exit reading mode" : "Reading mode"}
      aria-label={active ? "Exit reading mode" : "Enter reading mode"}
      className={cn(
        "h-9 w-9 border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-slate-50",
        active && "border-emerald-500 text-emerald-400 hover:text-emerald-300",
      )}
    >
      {active ? <BookOpenCheck className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
    </Button>
  );
}

export function SignHeaderBar({
  title,
  recipientName,
  recipientEmail,
  recipientColor,
  pageIndex,
  pageCount,
  primaryLabel,
  primaryDisabled,
  onPrimary,
  onDecline,
  declineDisabled,
  trailing,
  readingMode = false,
  onToggleReadingMode,
  progressPct = 0,
}: {
  title: string;
  recipientName: string;
  recipientEmail: string;
  recipientColor: string;
  pageIndex: number; // 0-based
  pageCount: number;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onPrimary: () => void;
  onDecline?: () => void;
  declineDisabled?: boolean;
  trailing?: React.ReactNode;
  readingMode?: boolean;
  onToggleReadingMode?: () => void;
  progressPct?: number;
}) {
  // Slim reading-mode bar: title + progress + finish + exit toggle only.
  if (readingMode) {
    return (
      <header className="h-9 shrink-0 border-b border-slate-800 bg-slate-950/80 backdrop-blur flex items-center px-4 gap-3">
        <span className="text-[11px] font-medium text-slate-300 truncate max-w-[30ch]">
          {title}
        </span>
        <div className="flex items-center gap-2 min-w-0 flex-1 max-w-xs">
          <div className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-slate-400 shrink-0">{progressPct}%</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {onToggleReadingMode && <ReadingModeToggle active onToggle={onToggleReadingMode} />}
          <Button
            size="sm"
            onClick={onPrimary}
            disabled={primaryDisabled}
            className="h-7 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium text-[11px] px-3"
          >
            {primaryLabel}
          </Button>
        </div>
      </header>
    );
  }

  return (
    <header className="h-14 shrink-0 border-b border-slate-800 bg-slate-950/80 backdrop-blur flex items-center px-4 gap-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-8 w-8 rounded-md bg-slate-800 flex items-center justify-center shrink-0">
          <FileSignature className="h-4 w-4 text-slate-200" />
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-slate-100 truncate leading-tight">{title}</h1>
          <p className="text-[11px] text-slate-400 truncate leading-tight">
            Signing as{" "}
            <span className="font-medium" style={{ color: recipientColor }}>
              {recipientName}
            </span>
            <span className="hidden sm:inline"> · {recipientEmail}</span>
          </p>
        </div>
      </div>

      <div className="hidden md:flex items-center gap-2 text-xs text-slate-300 tabular-nums shrink-0">
        <span className="font-medium text-slate-200">
          Page {Math.min(pageIndex + 1, Math.max(pageCount, 1))}
        </span>
        <span className="text-slate-500">of {Math.max(pageCount, 1)}</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {trailing}
        {onToggleReadingMode && <ReadingModeToggle active={false} onToggle={onToggleReadingMode} />}
        {onDecline && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDecline}
            disabled={declineDisabled}
            className="h-9 border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-slate-50"
          >
            Decline
          </Button>
        )}
        <Button
          size="sm"
          onClick={onPrimary}
          disabled={primaryDisabled}
          className="h-9 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium"
        >
          {primaryLabel}
        </Button>
      </div>
    </header>
  );
}

// Floating bottom-right action cluster for reading mode: Prev required ↑ /
// Next required ↓ / Finish. Stays reachable when side chrome is hidden.
export function ReadingActionCluster({
  onPrev,
  onNext,
  onFinish,
  remaining,
  finishDisabled,
}: {
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
  remaining: number;
  finishDisabled?: boolean;
}) {
  return (
    <div className="fixed bottom-5 right-5 z-30 flex flex-col items-end gap-2">
      <div className="flex flex-col overflow-hidden rounded-full border border-slate-700 bg-slate-900/95 shadow-xl backdrop-blur">
        <button
          type="button"
          onClick={onPrev}
          className="flex h-10 w-10 items-center justify-center text-slate-300 hover:bg-slate-800"
          aria-label="Previous required field"
          title="Previous required field"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
        <div className="h-px bg-slate-700" />
        <button
          type="button"
          onClick={onNext}
          className="flex h-10 w-10 items-center justify-center text-slate-300 hover:bg-slate-800"
          aria-label="Next required field"
          title="Next required field"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      </div>
      <button
        type="button"
        onClick={onFinish}
        disabled={finishDisabled}
        className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2.5 text-xs font-semibold text-slate-950 shadow-xl hover:bg-emerald-400 disabled:opacity-50"
      >
        <CheckCircle2 className="h-4 w-4" />
        {remaining > 0 ? `Finish (${remaining} left)` : "Finish & sign"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edge collapse toggle (floating chevron on rail border)
// ---------------------------------------------------------------------------

export function CollapseEdgeButton({
  side,
  open,
  onToggle,
  offset,
}: {
  /** Which rail this button toggles. The button lives at the inner border. */
  side: "left" | "right";
  open: boolean;
  onToggle: () => void;
  /** Distance from the matching edge, in px. */
  offset: number;
}) {
  // Chevron points "outward" when open (collapse), "inward" when closed (expand).
  const Icon =
    side === "left" ? (open ? ChevronLeft : ChevronRight) : open ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? "Collapse panel" : "Expand panel"}
      title={open ? "Collapse panel" : "Expand panel"}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 z-30",
        "h-12 w-5 flex items-center justify-center",
        "rounded-md border border-slate-700 bg-slate-900/90 text-slate-300",
        "shadow-md hover:bg-slate-800 hover:text-slate-50",
        "transition-[left,right] duration-300 ease-in-out",
      )}
      style={side === "left" ? { left: offset } : { right: offset }}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Floating zoom pill (center kiosk)
// ---------------------------------------------------------------------------

export function ZoomPill({
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onFitWidth,
}: {
  zoomPercent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
}) {
  return (
    <div
      className={cn(
        "absolute bottom-6 left-1/2 -translate-x-1/2 z-20",
        "bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-full",
        "border border-slate-700/60 shadow-xl",
        "flex items-center gap-1",
      )}
      role="toolbar"
      aria-label="Document view controls"
    >
      <Button
        size="icon"
        variant="ghost"
        onClick={onZoomOut}
        className="h-7 w-7 text-slate-200 hover:bg-slate-800 hover:text-slate-50"
        title="Zoom out"
        aria-label="Zoom out"
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="tabular-nums text-xs text-slate-300 w-11 text-center">{zoomPercent}%</span>
      <Button
        size="icon"
        variant="ghost"
        onClick={onZoomIn}
        className="h-7 w-7 text-slate-200 hover:bg-slate-800 hover:text-slate-50"
        title="Zoom in"
        aria-label="Zoom in"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
      <div className="h-4 w-px bg-slate-700 mx-1" aria-hidden />
      <Button
        size="icon"
        variant="ghost"
        onClick={onFitWidth}
        className="h-7 w-7 text-slate-200 hover:bg-slate-800 hover:text-slate-50"
        title="Fit to width"
        aria-label="Fit to width"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit timeline (right rail)
// ---------------------------------------------------------------------------

type EventTone = "slate" | "blue" | "emerald" | "amber" | "rose";

const EVENT_META: Record<string, { icon: LucideIcon; tone: EventTone; label: string }> = {
  envelope_created: { icon: FileSignature, tone: "slate", label: "Document created" },
  envelope_sent: { icon: Mail, tone: "blue", label: "Document sent" },
  envelope_completed: {
    icon: CheckCircle2,
    tone: "emerald",
    label: "Document completed",
  },
  envelope_voided: { icon: XCircle, tone: "rose", label: "Document voided" },
  envelope_expired: { icon: Clock, tone: "amber", label: "Document expired" },
  document_viewed: { icon: Eye, tone: "slate", label: "Document viewed" },
  recipient_completed: {
    icon: CheckCircle2,
    tone: "emerald",
    label: "Recipient signed",
  },
  recipient_declined: { icon: XCircle, tone: "rose", label: "Recipient declined" },
  reminder_sent: { icon: Mail, tone: "amber", label: "Reminder sent" },
  auth_passed: { icon: ShieldCheck, tone: "emerald", label: "Identity verified" },
  auth_failed: { icon: XCircle, tone: "rose", label: "Identity check failed" },
  auth_challenged: {
    icon: ShieldCheck,
    tone: "amber",
    label: "Identity challenge issued",
  },
  consent_accepted: { icon: CheckCircle2, tone: "emerald", label: "Consent accepted" },
  certificate_generated: {
    icon: ShieldCheck,
    tone: "emerald",
    label: "Certificate generated",
  },
  verification_scanned: {
    icon: ShieldCheck,
    tone: "slate",
    label: "Certificate verified",
  },
  field_filled: { icon: PenLine, tone: "slate", label: "Field filled" },
};

const TONE_DOT: Record<EventTone, string> = {
  slate: "bg-slate-700 text-slate-200 ring-slate-600",
  blue: "bg-blue-500/20 text-blue-300 ring-blue-500/40",
  emerald: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40",
  amber: "bg-amber-500/20 text-amber-300 ring-amber-500/40",
  rose: "bg-rose-500/20 text-rose-300 ring-rose-500/40",
};

type AuditEvent = {
  id: string;
  event: string;
  actor_email: string | null;
  recipient_id: string | null;
  created_at: string;
  metadata_json: string | null;
};

type RecipientLite = {
  id: string;
  full_name: string;
  email: string;
};

export function AuditTimelineRail({
  events,
  recipients,
}: {
  events: AuditEvent[];
  recipients: RecipientLite[];
}) {
  const rcpById = useMemo(() => {
    const m = new Map<string, RecipientLite>();
    for (const r of recipients) m.set(r.id, r);
    return m;
  }, [recipients]);

  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [events],
  );

  return (
    <div className="h-full w-72 flex flex-col">
      <div className="px-4 py-3 border-b border-slate-800 shrink-0">
        <h2 className="text-xs font-semibold tracking-wide uppercase text-slate-400">
          Audit trail
        </h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {sorted.length} event{sorted.length === 1 ? "" : "s"} · live
        </p>
      </div>
      <ol className="flex-1 overflow-y-auto p-4 space-y-3 relative">
        {sorted.length === 0 && (
          <li className="text-xs text-slate-500 text-center py-6">No events yet.</li>
        )}
        {sorted.map((ev, i) => {
          const meta = EVENT_META[ev.event] ?? {
            icon: Clock,
            tone: "slate" as const,
            label: ev.event,
          };
          const Icon = meta.icon;
          const rcp = ev.recipient_id ? rcpById.get(ev.recipient_id) : null;
          const email = rcp?.email ?? ev.actor_email ?? null;
          const isLast = i === sorted.length - 1;
          let ip: string | null = null;
          try {
            if (ev.metadata_json) {
              const m = JSON.parse(ev.metadata_json) as Record<string, unknown>;
              const raw = m.ip ?? m.ip_address ?? m.remote_ip;
              if (typeof raw === "string") ip = raw;
            }
          } catch {
            /* noop */
          }
          return (
            <li key={ev.id} className="flex gap-3 relative">
              {/* connector */}
              {!isLast && (
                <span
                  aria-hidden
                  className="absolute left-[11px] top-6 bottom-[-12px] w-px bg-slate-800"
                />
              )}
              <span
                className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center ring-1 shrink-0 relative z-10",
                  TONE_DOT[meta.tone],
                )}
              >
                <Icon className="h-3 w-3" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-100 leading-tight">{meta.label}</p>
                {(rcp || email) && (
                  <p className="text-[11px] text-slate-400 truncate">{rcp?.full_name ?? email}</p>
                )}
                <p className="text-[10px] text-slate-500 mt-0.5">{formatRelative(ev.created_at)}</p>
                {ip && (
                  <code className="inline-block mt-1 font-mono text-[10px] bg-slate-800 px-1 py-0.5 rounded text-slate-300">
                    {ip}
                  </code>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
