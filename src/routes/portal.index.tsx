import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  FolderKanban,
  MessageSquare,
  Building2,
  Sparkles,
  FileText,
  ListChecks,
  BookOpen,
  ClipboardList,
  Clock,
  History,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { useBranding } from "@/lib/shared/branding";
import { PROJECT_TYPE_OPTIONS, type ProjectType } from "@/lib/shared/domain";
import { PortalDocuments } from "@/components/portal/portal-documents";
import { PortalSops } from "@/components/portal/portal-sops";
import { PortalPipeline } from "@/components/portal/portal-pipeline";
import { PortalAudit } from "@/components/portal/portal-audit";
import { PortalTimesheet } from "@/components/portal/portal-timesheet";
import { PortalOpenPoints } from "@/components/portal/portal-open-points";
import { PortalNav } from "@/components/portal/portal-nav";
import { PortalAccessDenied } from "@/components/portal/portal-access-denied";

export const Route = createFileRoute("/portal/")({
  component: () => (
    <AppShell crumbs={[{ label: "Portal", to: "/portal" }, { label: "Dashboard" }]}>
      <PortalNav />
      <PortalDashboardPage />
    </AppShell>
  ),
  errorComponent: RouteErrorComponent,
});

/** Mirror of FEATURE_MATRIX defaults for the portal surface (kept in sync with firm-hub.$firmId.tsx). */
const PORTAL_DEFAULTS: Record<string, boolean> = {
  tasks: true,
  documents: true,
  invoices: true,
  messaging: true,
  sops: false,
  open_points: false,
  timesheet: false,
  internal_notes: false,
  audit_trail: false,
  pipeline: false,
};

function isPortalOn(flags: Record<string, unknown> | null | undefined, key: string): boolean {
  const v = (flags ?? {})[`${key}.portal`];
  return typeof v === "boolean" ? v : (PORTAL_DEFAULTS[key] ?? false);
}

function PortalDashboardPage() {
  const { user } = useAuth();
  const branding = useBranding();
  const email = user?.email ?? null;

  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ["portal-contact", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firm_contacts")
        .select("id, firm_id, full_name, portal_enabled")
        .ilike("email", email!)
        .eq("portal_enabled", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const firmId = contact?.firm_id ?? null;
  const contactId = contact?.id ?? null;

  const { data: firm, isLoading: firmLoading } = useQuery({
    queryKey: ["portal-firm", firmId],
    enabled: !!firmId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firms")
        .select("id, name, contact_email, feature_flags")
        .eq("id", firmId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: contactCaps } = useQuery({
    queryKey: ["portal-contact-caps", contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firm_contact_capabilities")
        .select("capability, allowed")
        .eq("contact_id", contactId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const flags = (firm?.feature_flags as Record<string, unknown> | null) ?? {};
  const capMap = new Map<string, boolean>(
    (contactCaps ?? []).map((r: { capability: string; allowed: boolean }) => [
      r.capability,
      r.allowed,
    ]),
  );
  const can = (key: string) =>
    isPortalOn(flags, key) && (capMap.has(key) ? capMap.get(key)! : true);

  const tasksOn = can("tasks");
  const messagingOn = can("messaging");
  const documentsOn = can("documents");
  const openPointsOn = can("open_points");
  const sopsOn = can("sops");
  const pipelineOn = can("pipeline");
  const auditOn = can("audit_trail");
  const timesheetOn = can("timesheet");

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["portal-projects", firmId],
    enabled: !!firmId && tasksOn,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, project_type, status, firm_id, firms(name)")
        .eq("firm_id", firmId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: messages, isLoading: msgsLoading } = useQuery({
    queryKey: ["portal-messages", firmId],
    enabled: !!firmId && messagingOn,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_messages")
        .select(
          "id, body, created_at, task_id, is_client_visible, deleted_at, tasks(id, title, entity_id, client_entities(name, projects(name, firm_id, firms(name))))",
        )
        .eq("is_client_visible", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []).filter(
        (m: {
          tasks?: { client_entities?: { projects?: { firm_id?: string } | null } | null } | null;
        }) => m?.tasks?.client_entities?.projects?.firm_id === firmId,
      );
    },
  });

  if (contactLoading || (!!firmId && firmLoading)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (!contact || !firm) {
    return <PortalAccessDenied variant="no-access" />;
  }

  return (
    <>
      <div className="relative mb-6 overflow-hidden rounded-2xl glass p-5 sm:mb-8 sm:p-8">
        <div className="absolute inset-0 -z-10 bg-mesh opacity-70" />
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-[var(--shadow-glass)] sm:h-14 sm:w-14">
            <Sparkles className="h-5 w-5 sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
              {branding.name} · Client Portal
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-gradient sm:text-3xl">
              Welcome, {firm.name}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Track your engagements, deliverables and shared updates from your accounting team.
            </p>
          </div>
        </div>
      </div>

      {(() => {
        const navItems: Array<{
          key: string;
          label: string;
          href: string;
          icon: typeof FolderKanban;
        }> = [
          { key: "tasks", label: "Projects", href: "/portal/projects", icon: FolderKanban },
          { key: "messaging", label: "Inbox", href: "/portal/inbox", icon: MessageSquare },
          { key: "documents", label: "Documents", href: "#documents", icon: FileText },
          { key: "open_points", label: "Open Points", href: "#open-points", icon: ListChecks },
          { key: "sops", label: "SOPs", href: "#sops", icon: BookOpen },
          { key: "timesheet", label: "Time Sheet", href: "#timesheet", icon: Clock },
          { key: "audit_trail", label: "Audit Trail", href: "#audit", icon: History },
          { key: "pipeline", label: "Pipeline", href: "#pipeline", icon: ClipboardList },
        ].filter((i) => can(i.key));
        if (navItems.length === 0) return null;
        return (
          <>
            <PageHeader
              title="Your portal"
              description="Capabilities your firm has enabled for you."
            />
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 mb-6">
              {navItems.map(({ key, label, href, icon: Icon }) => {
                const inner = (
                  <Card className="glass border-border-subtle transition-shadow hover:shadow-md">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="text-sm font-medium group-hover:text-primary transition-colors">
                        {label}
                      </div>
                    </CardContent>
                  </Card>
                );
                // Real routes use the SPA router; in-page capability sections use anchors.
                return href.startsWith("/") ? (
                  <Link key={key} to={href} className="group">
                    {inner}
                  </Link>
                ) : (
                  <a key={key} href={href} className="group">
                    {inner}
                  </a>
                );
              })}
            </div>
          </>
        );
      })()}

      <PageHeader title="Your firm" description="Engagements your team has visibility into." />
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="glass border-border-subtle">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-primary" />
              <div>
                <div className="font-semibold">{firm.name}</div>
                {firm.contact_email && (
                  <div className="text-xs text-muted-foreground">{firm.contact_email}</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {tasksOn && (
        <>
          <PageHeader
            title="Active projects"
            description="Engagements assigned to your firm."
            actions={
              <Link to="/portal/projects" className="text-xs text-primary hover:underline">
                View all →
              </Link>
            }
          />
          {projectsLoading ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
          ) : (projects ?? []).length === 0 ? (
            <EmptyState
              icon={<FolderKanban className="h-10 w-10" />}
              title="No projects yet"
              description="Your accountant will publish engagements here as the season opens."
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {projects!.slice(0, 6).map((p) => {
                const pt = (p as { project_type?: ProjectType }).project_type ?? "other";
                const ptMeta =
                  PROJECT_TYPE_OPTIONS.find((o) => o.value === pt) ??
                  PROJECT_TYPE_OPTIONS[PROJECT_TYPE_OPTIONS.length - 1];
                return (
                  <Link
                    key={p.id}
                    to="/portal/projects/$projectId"
                    params={{ projectId: p.id }}
                    className="block"
                  >
                    <Card className="h-full glass border-border-subtle transition-shadow hover:shadow-md">
                      <CardContent className="p-5">
                        <div className="text-xs text-muted-foreground">
                          {(p as { firms?: { name: string } | null }).firms?.name ?? "—"}
                        </div>
                        <div className="mt-1 flex items-start justify-between gap-2">
                          <div className="font-semibold truncate">{p.name}</div>
                          <Badge
                            variant={p.status === "active" ? "default" : "secondary"}
                            className="capitalize shrink-0"
                          >
                            {p.status}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <Badge className={ptMeta.tone + " border-0"}>{ptMeta.label}</Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {messagingOn && (
        <div id="messages">
          <PageHeader
            title="Recent updates"
            description="Messages your accounting team shared with you."
            actions={
              <Link to="/portal/inbox" className="text-xs text-primary hover:underline">
                Open inbox →
              </Link>
            }
          />
          {msgsLoading ? (
            <Skeleton className="h-32" />
          ) : (messages ?? []).length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-10 w-10" />}
              title="No updates yet"
              description="Client-shared messages from your team will appear here."
            />
          ) : (
            <div className="space-y-3">
              {messages!.map(
                (m: {
                  id: string;
                  body: string;
                  created_at: string;
                  task_id: string;
                  tasks?: {
                    title?: string;
                    client_entities?: { name?: string; projects?: { name?: string } | null } | null;
                  } | null;
                }) => {
                  const t = m?.tasks;
                  const ce = t?.client_entities;
                  return (
                    <Link
                      key={m.id}
                      to="/portal/tasks/$taskId"
                      params={{ taskId: m.task_id }}
                      className="block"
                    >
                      <Card className="glass border-border-subtle transition-shadow hover:shadow-md">
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <MessageSquare className="h-3.5 w-3.5" />
                            <span className="font-medium text-foreground">
                              {t?.title ?? "Task"}
                            </span>
                            {ce?.name && <span>· {ce.name}</span>}
                            {ce?.projects?.name && <span>· {ce.projects.name}</span>}
                            <span className="ml-auto">
                              {new Date(m.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-2 text-sm whitespace-pre-wrap line-clamp-3">{m.body}</p>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                },
              )}
            </div>
          )}
        </div>
      )}

      {documentsOn && firmId && (
        <div id="documents">
          <PageHeader
            title="Shared documents"
            description="Files your accounting team shared with you."
          />
          <PortalDocuments firmId={firmId} />
        </div>
      )}

      {openPointsOn && (
        <div id="open-points">
          <PageHeader title="Open points" description="Items needing your input." />
          {firmId && <PortalOpenPoints firmId={firmId} />}
        </div>
      )}

      {pipelineOn && (
        <div id="pipeline">
          <PageHeader title="Pipeline" description="Where your engagements stand." />
          {firmId && <PortalPipeline firmId={firmId} />}
        </div>
      )}

      {timesheetOn && (
        <div id="timesheet">
          <PageHeader title="Time sheet" description="Billable time logged on your work." />
          {firmId && <PortalTimesheet firmId={firmId} />}
        </div>
      )}

      {sopsOn && (
        <div id="sops">
          <PageHeader title="Guides & SOPs" description="Procedures your firm shared with you." />
          {firmId && <PortalSops firmId={firmId} />}
        </div>
      )}

      {auditOn && (
        <div id="audit">
          <PageHeader title="Audit trail" description="Status updates on your engagements." />
          {firmId && <PortalAudit firmId={firmId} />}
        </div>
      )}
    </>
  );
}
