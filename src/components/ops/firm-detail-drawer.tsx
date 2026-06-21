import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Clock, FileText, NotebookPen, Plus, Loader2, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

type FirmLite = {
  id: string;
  name: string;
  us_timezone: string | null;
  notes: string | null;
};

type Sop = {
  id: string;
  title: string;
  body: string;
  is_internal: boolean;
  created_at: string;
};

function useLiveClock(timezone: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => {
    try {
      const time = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(now);
      const dayDate = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "long",
        month: "short",
        day: "numeric",
      }).format(now);
      // Compute short tz name
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        timeZoneName: "short",
      }).formatToParts(now);
      const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
      return { time, dayDate, tzName, ok: true as const };
    } catch {
      return { time: "—", dayDate: "Invalid timezone", tzName: timezone, ok: false as const };
    }
  }, [now, timezone]);
}

export function FirmDetailDrawer({
  firm,
  open,
  onOpenChange,
}: {
  firm: FirmLite | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { role } = useAuth();
  const isAdmin = role === "admin" || role === "super_admin";

  const tz = firm?.us_timezone || "America/New_York";
  const clock = useLiveClock(tz);

  // Notes — debounced autosave
  const [notes, setNotes] = useState(firm?.notes ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => {
    setNotes(firm?.notes ?? "");
    setSaveState("idle");
  }, [firm?.id, firm?.notes]);

  useEffect(() => {
    if (!firm) return;
    if ((firm.notes ?? "") === notes) return;
    setSaveState("saving");
    const t = setTimeout(async () => {
      const { error } = await supabase
        .from("firms")
        .update({ notes: notes || null })
        .eq("id", firm.id);
      if (error) {
        setSaveState("idle");
        toast.error(`Notes save failed: ${error.message}`);
      } else {
        setSaveState("saved");
        qc.invalidateQueries({ queryKey: ["firms"] });
      }
    }, 800);
    return () => clearTimeout(t);
  }, [notes, firm, qc]);

  // SOPs
  const { data: sops, isLoading: loadingSops } = useQuery({
    queryKey: ["firm-sops", firm?.id],
    enabled: !!firm?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sops")
        .select("id, title, body, is_internal, created_at")
        .eq("firm_id", firm!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Sop[];
    },
  });

  const [newSopTitle, setNewSopTitle] = useState("");
  const [newSopBody, setNewSopBody] = useState("");
  const addSop = useMutation({
    mutationFn: async () => {
      if (!firm) return;
      const { error } = await supabase.from("sops").insert({
        firm_id: firm.id,
        title: newSopTitle.trim(),
        body: newSopBody.trim(),
        is_internal: true,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      setNewSopTitle("");
      setNewSopBody("");
      qc.invalidateQueries({ queryKey: ["firm-sops", firm?.id] });
      toast.success("SOP added");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeSop = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sops").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["firm-sops", firm?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 pr-6">
            <span className="truncate">{firm?.name ?? "Firm"}</span>
          </SheetTitle>
          <SheetDescription>
            Permanent reference: live US clock, internal notes, and SOPs.
          </SheetDescription>
        </SheetHeader>

        {firm && (
          <div className="mt-6 space-y-6">
            {/* Live US Time */}
            <section className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-2">
                <Clock className="h-3.5 w-3.5" />
                Live US Time
                <Badge variant="outline" className="ml-auto">
                  {tz}
                </Badge>
              </div>
              <div className="font-mono text-3xl font-semibold tabular-nums">{clock.time}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {clock.dayDate} • {clock.tzName}
              </div>
              {!clock.ok && (
                <p className="mt-2 text-xs text-destructive">
                  Invalid IANA timezone — edit on firm page to fix.
                </p>
              )}
            </section>

            {/* Permanent Notes */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-2 text-sm">
                  <NotebookPen className="h-4 w-4" />
                  Permanent Notes
                </Label>
                <span className="text-xs text-muted-foreground">
                  {saveState === "saving" && (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Saving…
                    </span>
                  )}
                  {saveState === "saved" && "Saved"}
                </span>
              </div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                placeholder="Internal notes about this firm — sticky reference for the team."
                disabled={!isAdmin && role !== "employee"}
              />
            </section>

            {/* SOPs */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4" />
                  SOPs
                </Label>
                <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                  <Link
                    to="/ops/workspace"
                    search={{
                      stream: "cpa" as const,
                      selected: `cpa:${firm.id}`,
                      tab: "sops" as const,
                    }}
                  >
                    Open full SOP page
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>

              {loadingSops ? (
                <div className="space-y-2">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : sops && sops.length > 0 ? (
                <div className="space-y-2">
                  {sops.map((s) => (
                    <Collapsible key={s.id} className="rounded-lg border bg-card">
                      <div className="flex items-center gap-2 p-3">
                        <CollapsibleTrigger className="flex-1 text-left text-sm font-medium hover:underline">
                          {s.title}
                        </CollapsibleTrigger>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => removeSop.mutate(s.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      <CollapsibleContent>
                        <div className="px-3 pb-3 text-sm whitespace-pre-wrap text-muted-foreground border-t pt-3">
                          {s.body || <em>No content.</em>}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No SOPs yet.</p>
              )}

              <div className="mt-4 rounded-lg border border-dashed p-3 space-y-2">
                <Input
                  placeholder="SOP title"
                  value={newSopTitle}
                  onChange={(e) => setNewSopTitle(e.target.value)}
                  className="h-8 text-sm"
                />
                <Textarea
                  placeholder="Step-by-step procedure…"
                  value={newSopBody}
                  onChange={(e) => setNewSopBody(e.target.value)}
                  rows={3}
                />
                <Button
                  size="sm"
                  disabled={!newSopTitle.trim() || addSop.isPending}
                  onClick={() => addSop.mutate()}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {addSop.isPending ? "Adding…" : "Add SOP"}
                </Button>
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
