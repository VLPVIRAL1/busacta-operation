import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Download,
  FileText,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  FileSignature,
  FileBadge2,
  QrCode,
  Send,
  FolderKanban,
  BadgeCheck,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getEnvelopeOverview, listEnvelopeIdDocuments } from "@/lib/esign/envelopes.functions";
import {
  getEnvelopeAudit,
  getRecipientSigningLink,
  voidEnvelope,
} from "@/lib/esign/builder.functions";
import { EnvelopeWizard } from "./envelopes.new";
import { getCompletedEnvelopeAssets } from "@/lib/esign/verify.functions";
import { resendRecipientReminder, updateEnvelopeProject } from "@/lib/esign/reminders.functions";
import {
  applyTemplateToEnvelope,
  listTemplates,
  saveTemplateFromEnvelope,
} from "@/lib/esign/templates.functions";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileStack, Save } from "lucide-react";
import { SealedDownloadButton } from "@/components/esign/sealed-download-card";

export const Route = createFileRoute("/esign/envelopes/$id")({
  component: () => (
    <AuthGuard>
      <AppShell
        crumbs={[
          { label: "E-Signature", to: "/esign" },
          { label: "Documents", to: "/esign/envelopes" },
          { label: "Detail" },
        ]}
        fullBleed
        hideMegaMenu
      >
        <div className="esign-scope h-full bg-[var(--esign-bg)]">
          <EnvelopeDetailPage />
        </div>
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  in_progress: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  completed: "bg-green-500/15 text-green-600 dark:text-green-300",
  declined: "bg-red-500/15 text-red-600 dark:text-red-300",
  voided: "bg-red-500/15 text-red-600 dark:text-red-300",
  expired: "bg-orange-500/15 text-orange-600 dark:text-orange-300",
};

function EnvelopeDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const overview = useServerFn(getEnvelopeOverview);
  const auditFn = useServerFn(getEnvelopeAudit);
  const voidFn = useServerFn(voidEnvelope);
  const sealedFn = useServerFn(getCompletedEnvelopeAssets);
  const idDocsFn = useServerFn(listEnvelopeIdDocuments);

  const ovQ = useQuery({
    queryKey: ["esign", "envelope", id],
    queryFn: () => overview({ data: { envelope_id: id } }),
  });
  const auditQ = useQuery({
    queryKey: ["esign", "audit", id],
    queryFn: () => auditFn({ data: { envelope_id: id } }),
  });
  const sealedQ = useQuery({
    queryKey: ["esign", "sealed", id],
    queryFn: () => sealedFn({ data: { envelope_id: id } }),
    enabled: ovQ.data?.envelope?.status === "completed",
    refetchInterval: (q) => (q.state.data?.sealed ? false : 4000),
  });
  const idDocsQ = useQuery({
    queryKey: ["esign", "id-docs", id],
    queryFn: () => idDocsFn({ data: { envelope_id: id } }),
  });

  const [voidReason, setVoidReason] = useState("");
  const voidMut = useMutation({
    mutationFn: () => voidFn({ data: { envelope_id: id, reason: voidReason.trim() } }),
    onSuccess: () => {
      toast.success("Document voided");
      setVoidReason("");
      qc.invalidateQueries({ queryKey: ["esign", "envelope", id] });
      qc.invalidateQueries({ queryKey: ["esign", "audit", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTplFn = useServerFn(saveTemplateFromEnvelope);
  const applyTplFn = useServerFn(applyTemplateToEnvelope);
  const listTplFn = useServerFn(listTemplates);
  const [tplName, setTplName] = useState("");
  const [tplKind, setTplKind] = useState("");
  const [pickedTplId, setPickedTplId] = useState<string>("");
  const tplsQ = useQuery({
    queryKey: ["esign", "templates"],
    queryFn: () => listTplFn({ data: {} }),
  });
  const saveTplMut = useMutation({
    mutationFn: () =>
      saveTplFn({
        data: {
          envelope_id: id,
          name: tplName.trim(),
          doc_kind: tplKind.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Template saved");
      setTplName("");
      setTplKind("");
      qc.invalidateQueries({ queryKey: ["esign", "templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const applyTplMut = useMutation({
    mutationFn: () => applyTplFn({ data: { envelope_id: id, template_id: pickedTplId } }),
    onSuccess: (r) => {
      toast.success(`Applied template (${r.inserted} fields)`);
      setPickedTplId("");
      qc.invalidateQueries({ queryKey: ["esign", "envelope", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // --- Resend reminder (per pending recipient) ---
  const resendFn = useServerFn(resendRecipientReminder);
  const resendMut = useMutation({
    mutationFn: (recipient_id: string) => resendFn({ data: { envelope_id: id, recipient_id } }),
    onSuccess: (r) => {
      toast.success("Reminder logged", {
        description: r.link?.url ? "Signing link copied to clipboard" : undefined,
      });
      if (r.link?.url && typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(r.link.url).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ["esign", "audit", id] });
      qc.invalidateQueries({ queryKey: ["esign", "envelope", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // --- Plain "Copy link" (no email, no audit row, no reminder bump) ---
  // Caches the minted URL per recipient so the operator can preview it
  // inline before copying, and re-click without re-minting.
  const [previewLinks, setPreviewLinks] = useState<Record<string, string>>({});
  const linkFn = useServerFn(getRecipientSigningLink);
  const copyLinkMut = useMutation({
    mutationFn: (recipient_id: string) => linkFn({ data: { envelope_id: id, recipient_id } }),
    onSuccess: (r, recipient_id) => {
      if (r.link?.url) {
        setPreviewLinks((m) => ({ ...m, [recipient_id]: r.link.url }));
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(r.link.url).then(
            () => toast.success("Signing link copied"),
            () => toast.success("Signing link ready", { description: r.link.url }),
          );
        } else {
          toast.success("Signing link ready", { description: r.link.url });
        }
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // --- Project picker (inline edit on Overview tab) ---
  const updateProjectFn = useServerFn(updateEnvelopeProject);
  const [projectId, setProjectId] = useState<string>("");
  const firmId = (ovQ.data?.envelope as { firm_id?: string } | undefined)?.firm_id ?? "";
  useEffect(() => {
    setProjectId(
      (ovQ.data?.envelope as { project_id?: string | null } | undefined)?.project_id ?? "",
    );
  }, [ovQ.data?.envelope]);
  const projectsQ = useQuery({
    queryKey: ["esign", "projects", firmId],
    enabled: firmId.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, code")
        .eq("firm_id", firmId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const updateProjectMut = useMutation({
    mutationFn: (next: string | null) =>
      updateProjectFn({ data: { envelope_id: id, project_id: next } }),
    onSuccess: () => {
      toast.success("Project updated");
      qc.invalidateQueries({ queryKey: ["esign", "envelope", id] });
      qc.invalidateQueries({ queryKey: ["esign", "audit", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (ovQ.isLoading) return <Skeleton className="h-64 w-full m-6" />;
  const env = ovQ.data?.envelope;
  const docs = ovQ.data?.documents ?? [];
  const recipients = ovQ.data?.recipients ?? [];
  if (!env) return <div className="text-sm text-muted-foreground p-6">Document not found.</div>;

  // Drafts are fully editable — reuse the same wizard the creator used (DRY).
  if (env.status === "draft") {
    return <EnvelopeWizard existingEnvelopeId={env.id} initialStep="upload" title={env.title} />;
  }

  const completed = recipients.filter((r) => r.completed_at).length;
  const total = recipients.filter((r) => r.role !== "cc").length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/esign/envelopes">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            All documents
          </Link>
        </Button>
      </div>
      <PageHeader
        title={env.title}
        description={`Created ${new Date(env.created_at).toLocaleString()} · expires ${new Date(env.expires_at).toLocaleString()}`}
      />
      <div className="flex items-center gap-2 mb-4">
        <Badge className={STATUS_COLOR[env.status] ?? ""}>{env.status}</Badge>
        <Badge variant="outline">{env.routing_mode}</Badge>
        <span className="text-xs text-muted-foreground ml-2">
          {completed} of {total} completed · {pct}%
        </span>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents ({docs.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
          {env.status === "completed" && <TabsTrigger value="sealed">Sealed document</TabsTrigger>}
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FolderKanban className="h-4 w-4" />
                Linked project
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={projectId || "__none__"}
                  onValueChange={(v) => setProjectId(v === "__none__" ? "" : v)}
                  disabled={!firmId || projectsQ.isLoading || updateProjectMut.isPending}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="No project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No project</SelectItem>
                    {(projectsQ.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code ? `[${p.code}] ` : ""}
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={
                    updateProjectMut.isPending ||
                    projectId ===
                      ((ovQ.data?.envelope as { project_id?: string | null } | undefined)
                        ?.project_id ?? "")
                  }
                  onClick={() => updateProjectMut.mutate(projectId ? projectId : null)}
                >
                  {updateProjectMut.isPending && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-sm font-medium mb-2">Recipients</div>
              <ul className="divide-y border rounded-md">
                {recipients.map((r) => {
                  const canRemind =
                    (env.status === "sent" || env.status === "in_progress") &&
                    r.role !== "cc" &&
                    r.status !== "completed" &&
                    r.status !== "declined";
                  return (
                    <li key={r.id} className="px-3 py-2 text-sm space-y-1.5">
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ backgroundColor: r.color_hex }}
                        />
                        <span className="font-medium">{r.full_name}</span>
                        <span className="text-muted-foreground">&lt;{r.email}&gt;</span>
                        <Badge variant="outline" className="ml-auto">
                          {r.role}
                        </Badge>
                        <Badge variant="outline">{r.status}</Badge>
                        {canRemind && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              title="Copy the signing link to your clipboard (no email is sent, no reminder logged)"
                              disabled={copyLinkMut.isPending && copyLinkMut.variables === r.id}
                              onClick={() => copyLinkMut.mutate(r.id)}
                            >
                              {copyLinkMut.isPending && copyLinkMut.variables === r.id ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                              ) : (
                                <Copy className="h-4 w-4 mr-1.5" />
                              )}
                              {previewLinks[r.id] ? "Copy again" : "Copy link"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              title="Send a reminder email to this recipient and copy the signing link"
                              disabled={resendMut.isPending && resendMut.variables === r.id}
                              onClick={() => resendMut.mutate(r.id)}
                            >
                              {resendMut.isPending && resendMut.variables === r.id ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                              ) : (
                                <Send className="h-4 w-4 mr-1.5" />
                              )}
                              Send reminder
                            </Button>
                          </>
                        )}
                      </div>
                      {previewLinks[r.id] && (
                        <div className="pl-6 flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground shrink-0">Signing link:</span>
                          <a
                            href={previewLinks[r.id]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-mono truncate"
                            title={previewLinks[r.id]}
                          >
                            {previewLinks[r.id]}
                          </a>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4">
              <ul className="divide-y border rounded-md">
                {docs.map((d) => (
                  <li key={d.id} className="px-3 py-2 flex items-center gap-3 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{d.name}</span>
                    <span className="text-xs text-muted-foreground">{d.source_mime}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-sm font-medium mb-2">
                <BadgeCheck className="h-4 w-4" />
                Signer ID documents
                {(idDocsQ.data?.documents?.length ?? 0) > 0 && (
                  <Badge variant="outline" className="ml-1">
                    {idDocsQ.data?.documents.length}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                ID files uploaded by signers. Links expire after 10 minutes.
              </p>
              {idDocsQ.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (idDocsQ.data?.documents.length ?? 0) === 0 ? (
                <div className="text-xs text-muted-foreground italic">
                  No ID documents have been submitted for this document.
                </div>
              ) : (
                <ul className="divide-y border rounded-md">
                  {idDocsQ.data!.documents.map((doc) => (
                    <li key={doc.field_id} className="px-3 py-2 flex items-center gap-3 text-sm">
                      <BadgeCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {doc.recipient_name}
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            &lt;{doc.recipient_email}&gt;
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {doc.filename} · {doc.mime}
                          {doc.submitted_at && ` · ${new Date(doc.submitted_at).toLocaleString()}`}
                        </div>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={doc.signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={doc.filename}
                        >
                          <Download className="h-4 w-4 mr-1.5" />
                          Download
                        </a>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {auditQ.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {(auditQ.data?.audit ?? []).map((e) => (
                    <li key={e.id} className="flex items-start gap-2 border-b py-1.5">
                      <span className="font-mono text-muted-foreground w-40 shrink-0">
                        {new Date(e.occurred_at).toLocaleString()}
                      </span>
                      <span className="font-medium">{e.event}</span>
                      {e.actor_email && (
                        <span className="text-muted-foreground">· {e.actor_email}</span>
                      )}
                      {e.ip && <span className="text-muted-foreground">· {e.ip}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {env.status === "completed" && (
          <TabsContent value="sealed" className="mt-4">
            <Card>
              <CardContent className="p-4 space-y-4">
                {sealedQ.isLoading || !sealedQ.data ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sealing document…
                  </div>
                ) : !sealedQ.data.sealed ? (
                  <div className="text-sm text-muted-foreground">
                    Cryptographic seal is being generated. This usually completes within a few
                    seconds.
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="h-4 w-4" />
                      Document sealed and tamper-evident
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 text-xs">
                      <div>
                        <div className="font-semibold uppercase tracking-wide text-muted-foreground">
                          Sealed at
                        </div>
                        <div className="mt-0.5">
                          {new Date(sealedQ.data.signed_at).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold uppercase tracking-wide text-muted-foreground">
                          Algorithm
                        </div>
                        <div className="mt-0.5">SHA-256</div>
                      </div>
                      <div className="sm:col-span-2">
                        <div className="font-semibold uppercase tracking-wide text-muted-foreground">
                          SHA-256 fingerprint
                        </div>
                        <div className="mt-0.5 font-mono break-all">{sealedQ.data.sha256_hex}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <SealedDownloadButton
                        url={sealedQ.data.sealed_pdf_url}
                        filename="sealed-document.pdf"
                        label="Download sealed PDF"
                        icon={<FileSignature className="h-4 w-4 mr-1.5" />}
                        onRegenerate={() =>
                          qc.invalidateQueries({ queryKey: ["esign", "sealed", id] })
                        }
                      />
                      <SealedDownloadButton
                        url={sealedQ.data.certificate_pdf_url}
                        filename="certificate-of-completion.pdf"
                        label="Download certificate"
                        variant="secondary"
                        icon={<FileBadge2 className="h-4 w-4 mr-1.5" />}
                        onRegenerate={() =>
                          qc.invalidateQueries({ queryKey: ["esign", "sealed", id] })
                        }
                      />
                      <Button asChild size="sm" variant="outline">
                        <Link to="/verify/$slug" params={{ slug: sealedQ.data.slug }}>
                          <QrCode className="h-4 w-4 mr-1.5" />
                          Public verification page
                        </Link>
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="actions" className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3 max-w-xl">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Save className="h-4 w-4" />
                Save as template
              </div>
              <p className="text-xs text-muted-foreground">
                Snapshot recipient roles and field layout for reuse. Documents and signer-specific
                data are not stored.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name" className="text-xs">
                  Template name
                </Label>
                <Input
                  id="tpl-name"
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  maxLength={120}
                  placeholder="e.g. 1040 — single signer"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-kind" className="text-xs">
                  Document kind (optional)
                </Label>
                <Input
                  id="tpl-kind"
                  value={tplKind}
                  onChange={(e) => setTplKind(e.target.value)}
                  maxLength={60}
                  placeholder="e.g. Tax return"
                />
              </div>
              <Button
                onClick={() => saveTplMut.mutate()}
                disabled={tplName.trim().length === 0 || saveTplMut.isPending}
              >
                {saveTplMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Save template
              </Button>
            </CardContent>
          </Card>

          {/* Draft-only actions (template apply etc.) live in the wizard now. */}

          <Card>
            <CardContent className="p-4 space-y-3 max-w-xl">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <ShieldAlert className="h-4 w-4" />
                Void document
              </div>
              <p className="text-xs text-muted-foreground">
                Voiding stops all signers. This action is permanent and recorded in the audit trail.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="void-reason" className="text-xs">
                  Reason
                </Label>
                <Textarea
                  id="void-reason"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="e.g. Corrected version sent under new document"
                />
              </div>
              <Button
                variant="destructive"
                onClick={() => voidMut.mutate()}
                disabled={
                  voidReason.trim().length < 3 ||
                  voidMut.isPending ||
                  env.status === "voided" ||
                  env.status === "completed"
                }
              >
                {voidMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Void document
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
