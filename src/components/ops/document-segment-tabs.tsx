import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/shared/utils";

import {
  categorisationConfigsQuery,
  categorisationResultsQuery,
} from "@/lib/queries/categorisation.queries";
import {
  confirmCategorisation,
  labelWithGemini,
  overrideCategorisation,
} from "@/lib/ops/categorisation.functions";

export function DocumentSegmentTabs({ attachmentId }: { attachmentId: string }) {
  const { data: results, isLoading } = useQuery(categorisationResultsQuery(attachmentId));
  const { data: configs } = useQuery(categorisationConfigsQuery());
  const qc = useQueryClient();

  const [activeIdx, setActiveIdx] = useState(0);

  const confirmFn = useServerFn(confirmCategorisation);
  const overrideFn = useServerFn(overrideCategorisation);
  const geminiLabelFn = useServerFn(labelWithGemini);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["categorisation-results", attachmentId] });

  const mConfirm = useMutation({
    mutationFn: (resultId: string) => confirmFn({ data: { resultId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Confirmed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mOverride = useMutation({
    mutationFn: (v: { resultId: string; newDocType: string; newCategory: string }) =>
      overrideFn({ data: v }),
    onSuccess: () => {
      invalidate();
      toast.success("Classification overridden");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mGemini = useMutation({
    mutationFn: (resultId: string) => geminiLabelFn({ data: { resultId } }),
    onSuccess: (r: any) => {
      invalidate();
      toast.success(
        `Gemini labelled as ${r.display_name ?? r.doc_type} (${r.confidence}% confidence)`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !results?.length) return null;

  const configMap = new Map((configs ?? []).map((c: any) => [c.doc_type, c]));

  if (results.length === 1) {
    return (
      <SegmentDetail
        result={results[0]}
        configMap={configMap}
        configs={configs ?? []}
        onConfirm={() => mConfirm.mutate(results[0].id)}
        onOverride={(docType, cat) =>
          mOverride.mutate({ resultId: results[0].id, newDocType: docType, newCategory: cat })
        }
        onLabelWithGemini={() => mGemini.mutate(results[0].id)}
        confirming={mConfirm.isPending}
        geminiLabelling={mGemini.isPending}
      />
    );
  }

  const active = results[activeIdx] ?? results[0];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto">
        {results.map((r: any, i: number) => {
          const cfg = configMap.get(r.doc_type);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={cn(
                "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                i === activeIdx
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {cfg?.display_name ?? r.doc_type ?? "Unknown"}
              {r.segment_pages && (
                <span className="ml-1 text-[10px] opacity-60">pp. {r.segment_pages}</span>
              )}
            </button>
          );
        })}
      </div>
      <SegmentDetail
        result={active}
        configMap={configMap}
        configs={configs ?? []}
        onConfirm={() => mConfirm.mutate(active.id)}
        onOverride={(docType, cat) =>
          mOverride.mutate({ resultId: active.id, newDocType: docType, newCategory: cat })
        }
        onLabelWithGemini={() => mGemini.mutate(active.id)}
        confirming={mConfirm.isPending}
        geminiLabelling={mGemini.isPending}
      />
    </div>
  );
}

function SegmentDetail({
  result,
  configMap,
  configs,
  onConfirm,
  onOverride,
  onLabelWithGemini,
  confirming,
  geminiLabelling,
}: {
  result: any;
  configMap: Map<string, any>;
  configs: any[];
  onConfirm: () => void;
  onOverride: (docType: string, category: string) => void;
  onLabelWithGemini: () => void;
  confirming: boolean;
  geminiLabelling: boolean;
}) {
  const cfg = configMap.get(result.doc_type);
  const [overrideType, setOverrideType] = useState("");

  const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
    auto: { label: "Auto", cls: "bg-blue-100 text-blue-800" },
    confirmed: { label: "Confirmed", cls: "bg-green-100 text-green-800" },
    overridden: { label: "Overridden", cls: "bg-amber-100 text-amber-800" },
    needs_review: { label: "Needs Review", cls: "bg-red-100 text-red-800" },
    gemini_labelled: { label: "Gemini", cls: "bg-purple-100 text-purple-800" },
  };

  const statusInfo = STATUS_LABEL[result.status] ?? STATUS_LABEL.auto;

  // Show Gemini button for segments that need a label or already have one (re-run).
  const canLabelWithGemini =
    result.status === "needs_review" ||
    result.status === "gemini_labelled" ||
    // also show for auto when confidence is low (< 70)
    (result.status === "auto" && result.confidence_score < 70);

  // Show confirm for auto and gemini_labelled.
  const canConfirm = result.status === "auto" || result.status === "gemini_labelled";

  // Override available for most statuses except already-confirmed.
  const canOverride =
    result.status === "auto" ||
    result.status === "needs_review" ||
    result.status === "gemini_labelled";

  return (
    <div className="rounded-md border p-3 space-y-3">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        {cfg && (
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: cfg.highlight_color }} />
        )}
        <span className="font-medium text-sm">
          {cfg?.display_name ?? result.doc_type ?? "Unclassified"}
        </span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {result.confidence_score}%
        </span>
        <Badge variant="secondary" className={cn("text-[10px]", statusInfo.cls)}>
          {statusInfo.label}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {result.detection_method}
        </Badge>
      </div>

      {result.mapped_category && (
        <p className="text-xs text-muted-foreground">Mapped to: {result.mapped_category}</p>
      )}

      {/* Gemini reasoning — shown when the label came from Gemini */}
      {result.detection_method === "gemini" &&
        result.signals_matched &&
        (() => {
          try {
            const parsed = JSON.parse(result.signals_matched);
            const reasoning = parsed?.[0];
            if (reasoning && typeof reasoning === "string" && reasoning.startsWith("gemini:")) {
              return (
                <p className="rounded-md bg-purple-50 px-2 py-1.5 text-[11px] text-purple-700 border border-purple-100">
                  <Sparkles className="inline h-3 w-3 mr-1 opacity-70" />
                  {reasoning.replace("gemini:", "").trim()}
                </p>
              );
            }
          } catch {}
          return null;
        })()}

      {result.signals_matched && result.detection_method !== "gemini" && (
        <div className="flex flex-wrap gap-1">
          {(JSON.parse(result.signals_matched) as string[]).map((s, i) => (
            <Badge key={i} variant="secondary" className="text-[10px]">
              {s}
            </Badge>
          ))}
        </div>
      )}

      {result.runner_up_type && (
        <p className="text-[10px] text-muted-foreground">
          Runner-up: {configMap.get(result.runner_up_type)?.display_name ?? result.runner_up_type} (
          {result.runner_up_score}%)
        </p>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* Gemini label button */}
        {canLabelWithGemini && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-purple-200 text-purple-700 hover:bg-purple-50"
            onClick={onLabelWithGemini}
            disabled={geminiLabelling}
            title={
              result.status === "gemini_labelled"
                ? "Re-run Gemini on this segment"
                : "Ask Gemini to classify this document"
            }
          >
            {geminiLabelling ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {geminiLabelling
              ? "Asking Gemini…"
              : result.status === "gemini_labelled"
                ? "Re-run Gemini"
                : "Label with Gemini"}
          </Button>
        )}

        {/* Confirm button */}
        {canConfirm && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1"
            onClick={onConfirm}
            disabled={confirming}
          >
            <Check className="h-3 w-3" /> Confirm
          </Button>
        )}

        {/* Override dropdown */}
        {canOverride && (
          <div className="flex items-center gap-1">
            <Select value={overrideType} onValueChange={setOverrideType}>
              <SelectTrigger className="h-7 w-40 text-xs">
                <SelectValue placeholder="Override to…" />
              </SelectTrigger>
              <SelectContent>
                {configs
                  .filter((c: any) => c.is_active)
                  .map((c: any) => (
                    <SelectItem key={c.doc_type} value={c.doc_type}>
                      {c.display_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {overrideType && (
              <Button
                size="sm"
                className="h-7"
                onClick={() => {
                  const oCfg = configMap.get(overrideType);
                  onOverride(overrideType, oCfg?.mapped_category ?? "");
                  setOverrideType("");
                }}
              >
                Apply
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
