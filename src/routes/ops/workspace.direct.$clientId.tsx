import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";

const schema = z.object({
  tab: z.enum(["info", "projects", "clients", "logs", "sops"]).optional(),
});

export const Route = createFileRoute("/ops/workspace/direct/$clientId")({
  validateSearch: zodValidator(schema),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/ops/workspace",
      search: {
        stream: "direct" as const,
        selected: `direct:${params.clientId}`,
        tab: search.tab ?? "info",
      },
    });
  },
  component: () => null,
});
