import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, RotateCcw, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getDeploymentForReview,
  gradeDeployment,
  returnDeployment,
} from "@/lib/organizer/tracking.functions";
import { AnswerHistoryPopover } from "@/components/organizer/answer-history-popover";
import { SubmittedAnswerView } from "@/components/organizer/submitted-answer-view";

export const Route = createFileRoute("/organizer/review/$deploymentId")({
  component: () => (
    <AuthGuard>
      <AppShell
        crumbs={[
          { label: "Organizer", to: "/organizer" },
          { label: "Tracking", to: "/organizer/tracking" },
          { label: "Review" },
        ]}
      >
        <ReviewPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function ReviewPage() {
  const { deploymentId } = Route.useParams();
  const qc = useQueryClient();
  const getCtx = useServerFn(getDeploymentForReview);
  const grade = useServerFn(gradeDeployment);
  const ret = useServerFn(returnDeployment);

  const { data, isLoading } = useQuery({
    queryKey: ["organizer", "review", deploymentId],
    queryFn: () => getCtx({ data: { id: deploymentId } }),
  });

  const [scoreOverride, setScoreOverride] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const computedScore = data?.computed_score ?? null;
  const maxScore = data?.max_score ?? null;
  const isExam = data?.template?.is_exam ?? false;

  const effectiveScore = useMemo(() => {
    if (scoreOverride.trim() !== "") {
      const n = Number(scoreOverride);
      return Number.isFinite(n) ? n : 0;
    }
    return computedScore ?? 0;
  }, [scoreOverride, computedScore]);

  const gradeMut = useMutation({
    mutationFn: () =>
      grade({
        data: {
          id: deploymentId,
          score: effectiveScore,
          breakdown: {
            computed: computedScore,
            max: maxScore,
            override: scoreOverride.trim() !== "" ? effectiveScore : null,
            per_block: (data?.per_block_score ?? []) as never,
          },
          notes: notes.trim() || null,
          per_block: (data?.per_block_score ?? []).map((s) => ({
            block_id: s.block_id,
            earned: s.earned,
            possible: s.possible,
            is_correct: s.correct,
          })),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizer", "review", deploymentId] });
      qc.invalidateQueries({ queryKey: ["organizer", "tracking"] });
      toast.success("Deployment graded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const returnMut = useMutation({
    mutationFn: () =>
      ret({
        data: { id: deploymentId, notes: notes.trim() || null },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["organizer", "review", deploymentId] });
      qc.invalidateQueries({ queryKey: ["organizer", "tracking"] });
      toast.success("Returned to assignee");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { deployment, template, blocks, responses, visible_block_ids, per_block_score, audit_log } =
    data;
  const visibleSet = new Set(visible_block_ids);
  const respMap = new Map(responses.map((r) => [r.block_id, r]));
  const scoreMap = new Map(per_block_score.map((s) => [s.block_id, s]));

  return (
    <>
      <PageHeader
        title={`Review: ${template.name}`}
        description={`Assignee: ${deployment.assignee_name ?? deployment.assignee_email ?? "—"} · v${deployment.template_version}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              title="Print or save as PDF"
            >
              <Printer className="h-4 w-4 mr-1" />
              Print / PDF
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/organizer/tracking">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="p-4 space-y-4">
            {blocks.map((b) => {
              const hidden = !visibleSet.has(b.id);
              if (b.block_type === "section" || b.block_type === "subsection") {
                if (hidden) return null;
                return (
                  <h3
                    key={b.id}
                    className="text-base font-semibold pt-3 border-t first:border-0 first:pt-0"
                  >
                    {b.question_text}
                  </h3>
                );
              }
              if (b.block_type === "info" || b.block_type === "divider") {
                if (hidden) return null;
                return (
                  <div key={b.id} className="text-xs italic text-muted-foreground">
                    {b.question_text}
                  </div>
                );
              }
              const r = respMap.get(b.id);
              const s = scoreMap.get(b.id);
              if (hidden) {
                return (
                  <div key={b.id} className="space-y-1 opacity-60 print:hidden">
                    <div className="flex items-start gap-2">
                      <div className="text-sm font-medium flex-1 text-muted-foreground line-through">
                        {b.question_text}
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        Skipped
                      </Badge>
                    </div>
                  </div>
                );
              }
              return (
                <div key={b.id} className="space-y-1">
                  <div className="flex items-start gap-2">
                    <div className="text-sm font-medium flex-1">
                      {b.question_text}
                      {b.is_required && <span className="text-destructive ml-1">*</span>}
                    </div>
                    {s && (
                      <Badge variant={s.correct ? "default" : "secondary"} className="text-[10px]">
                        {s.earned}/{s.possible}
                      </Badge>
                    )}
                    <AnswerHistoryPopover deploymentId={deploymentId} blockId={b.id} />
                  </div>
                  <div className="bg-muted/40 rounded px-3 py-2">
                    <SubmittedAnswerView
                      blockType={b.block_type}
                      config={(b.config_json as Record<string, unknown> | null) ?? null}
                      value={r?.value_json}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="text-xs uppercase text-muted-foreground">Deployment</div>
              <div className="text-sm">
                <div>
                  <span className="text-muted-foreground">Status:</span>{" "}
                  <span className="font-medium capitalize">
                    {deployment.status.replace("_", " ")}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Submitted:</span>{" "}
                  {deployment.submitted_at
                    ? new Date(deployment.submitted_at).toLocaleString()
                    : "—"}
                </div>
                {deployment.graded_at && (
                  <div>
                    <span className="text-muted-foreground">Graded:</span>{" "}
                    {new Date(deployment.graded_at).toLocaleString()}
                  </div>
                )}
                {deployment.score !== null && (
                  <div>
                    <span className="text-muted-foreground">Score:</span>{" "}
                    <span className="font-semibold">{deployment.score}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {isExam && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="text-xs uppercase text-muted-foreground">Scoring</div>
                <div className="text-sm">
                  Auto-computed:{" "}
                  <span className="font-semibold">
                    {computedScore ?? 0} / {maxScore ?? 0}
                  </span>
                </div>
                <div>
                  <Label htmlFor="score-override">Override score</Label>
                  <Input
                    id="score-override"
                    type="number"
                    placeholder={`${computedScore ?? 0}`}
                    value={scoreOverride}
                    onChange={(e) => setScoreOverride(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <Label htmlFor="notes">Reviewer notes</Label>
                <Textarea
                  id="notes"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional feedback for the assignee…"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => gradeMut.mutate()}
                  disabled={gradeMut.isPending}
                >
                  {gradeMut.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-1" />
                  )}
                  {isExam ? `Grade (${effectiveScore})` : "Mark graded"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => returnMut.mutate()}
                  disabled={returnMut.isPending}
                  title="Return to assignee for changes"
                >
                  {returnMut.isPending ? (
                    <Loader2 className="h-4 w-4" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Audit log</div>
              {audit_log.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">No reviewer actions yet.</div>
              ) : (
                <ul className="space-y-2 text-xs">
                  {audit_log.map((a) => (
                    <li key={a.id} className="border-l-2 border-muted pl-2 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium capitalize">{a.action.replace("_", " ")}</span>
                        <span className="text-muted-foreground">
                          {new Date(a.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        by {a.actor_name ?? a.actor_id.slice(0, 8)}
                      </div>
                      {a.notes && (
                        <div className="text-muted-foreground italic whitespace-pre-wrap break-words">
                          “{a.notes}”
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
