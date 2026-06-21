import { createFileRoute, redirect } from "@tanstack/react-router";
import { Suspense } from "react";
import { PageHeader } from "@/components/shell/app-shell";
import { TemplateList } from "@/components/pdf-templates/template-list";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/templates")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/settings", search: { tab: "templates" } });
  },
});

export function TemplatesPage({ embedded = false }: { embedded?: boolean } = {}) {
  return (
    <>
      {!embedded && (
        <PageHeader
          title="PDF Templates"
          description="Design branded layouts for invoices, salary slips, and financial reports."
        />
      )}
      <Suspense fallback={<ListSkeleton />}>
        <TemplateList />
      </Suspense>
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded" />
      ))}
    </div>
  );
}
