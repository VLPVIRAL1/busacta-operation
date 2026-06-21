import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { UnifiedInbox } from "@/components/ops/communication/unified-inbox";
import type { InboxSelection } from "@/components/ops/communication/inbox-list-pane";

type CommSearch = {
  scope?: "dm" | "group" | "task" | "firm" | "project";
  id?: string;
  msg?: string;
};

export const Route = createFileRoute("/ops/communication")({
  validateSearch: (search: Record<string, unknown>): CommSearch => {
    const scope = search.scope;
    const id = search.id;
    const msg = search.msg;
    const validScopes = ["dm", "group", "task", "firm", "project"] as const;
    return {
      scope:
        typeof scope === "string" && (validScopes as readonly string[]).includes(scope)
          ? (scope as CommSearch["scope"])
          : undefined,
      id: typeof id === "string" ? id : undefined,
      msg: typeof msg === "string" ? msg : undefined,
    };
  },
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "Communication" }]} hideMegaMenu fullBleed>
        <CommunicationPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function CommunicationPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const initial: InboxSelection | null = useMemo(() => {
    if (!search.scope || !search.id) return null;
    if (search.scope === "dm" || search.scope === "group" || search.scope === "task") {
      return { kind: search.scope, id: search.id };
    }
    return null;
  }, [search.scope, search.id]);

  return (
    <div className="flex flex-1 min-h-0 flex-col px-3 py-3 sm:px-4">
      <UnifiedInbox
        initial={initial}
        initialMessageId={search.msg ?? null}
        onMessageJumpDone={() =>
          void navigate({ search: (p: CommSearch) => ({ ...p, msg: undefined }), replace: true })
        }
        onSelectionChange={(sel) =>
          void navigate({
            search: sel ? { scope: sel.kind, id: sel.id } : {},
            replace: false,
          })
        }
      />
    </div>
  );
}
