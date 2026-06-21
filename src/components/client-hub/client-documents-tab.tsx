// ClientDocumentsTab — SharePoint document hub for a B2B firm.
// Shows: firm provisioning status, per-project library status with SP links,
// and a paginated list of recently uploaded documents across all projects.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FolderOpen,
  ExternalLink,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClientAdapter } from "@/lib/client-hub/adapter";
import {
  getFirmSharePointStatus,
  getFirmProjectsSharePointStatus,
  getFirmSharePointDocs,
} from "@/lib/sharepoint/sharepoint.functions";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Main tab ────────────────────────────────────────────────────────────────

export function ClientDocumentsTab({
  adapter,
  entityId,
}: {
  adapter: ClientAdapter;
  entityId: string;
}) {
  // Only meaningful for firms (B2C clients don't have SP sites)
  if (adapter.table !== "firms") {
    return (
      <Card>
        <CardContent className="p-10 flex flex-col items-center justify-center text-center gap-3">
          <FolderOpen className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground max-w-sm">
            Document storage is only available for B2B Firm clients.
          </p>
        </CardContent>
      </Card>
    );
  }

  return <FirmDocumentsHub firmId={entityId} />;
}

// ─── Firm Documents Hub ───────────────────────────────────────────────────────

function FirmDocumentsHub({ firmId }: { firmId: string }) {
  const getStatusFn = useServerFn(getFirmSharePointStatus);
  const getProjectsFn = useServerFn(getFirmProjectsSharePointStatus);
  const getDocsFn = useServerFn(getFirmSharePointDocs);

  const { data: siteStatus, isLoading: siteLoading } = useQuery({
    queryKey: ["firm-sharepoint-status", firmId],
    queryFn: () => getStatusFn({ data: { firm_id: firmId } }),
  });

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["firm-sp-projects", firmId],
    queryFn: () => getProjectsFn({ data: { firm_id: firmId } }),
    enabled: siteStatus?.provisioning_status === "active",
  });

  const { data: docs, isLoading: docsLoading } = useQuery({
    queryKey: ["firm-sp-docs", firmId],
    queryFn: () => getDocsFn({ data: { firm_id: firmId } }),
    enabled: siteStatus?.provisioning_status === "active",
  });

  // ── Firm site not configured ──────────────────────────────────────────────
  if (
    !siteLoading &&
    (!siteStatus?.site_url ||
      !siteStatus?.provisioning_status ||
      siteStatus.provisioning_status === "not_configured")
  ) {
    return (
      <Card>
        <CardContent className="p-10 flex flex-col items-center justify-center text-center gap-4">
          <FolderOpen className="h-10 w-10 text-muted-foreground" />
          <div>
            <h3 className="font-medium">SharePoint not configured</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Paste this firm's SharePoint site URL in the <strong>Profile → SharePoint</strong>{" "}
              card to get started.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Site provisioning in progress ─────────────────────────────────────────
  if (
    siteStatus?.provisioning_status === "pending" ||
    siteStatus?.provisioning_status === "provisioning"
  ) {
    return (
      <Card>
        <CardContent className="p-10 flex flex-col items-center justify-center text-center gap-3">
          <Clock className="h-10 w-10 text-muted-foreground animate-pulse" />
          <div>
            <h3 className="font-medium">Provisioning…</h3>
            <p className="text-sm text-muted-foreground mt-1">
              BusAcTa is resolving the SharePoint site. This usually takes a few seconds.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Site provisioning failed ──────────────────────────────────────────────
  if (siteStatus?.provisioning_status === "failed") {
    return (
      <Card>
        <CardContent className="p-10 flex flex-col items-center justify-center text-center gap-3">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <div>
            <h3 className="font-medium text-destructive">SharePoint provisioning failed</h3>
            {siteStatus.provisioning_error && (
              <p className="text-xs text-muted-foreground mt-1 max-w-md font-mono">
                {siteStatus.provisioning_error}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-2">
              Check the URL in <strong>Profile → SharePoint</strong> and save again.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Active ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Site status banner */}
      <div className="flex items-center gap-2 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 px-4 py-2.5">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
        <span className="text-sm text-emerald-700 dark:text-emerald-400 flex-1">
          SharePoint active
        </span>
        {siteStatus?.sp_site_url && (
          <a
            href={siteStatus.sp_site_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-emerald-600 underline"
          >
            <ExternalLink className="h-3 w-3" /> Open site
          </a>
        )}
      </div>

      {/* Project libraries */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Project Document Libraries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {projectsLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : !projects?.length ? (
            <p className="text-sm text-muted-foreground p-4">No projects yet.</p>
          ) : (
            <div className="divide-y">
              {projects.map((proj) => (
                <div key={proj.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{proj.name}</p>
                    {proj.code && (
                      <p className="text-[11px] text-muted-foreground font-mono">{proj.code}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {proj.sharepoint_drive_id ? (
                      <>
                        <Badge variant="outline" className="gap-1 text-emerald-600 text-[11px]">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Configured
                        </Badge>
                        {proj.sharepoint_library_url && (
                          <a
                            href={proj.sharepoint_library_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            title="Open in SharePoint"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </>
                    ) : proj.sharepoint_library_url ? (
                      <Badge variant="secondary" className="gap-1 text-[11px]">
                        <Clock className="h-2.5 w-2.5 animate-pulse" /> Pending
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px] text-muted-foreground">
                        Not configured
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent documents */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Recent Documents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {docsLoading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : !docs?.length ? (
            <p className="text-sm text-muted-foreground p-4">
              No documents uploaded yet. Files are uploaded from within each task.
            </p>
          ) : (
            <div className="divide-y">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 px-4 py-2.5">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{doc.file_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(doc.uploaded_at)}
                      {doc.file_size_bytes ? ` · ${formatBytes(doc.file_size_bytes)}` : ""}
                    </p>
                  </div>
                  {doc.sharepoint_web_url && (
                    <a
                      href={doc.sharepoint_web_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      title="Open in SharePoint"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
