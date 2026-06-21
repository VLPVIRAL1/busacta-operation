import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, Plus, Trash2, FileCode2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

export const Route = createFileRoute("/admin/audit-log")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/activity-audit", search: { tab: "log" } });
  },
});

type Entry = {
  id: string;
  applied_at: string;
  applied_by: string | null;
  applied_by_email: string | null;
  migration_file: string | null;
  category: string;
  summary: string;
  details: string | null;
};

const CATEGORIES = [
  "rls",
  "security_definer",
  "realtime",
  "auth",
  "storage",
  "manual",
  "other",
] as const;

function categoryColor(c: string) {
  switch (c) {
    case "rls":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
    case "security_definer":
      return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
    case "realtime":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
    case "auth":
      return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
    case "storage":
      return "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function SecurityAuditLogPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { roles, user } = useAuth();
  const isAdmin = roles.includes("admin");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    summary: "",
    details: "",
    category: "manual",
    migration_file: "",
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("security_audit_log")
      .select("*")
      .order("applied_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setEntries((data ?? []) as Entry[]);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const submit = async () => {
    if (!draft.summary.trim()) {
      toast.error("Summary is required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("security_audit_log").insert({
      summary: draft.summary.trim(),
      details: draft.details.trim() || null,
      category: draft.category,
      migration_file: draft.migration_file.trim() || null,
      applied_by: user?.id ?? null,
      applied_by_email: user?.email ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Entry recorded");
    setOpen(false);
    setDraft({ summary: "", details: "", category: "manual", migration_file: "" });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this audit entry?")) return;
    const { error } = await supabase.from("security_audit_log").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  // Sync: list known migration files and insert any not yet logged.
  const KNOWN_MIGRATIONS: Array<{ file: string; category: string; summary: string }> = [
    {
      file: "20260508104550_a2248ee1-b5e1-40da-af2e-7d33f110192c.sql",
      category: "storage",
      summary: "Storage bucket policies & private task-attachments bucket",
    },
    {
      file: "20260508120840_1eaf73a4-227b-4fba-a8ff-5e4b8d02a0a7.sql",
      category: "rls",
      summary: "Notifications inbox RLS",
    },
    {
      file: "20260508121122_d60c26e9-16e5-4298-a57d-706a51fb4b78.sql",
      category: "rls",
      summary: "Initial RLS hardening pass",
    },
    {
      file: "20260508121707_7cda64ff-0aca-49b0-831d-0a05546e28f4.sql",
      category: "rls",
      summary: "Time logs scoped to accessible tasks",
    },
    {
      file: "20260508122233_7bbe9d32-b987-436d-91fe-8ee7d812cfcf.sql",
      category: "security_definer",
      summary: "Revoked EXECUTE on trigger-only SECURITY DEFINER functions",
    },
  ];

  const sync = async () => {
    setSyncing(true);
    const existing = new Set(entries.map((e) => e.migration_file).filter(Boolean) as string[]);
    const toInsert = KNOWN_MIGRATIONS.filter((m) => !existing.has(m.file)).map((m) => ({
      summary: m.summary,
      category: m.category,
      migration_file: m.file,
      applied_by: user?.id ?? null,
      applied_by_email: user?.email ?? null,
    }));
    if (toInsert.length === 0) {
      toast.info("All known migrations are already logged");
    } else {
      const { error } = await supabase.from("security_audit_log").insert(toInsert);
      if (error) toast.error(error.message);
      else toast.success(`Logged ${toInsert.length} migration${toInsert.length > 1 ? "s" : ""}`);
      await load();
    }
    setSyncing(false);
  };

  const filtered = filter === "all" ? entries : entries.filter((e) => e.category === filter);

  const headerActions = (
    <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            {isAdmin && (
              <>
                <Button size="sm" variant="outline" onClick={() => void sync()} disabled={syncing}>
                  <FileCode2 className="mr-2 h-4 w-4" />{" "}
                  {syncing ? "Syncing…" : "Sync from migrations"}
                </Button>
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="mr-2 h-4 w-4" /> Add entry
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Record a security fix</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Summary *</Label>
                        <Input
                          value={draft.summary}
                          onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                          placeholder="Tightened RLS on …"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Category</Label>
                          <Select
                            value={draft.category}
                            onValueChange={(v) => setDraft({ ...draft, category: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Migration file (optional)</Label>
                          <Input
                            value={draft.migration_file}
                            onChange={(e) => setDraft({ ...draft, migration_file: e.target.value })}
                            placeholder="20260508_*.sql"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Details</Label>
                        <Textarea
                          rows={4}
                          value={draft.details}
                          onChange={(e) => setDraft({ ...draft, details: e.target.value })}
                          placeholder="What changed and why."
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={() => void submit()} disabled={saving}>
                        {saving ? "Saving…" : "Save entry"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
    </div>
  );

  return (
    <>
      {embedded ? (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">{headerActions}</div>
      ) : (
        <PageHeader
          title="Security audit log"
          description="Chronological record of every security fix applied to this project, including who applied it."
          actions={headerActions}
        />
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Filter</Label>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-8 w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} entries</span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Applied fixes
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No entries yet.</div>
          ) : (
            <ol className="relative space-y-3 border-l border-border/60 pl-4">
              {filtered.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-2 h-2 w-2 rounded-full bg-primary" />
                  <div className="rounded-lg border bg-card/60 p-3 backdrop-blur-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{e.summary}</span>
                          <Badge
                            className={`text-[10px] uppercase ${categoryColor(e.category)}`}
                            variant="outline"
                          >
                            {e.category}
                          </Badge>
                        </div>
                        {e.details && (
                          <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                            {e.details}
                          </div>
                        )}
                        {e.migration_file && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(
                                "supabase/migrations/" + e.migration_file,
                              );
                              toast.success("Copied path");
                            }}
                            className="mt-2 inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-[11px] font-mono hover:bg-accent"
                          >
                            <FileCode2 className="h-3 w-3" />
                            {e.migration_file}
                          </button>
                        )}
                        <div className="text-[11px] text-muted-foreground/80 mt-2">
                          {format(new Date(e.applied_at), "PPpp")} ·{" "}
                          {e.applied_by_email ?? "system"}
                        </div>
                      </div>
                      {isAdmin && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => void remove(e.id)}
                          title="Delete entry"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </>
  );
}
