import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FileSignature,
  FileStack,
  Plus,
  Send,
  CheckCircle2,
  Clock,
  Users,
  FileText,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listEnvelopes, getEnvelopeOverview } from "@/lib/esign/envelopes.functions";

export const Route = createFileRoute("/esign/")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "E-Signature" }]}>
        <div className="esign-scope">
          <EsignDashboard />
        </div>
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function EsignDashboard() {
  const navigate = useNavigate();
  const list = useServerFn(listEnvelopes);
  const { data, isLoading } = useQuery({
    queryKey: ["esign", "envelopes", "all"],
    queryFn: () => list({ data: {} }),
  });
  const envelopes = data?.envelopes ?? [];
  const counts = {
    total: envelopes.length,
    draft: envelopes.filter((e) => e.status === "draft").length,
    in_flight: envelopes.filter((e) => ["sent", "in_progress"].includes(e.status)).length,
    completed: envelopes.filter((e) => e.status === "completed").length,
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const effectiveId = selectedId ?? envelopes[0]?.id ?? null;

  return (
    <>
      {/* Slim banner */}
      <div className="esign-hero px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="esign-chip shrink-0">
            <FileSignature className="h-3 w-3" /> E-Signature
          </span>
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-[var(--esign-ink)] truncate">
              Send, sign and seal documents
            </h1>
            <p className="text-xs text-[var(--esign-ink-soft)] truncate">
              Hashed, certificate-backed and publicly verifiable.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <KpiInline label="Total" value={counts.total} />
          <KpiInline label="Draft" value={counts.draft} />
          <KpiInline label="In flight" value={counts.in_flight} />
          <KpiInline label="Done" value={counts.completed} />
          <Button
            size="sm"
            onClick={() => navigate({ to: "/esign/envelopes/new" })}
            className="bg-[var(--esign-primary)] hover:bg-[var(--esign-primary)]/90 text-white"
          >
            <Plus className="h-4 w-4 mr-1" /> New
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/esign/templates" })}>
            <FileStack className="h-4 w-4 mr-1" /> Templates
          </Button>
        </div>
      </div>

      {/* Split-view: list left, details right */}
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <div className="esign-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--esign-border)] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--esign-ink)]">Recent documents</h2>
            <Link
              to="/esign/envelopes"
              className="text-xs text-[var(--esign-primary)] hover:underline font-medium"
            >
              View all →
            </Link>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : envelopes.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={<FileSignature className="h-10 w-10" />}
                title="No documents yet"
                description="Create your first signature document."
                action={
                  <Button onClick={() => navigate({ to: "/esign/envelopes/new" })}>
                    <Plus className="h-4 w-4 mr-1.5" /> New document
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-[var(--esign-border)] max-h-[60vh] overflow-y-auto">
              {envelopes.slice(0, 20).map((e) => {
                const active = e.id === effectiveId;
                return (
                  <li
                    key={e.id}
                    onClick={() => setSelectedId(e.id)}
                    className={
                      "px-4 py-2.5 flex items-center gap-2.5 cursor-pointer transition-colors " +
                      (active
                        ? "bg-[var(--esign-primary-soft)]"
                        : "hover:bg-[var(--esign-surface-muted)]")
                    }
                  >
                    <div className="h-8 w-8 rounded-lg bg-[var(--esign-primary-soft)] flex items-center justify-center shrink-0">
                      <FileSignature className="h-3.5 w-3.5 text-[var(--esign-primary)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate text-[var(--esign-ink)]">
                        {e.title}
                      </div>
                      <div className="text-[11px] text-[var(--esign-muted)]">
                        {new Date(e.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <StatusPill status={e.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="esign-card overflow-hidden min-h-[400px]">
          {effectiveId ? (
            <EnvelopeDetailPane envelopeId={effectiveId} />
          ) : (
            <div className="p-8 text-sm text-[var(--esign-muted)]">
              Select a document to view details.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function EnvelopeDetailPane({ envelopeId }: { envelopeId: string }) {
  const navigate = useNavigate();
  const overview = useServerFn(getEnvelopeOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["esign", "envelope", envelopeId],
    queryFn: () => overview({ data: { envelope_id: envelopeId } }),
  });
  const env = data?.envelope as
    | {
        title?: string;
        status?: string;
        message?: string | null;
        created_at?: string;
        expires_at?: string | null;
      }
    | undefined;
  const docs = data?.documents ?? [];
  const recipients = data?.recipients ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-[var(--esign-border)] flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--esign-ink)] truncate">
            {env?.title ?? (isLoading ? "Loading…" : "Document")}
          </div>
          {env?.status && (
            <div className="mt-0.5">
              <StatusPill status={env.status} />
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate({ to: "/esign/envelopes/$id", params: { id: envelopeId } })}
        >
          Open →
        </Button>
      </div>
      <Tabs defaultValue="summary" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-3 w-fit">
          <TabsTrigger value="summary">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Summary
          </TabsTrigger>
          <TabsTrigger value="recipients">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Recipients ({recipients.length})
          </TabsTrigger>
          <TabsTrigger value="documents">
            <FileSignature className="h-3.5 w-3.5 mr-1.5" />
            Documents ({docs.length})
          </TabsTrigger>
        </TabsList>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          <TabsContent value="summary" className="mt-0 space-y-2 text-sm">
            <KV k="Created" v={env?.created_at ? new Date(env.created_at).toLocaleString() : "—"} />
            <KV k="Expires" v={env?.expires_at ? new Date(env.expires_at).toLocaleString() : "—"} />
            <KV k="Message" v={env?.message || "—"} />
          </TabsContent>
          <TabsContent value="recipients" className="mt-0">
            {recipients.length === 0 ? (
              <p className="text-sm text-[var(--esign-muted)]">No recipients yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--esign-border)]">
                {recipients.map(
                  (r: {
                    id: string;
                    full_name?: string | null;
                    email?: string | null;
                    role?: string | null;
                  }) => (
                    <li key={r.id} className="py-2 text-sm flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate text-[var(--esign-ink)]">
                          {r.full_name || r.email}
                        </div>
                        <div className="text-xs text-[var(--esign-muted)] truncate">{r.email}</div>
                      </div>
                      {r.role && (
                        <span className="text-xs text-[var(--esign-muted)] uppercase tracking-wide">
                          {r.role}
                        </span>
                      )}
                    </li>
                  ),
                )}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="documents" className="mt-0">
            {docs.length === 0 ? (
              <p className="text-sm text-[var(--esign-muted)]">No documents attached.</p>
            ) : (
              <ul className="divide-y divide-[var(--esign-border)]">
                {docs.map((d: { id: string; name?: string | null }) => (
                  <li key={d.id} className="py-2 text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-[var(--esign-muted)]" />
                    <span className="truncate">{d.name ?? "Document"}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-20 text-xs uppercase tracking-wider text-[var(--esign-muted)] font-semibold pt-0.5 shrink-0">
        {k}
      </div>
      <div className="text-sm text-[var(--esign-ink)] min-w-0 break-words">{v}</div>
    </div>
  );
}

function KpiInline({ label, value }: { label: string; value: number }) {
  return (
    <div className="hidden md:flex flex-col items-end px-2.5 py-1 rounded-md bg-[var(--esign-surface-muted)] border border-[var(--esign-border)]">
      <div className="text-[9px] uppercase tracking-wider text-[var(--esign-muted)] font-semibold leading-none">
        {label}
      </div>
      <div className="text-sm font-semibold text-[var(--esign-ink)] leading-tight">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-[var(--esign-surface-muted)] text-[var(--esign-muted)]",
    sent: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    in_progress: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    declined: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    voided: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
    expired: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  };
  return (
    <span
      className={
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide " +
        (styles[status] ?? styles.draft)
      }
    >
      {status.replace("_", " ")}
    </span>
  );
}

// Keep references for unused icons (avoid TS unused warnings in strict mode)
void Send;
void Clock;
void CheckCircle2;
