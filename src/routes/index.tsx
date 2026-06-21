import { createFileRoute, useRouter } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://one.busacta.com/" }],
  }),
  component: Index,
  errorComponent: RouteErrorComponent,
});

function Index() {
  const { user, loading, roles } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.navigate({ to: "/login" });
      return;
    }
    const isClient = (roles ?? []).includes("client");
    router.navigate({ to: isClient ? "/portal" : "/global-dashboard" });
  }, [user, loading, roles, router]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </main>
  );
}
