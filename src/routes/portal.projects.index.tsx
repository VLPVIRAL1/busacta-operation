import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FolderKanban } from "lucide-react";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { PROJECT_TYPE_OPTIONS, type ProjectType } from "@/lib/shared/domain";
import { PortalNav } from "@/components/portal/portal-nav";
import { PortalAccessDenied } from "@/components/portal/portal-access-denied";

export const Route = createFileRoute("/portal/projects/")({
  component: () => (
    <AppShell crumbs={[{ label: "Portal", to: "/portal" }, { label: "Projects" }]}>
      <PortalNav />
      <PortalProjectsListPage />
    </AppShell>
  ),
  errorComponent: RouteErrorComponent,
});

/**
 * CLIENT PORTAL — Projects list.
 *
 * Read-only grid. Filtered to projects under the client's firm. RLS
 * (`user_can_access_firm`) drops any project not belonging to a firm the
 * authenticated user can see. We also gate behind `firm_contacts.portal_enabled`
 * for defense in depth.
 *
 * Intentionally excluded: budgets, internal team assignments, hourly rates,
 * pricing, or any internal metadata.
 */
function PortalProjectsListPage() {
  const { user } = useAuth();
  const email = user?.email ?? null;

  const { data: contact, isLoading: contactLoading } = useQuery({
    queryKey: ["portal-contact", email],
    enabled: !!email,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firm_contacts")
        .select("id, firm_id, portal_enabled")
        .ilike("email", email!)
        .eq("portal_enabled", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const firmId = contact?.firm_id ?? null;

  const { data: projects, isLoading } = useQuery({
    queryKey: ["portal-projects-list", firmId],
    enabled: !!firmId,
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

  if (contactLoading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  if (!contact) {
    return <PortalAccessDenied variant="no-access" />;
  }

  return (
    <>
      <PageHeader title="Projects" description="Engagements assigned to your firm." />
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
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
          {projects!.map((p) => {
            const pt = (p as { project_type?: ProjectType }).project_type ?? "other";
            const ptMeta =
              PROJECT_TYPE_OPTIONS.find((o) => o.value === pt) ??
              PROJECT_TYPE_OPTIONS[PROJECT_TYPE_OPTIONS.length - 1];
            const firmName = (p as { firms?: { name: string } | null }).firms?.name ?? "—";
            return (
              <Link
                key={p.id}
                to="/portal/projects/$projectId"
                params={{ projectId: p.id }}
                className="block"
              >
                <Card className="h-full glass border-border-subtle transition-shadow hover:shadow-md">
                  <CardContent className="p-5">
                    <div className="text-xs text-muted-foreground">{firmName}</div>
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
  );
}
