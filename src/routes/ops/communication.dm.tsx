import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { DirectMessagesPage } from "@/components/ops/direct-messages-page";

type Search = { thread?: string };

export const Route = createFileRoute("/ops/communication/dm")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    thread: typeof s.thread === "string" ? s.thread : undefined,
  }),
  component: () => {
    const { thread } = Route.useSearch();
    return (
      <AuthGuard allow={["super_admin", "admin", "hr_manager", "employee"]}>
        <AppShell
          crumbs={[
            { label: "Communication", to: "/ops/communication" },
            { label: "Direct Messages" },
          ]}
        >
          <DirectMessagesPage initialThreadId={thread ?? null} />
        </AppShell>
      </AuthGuard>
    );
  },
  errorComponent: RouteErrorComponent,
});
