import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Lock,
  Send,
  Target,
  UploadCloud,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/shared/utils";

export type WizardStep = "details" | "upload" | "recipients" | "fields" | "preview" | "review";

export const WIZARD_STEPS: WizardStep[] = [
  "details",
  "upload",
  "recipients",
  "fields",
  "preview",
  "review",
];

export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  details: "Details",
  upload: "Upload",
  recipients: "Recipients",
  fields: "Place fields",
  preview: "Preview",
  review: "Review & send",
};

export const WIZARD_STEP_HINTS: Record<WizardStep, string> = {
  details: "Title, target, routing",
  upload: "Add PDFs to the document",
  recipients: "Who signs and in what order",
  fields: "Drop signature, date, text fields",
  preview: "Scroll the full document stack",
  review: "Send and copy signing links",
};

export const WIZARD_STEP_ICONS: Record<WizardStep, LucideIcon> = {
  details: FileText,
  upload: UploadCloud,
  recipients: Users,
  fields: Target,
  preview: Eye,
  review: Send,
};

export type StepStatus = "complete" | "active" | "available" | "locked";

export function computeStepStatus(args: {
  current: WizardStep;
  hasEnvelope: boolean;
  documentCount: number;
  recipientCount: number;
  hasFields: boolean;
}): Record<WizardStep, StepStatus> {
  const { current, hasEnvelope, documentCount, recipientCount, hasFields } = args;
  const unlocked: Record<WizardStep, boolean> = {
    details: true,
    upload: hasEnvelope,
    recipients: hasEnvelope && documentCount > 0,
    fields: hasEnvelope && documentCount > 0 && recipientCount > 0,
    preview: hasEnvelope && hasFields,
    review: hasEnvelope && hasFields,
  };
  const currentIdx = WIZARD_STEPS.indexOf(current);
  const out = {} as Record<WizardStep, StepStatus>;
  WIZARD_STEPS.forEach((step, idx) => {
    if (step === current) out[step] = "active";
    else if (idx < currentIdx && unlocked[step]) out[step] = "complete";
    else if (unlocked[step]) out[step] = "available";
    else out[step] = "locked";
  });
  return out;
}

export function WizardRail({
  current,
  status,
  collapsed,
  onToggleCollapsed,
  onJump,
  envelopeTitle,
  envelopeStatus,
  savedHint,
}: {
  current: WizardStep;
  status: Record<WizardStep, StepStatus>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onJump: (step: WizardStep) => void;
  envelopeTitle?: string | null;
  envelopeStatus?: string | null;
  savedHint?: string | null;
}) {
  return (
    <aside
      aria-label="Document wizard steps"
      className={cn(
        "h-full shrink-0 border-r border-slate-200 bg-white flex flex-col justify-between",
        "transition-[width] duration-300 ease-in-out overflow-hidden",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Top: envelope identity (expanded only) */}
      <div className={cn("px-4 pt-4", collapsed && "px-2")}>
        {collapsed ? (
          <div className="h-9 flex items-center justify-center">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" aria-hidden />
          </div>
        ) : (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              Document
            </div>
            <div className="text-sm font-semibold text-slate-900 truncate">
              {envelopeTitle?.trim() ? envelopeTitle : "Untitled draft"}
            </div>
            {envelopeStatus && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                {envelopeStatus}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Middle: steps — evenly distributed to fill height */}
      <nav
        className={cn(
          "flex-1 min-h-0 flex flex-col justify-evenly",
          collapsed ? "px-2 py-2" : "px-3 py-2",
        )}
      >
        {WIZARD_STEPS.map((step, idx) => {
          const s = status[step];
          const clickable = s !== "locked";
          const Icon = WIZARD_STEP_ICONS[step];

          if (collapsed) {
            return (
              <button
                key={step}
                type="button"
                onClick={() => clickable && onJump(step)}
                disabled={!clickable}
                aria-current={step === current ? "step" : undefined}
                title={`${idx + 1}. ${WIZARD_STEP_LABELS[step]}`}
                aria-label={WIZARD_STEP_LABELS[step]}
                className={cn(
                  "mx-auto h-11 w-11 rounded-xl flex items-center justify-center transition-all",
                  s === "active" &&
                    "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-white shadow",
                  s === "complete" && "bg-emerald-500 text-white hover:bg-emerald-600",
                  s === "available" && "bg-slate-100 text-slate-700 hover:bg-slate-200",
                  s === "locked" && "bg-slate-50 text-slate-300 cursor-not-allowed",
                )}
              >
                {s === "complete" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Icon className="h-5 w-5" />
                )}
              </button>
            );
          }

          return (
            <button
              key={step}
              type="button"
              onClick={() => clickable && onJump(step)}
              disabled={!clickable}
              aria-current={step === current ? "step" : undefined}
              className={cn(
                "group relative flex items-center gap-3 w-full text-left rounded-lg px-2.5 py-2 transition-colors",
                s === "active" && "bg-primary/10 text-primary",
                s === "complete" && "hover:bg-slate-50 text-slate-800",
                s === "available" && "hover:bg-slate-50 text-slate-700",
                s === "locked" && "text-slate-400 cursor-not-allowed",
              )}
            >
              {s === "active" && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-primary"
                />
              )}
              <StepBadge index={idx + 1} status={s} icon={Icon} />
              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    "text-sm leading-tight",
                    s === "active" ? "font-semibold" : "font-medium",
                  )}
                >
                  {WIZARD_STEP_LABELS[step]}
                </div>
                <div className="text-[11px] text-slate-500 truncate">{WIZARD_STEP_HINTS[step]}</div>
              </div>
              <StepStatusDot status={s} />
            </button>
          );
        })}
      </nav>

      {/* Footer: collapse toggle + saved hint */}
      <div
        className={cn(
          "border-t border-slate-100",
          collapsed ? "p-2" : "px-4 py-3 flex items-center justify-between gap-2",
        )}
      >
        {!collapsed && (
          <span className="text-[11px] text-slate-500 truncate">
            {savedHint ?? "All changes save automatically."}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expand steps" : "Collapse steps"}
          aria-label={collapsed ? "Expand steps" : "Collapse steps"}
          className={cn(
            "h-8 w-8 rounded-md border border-slate-200 bg-white shadow-sm flex items-center justify-center hover:bg-slate-50 shrink-0",
            collapsed && "mx-auto",
          )}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-slate-600" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-slate-600" />
          )}
        </button>
      </div>
    </aside>
  );
}

function StepBadge({
  index,
  status,
  icon: Icon,
}: {
  index: number;
  status: StepStatus;
  icon: LucideIcon;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold border",
        status === "active" && "border-primary bg-primary text-primary-foreground",
        status === "complete" && "border-emerald-500 bg-emerald-500 text-white",
        status === "available" && "border-slate-300 bg-white text-slate-700",
        status === "locked" && "border-slate-200 bg-slate-50 text-slate-400",
      )}
    >
      {status === "complete" ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : status === "active" ? (
        <Icon className="h-3.5 w-3.5" />
      ) : (
        index
      )}
    </span>
  );
}

function StepStatusDot({ status }: { status: StepStatus }) {
  if (status === "complete") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "locked") return <Lock className="h-3.5 w-3.5 text-slate-300" />;
  return null;
}
