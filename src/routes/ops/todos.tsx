import { createFileRoute } from "@tanstack/react-router";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { TodosTable } from "@/components/ops/todos-table";

export const Route = createFileRoute("/ops/todos")({
  component: TodosPage,
  errorComponent: RouteErrorComponent,
});

function TodosPage() {
  return (
    <AuthGuard>
      <AppShell crumbs={[{ label: "To-Do" }]} fullBleed>
        <TodosTable />
      </AppShell>
    </AuthGuard>
  );
}
