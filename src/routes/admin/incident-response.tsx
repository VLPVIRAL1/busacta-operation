import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { incidentRecordsQuery } from "@/lib/queries/admin.queries";

export const Route = createFileRoute("/admin/incident-response")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/compliance", search: { tab: "incident" } });
  },
});

type IncidentRow = {
  id: string;
  occurred_at: string;
  severity: string;
  scenario: string;
  summary: string;
  status: string;
  is_tabletop: boolean;
  actions_taken: string | null;
  post_mortem: string | null;
};

export function IncidentResponsePage({ embedded = false }: { embedded?: boolean } = {}) {
  const qc = useQueryClient();
  const [scenario, setScenario] = useState("");
  const [summary, setSummary] = useState("");
  const [severity, setSeverity] = useState<"SEV-1" | "SEV-2" | "SEV-3" | "tabletop">("tabletop");
  const [actionsTaken, setActionsTaken] = useState("");
  const [postMortem, setPostMortem] = useState("");

  const list = useQuery(incidentRecordsQuery());

  const createIncident = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("incident_records" as never).insert({
        scenario,
        summary,
        severity,
        actions_taken: actionsTaken || null,
        post_mortem: postMortem || null,
        is_tabletop: severity === "tabletop",
        status: severity === "tabletop" ? "closed" : "open",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Incident recorded");
      setScenario("");
      setSummary("");
      setActionsTaken("");
      setPostMortem("");
      qc.invalidateQueries({ queryKey: ["incident-records"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to record"),
  });

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Incident response"
          description="Log security incidents and semi-annual tabletop drills (SOC 2 CC7.4 evidence)."
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> Record incident or tabletop
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tabletop">Tabletop drill</SelectItem>
                  <SelectItem value="SEV-3">SEV-3 (single tenant)</SelectItem>
                  <SelectItem value="SEV-2">SEV-2 (suspected breach)</SelectItem>
                  <SelectItem value="SEV-1">SEV-1 (confirmed breach)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Scenario</Label>
              <Input
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                placeholder="Phishing simulation, ransomware, …"
              />
            </div>
          </div>
          <div>
            <Label>Summary</Label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>Actions taken</Label>
            <Textarea
              value={actionsTaken}
              onChange={(e) => setActionsTaken(e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <Label>Post-mortem / lessons learned</Label>
            <Textarea value={postMortem} onChange={(e) => setPostMortem(e.target.value)} rows={3} />
          </div>
          <Button
            onClick={() => createIncident.mutate()}
            disabled={!scenario || !summary || createIncident.isPending}
          >
            {createIncident.isPending ? "Recording…" : "Record"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent (latest 50)</CardTitle>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <Skeleton className="h-32" />
          ) : (list.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No incidents recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Severity</th>
                    <th className="py-2 pr-3">Scenario</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {(list.data ?? []).map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="py-1.5 pr-3 tabular-nums">
                        {format(new Date(r.occurred_at), "yyyy-MM-dd HH:mm")}
                      </td>
                      <td className="py-1.5 pr-3">
                        <Badge variant={r.severity === "SEV-1" ? "destructive" : "outline"}>
                          {r.severity}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-3">{r.scenario}</td>
                      <td className="py-1.5 pr-3">
                        <Badge variant="outline">{r.status}</Badge>
                      </td>
                      <td className="py-1.5 pr-3 text-muted-foreground">
                        {r.is_tabletop ? "drill" : "real"}
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
