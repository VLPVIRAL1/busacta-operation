import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy deep-link. Operations has its OWN dedicated firm page at
// /ops/firms/$firmId — it is intentionally NOT the client firm hub
// (/clients/firm/$firmId). This route only forwards old bookmarks to the
// dedicated Ops firm page so the client hub is never pulled into Operations.
export const Route = createFileRoute("/ops/workspace/firms/$firmId")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/ops/firms/$firmId", params: { firmId: params.firmId } });
  },
  component: () => null,
});
