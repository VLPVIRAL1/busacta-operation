import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { DatabaseBackup } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { restoreDrillLogQuery } from "@/lib/queries/admin.queries";
import { safeHref } from "@/lib/routing/safe-href";

export const Route = createFileRoute("/admin/restore-drill")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/verify", search: { tab: "restore" } });
  },
});

type DrillRow = {
  id: string;
  drill_date: string;
  outcome: string;
  rto_minutes: number | null;
  rpo_minutes: number | null;
  evidence_url: string | null;
  notes: string | null;
};

export function RestoreDrillPage({ embedded = false }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const [drillDate, setDrillDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [outcome, setOutcome] = useState<"success" | "partial" | "failed">("success");
  const [rto, setRto] = useState("");
  const [rpo, setRpo] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [notes, setNotes] = useState("");

  const list = useQuery(restoreDrillLogQuery());

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("restore_drill_log" as never).insert({
        drill_date: drillDate,
        outcome,
        rto_minutes: rto ? Number(rto) : null,
        rpo_minutes: rpo ? Number(rpo) : null,
        evidence_url: evidenceUrl || null,
        notes: notes || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Drill logged");
      setRto("");
      setRpo("");
      setEvidenceUrl("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["restore-drill-log"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Annual restore drill"
          description="Evidence for SOC 2 A1.3 / business continuity. Capture every restore test."
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DatabaseBackup className="h-4 w-4" /> Log a drill
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Drill date</Label>
              <Input type="date" value={drillDate} onChange={(e) => setDrillDate(e.target.value)} />
            </div>
            <div>
              <Label>Outcome</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as typeof outcome)}
              >
                <option value="success">Success</option>
                <option value="partial">Partial</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <Label>Evidence URL</Label>
              <Input
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div>
              <Label>RTO (minutes)</Label>
              <Input type="number" value={rto} onChange={(e) => setRto(e.target.value)} />
            </div>
            <div>
              <Label>RPO (minutes)</Label>
              <Input type="number" value={rpo} onChange={(e) => setRpo(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Log drill"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Drill history</CardTitle>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <Skeleton className="h-32" />
          ) : (list.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No drills logged yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Outcome</th>
                    <th className="py-2 pr-3">RTO</th>
                    <th className="py-2 pr-3">RPO</th>
                    <th className="py-2 pr-3">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {(list.data ?? []).map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-1.5 pr-3 tabular-nums">{r.drill_date}</td>
                      <td className="py-1.5 pr-3">
                        <Badge variant={r.outcome === "success" ? "outline" : "destructive"}>
                          {r.outcome}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.rto_minutes ?? "—"}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{r.rpo_minutes ?? "—"}</td>
                      <td className="py-1.5 pr-3 text-xs">
                        {r.evidence_url && safeHref(r.evidence_url) ? (
                          <a
                            className="underline"
                            href={safeHref(r.evidence_url)}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            link
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
