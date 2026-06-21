import type { ReactNode } from "react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";

/**
 * Shared shell for every /clients/* route. Wraps the AppShell in
 * `theme-direct` so the entire hub flips to the Red brand without any
 * component edits. CPA hubs stay on the default blue theme.
 */
export function DirectClientsShell({
  children,
  crumbs,
}: {
  children: ReactNode;
  crumbs: { label: string; to?: string }[];
}) {
  return (
    <AuthGuard allow={["super_admin", "admin", "employee"]}>
      <div className="theme-direct contents">
        <AppShell crumbs={[{ label: "B2C Clients", to: "/clients" }, ...crumbs]}>
          {children}
        </AppShell>
      </div>
    </AuthGuard>
  );
}
