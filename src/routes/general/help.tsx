import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/general/help")({
  beforeLoad: () => {
    throw redirect({ to: "/guide/manual" });
  },
});
