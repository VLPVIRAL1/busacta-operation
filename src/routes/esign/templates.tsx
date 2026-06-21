import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileStack, Loader2, Trash2, Users } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteTemplate, listTemplates } from "@/lib/esign/templates.functions";

export const Route = createFileRoute("/esign/templates")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "E-Signature", to: "/esign" }, { label: "Templates" }]}>
        <div className="esign-scope">
          <TemplatesPage />
        </div>
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function TemplatesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTemplates);
  const delFn = useServerFn(deleteTemplate);

  const { data, isLoading } = useQuery({
    queryKey: ["esign", "templates"],
    queryFn: () => listFn({ data: {} }),
  });

  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const delMut = useMutation({
    mutationFn: (template_id: string) => delFn({ data: { template_id } }),
    onSuccess: () => {
      toast.success("Template deleted");
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["esign", "templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const templates = data?.templates ?? [];

  return (
    <>
      <PageHeader
        title="Templates"
        description="Reusable role + field layouts saved from past envelopes. Apply to a draft envelope to skip placing fields again."
      />

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="p-12">
            <EmptyState
              icon={<FileStack className="h-10 w-10" />}
              title="No templates yet"
              description="From any draft document's Actions tab, click 'Save as template' to capture the recipient roles and field layout for reuse."
              action={
                <Button asChild>
                  <Link to="/esign/envelopes">Open documents</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <FileStack className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    {t.doc_kind && (
                      <div className="text-xs text-muted-foreground truncate">{t.doc_kind}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" /> {t.role_count} role
                    {t.role_count === 1 ? "" : "s"}
                  </span>
                  <span>
                    {t.field_count} field{t.field_count === 1 ? "" : "s"}
                  </span>
                  <span className="ml-auto">{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPendingDelete({ id: t.id, name: t.name })}
                    title="Delete template"
                    aria-label="Delete template"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingDelete?.name}" will be removed. Documents already created from this template
              are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && delMut.mutate(pendingDelete.id)}
              disabled={delMut.isPending}
            >
              {delMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
