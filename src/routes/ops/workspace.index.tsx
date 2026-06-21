import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { OpsWorkspaceSplit } from "@/components/ops/workspace/ops-workspace-split";

const schema = z.object({
  stream: z.enum(["all", "cpa", "direct"]).default("all"),
  q: z.string().default(""),
  selected: z.string().optional(),
  tab: z.enum(["info", "projects", "clients", "logs", "sops"]).default("info"),
});

const defaults = { stream: "all" as const, q: "", tab: "info" as const };

export const Route = createFileRoute("/ops/workspace/")({
  validateSearch: zodValidator(schema),
  search: { middlewares: [stripSearchParams(defaults)] },
  component: WorkspacePage,
  errorComponent: RouteErrorComponent,
});

function WorkspacePage() {
  return (
    <AuthGuard allow={["admin", "employee"]}>
      <AppShell crumbs={[{ label: "Workspace" }]} fullBleed>
        <div className="h-full min-h-0 p-3">
          <OpsWorkspaceSplit />
        </div>
      </AppShell>
    </AuthGuard>
  );
}
