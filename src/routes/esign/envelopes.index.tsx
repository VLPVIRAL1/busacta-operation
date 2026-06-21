import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSignature, Plus } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { listEnvelopes } from "@/lib/esign/envelopes.functions";

export const Route = createFileRoute("/esign/envelopes/")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "E-Signature", to: "/esign" }, { label: "Documents" }]}>
        <div className="esign-scope">
          <EnvelopesPage />
        </div>
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function EnvelopesPage() {
  const navigate = useNavigate();
  const list = useServerFn(listEnvelopes);
  const { data, isLoading } = useQuery({
    queryKey: ["esign", "envelopes", "all"],
    queryFn: () => list({ data: {} }),
  });
  const envelopes = data?.envelopes ?? [];

  return (
    <>
      <PageHeader
        title="Documents"
        description="All signature documents across your firms."
        actions={
          <Button onClick={() => navigate({ to: "/esign/envelopes/new" })}>
            <Plus className="h-4 w-4 mr-1.5" /> New document
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : envelopes.length === 0 ? (
            <div className="p-12">
              <EmptyState
                icon={<FileSignature className="h-10 w-10" />}
                title="No documents"
                description="Create your first document to start collecting signatures."
              />
            </div>
          ) : (
            <ul className="divide-y">
              {envelopes.map((e) => (
                <li key={e.id}>
                  <Link
                    to="/esign/envelopes/$id"
                    params={{ id: e.id }}
                    className="px-4 py-3 flex items-center gap-3 hover:bg-muted/40"
                  >
                    <FileSignature className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{e.title}</div>
                      <div className="text-xs text-muted-foreground">
                        Created {new Date(e.created_at).toLocaleDateString()} · expires{" "}
                        {new Date(e.expires_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs capitalize">
                      {e.status.replace("_", " ")}
                    </Badge>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {e.routing_mode}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
