import { createFileRoute, redirect } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";

// Backwards-compatible deep link: /tasks/<slug> → /ops/tasks/<slug>.
// The ops task route accepts either a UUID or a slug as $taskId.
export const Route = createFileRoute("/tasks/$taskSlug")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/ops/tasks/$taskId",
      params: { taskId: params.taskSlug },
      replace: true,
    });
  },
  errorComponent: RouteErrorComponent,
});
