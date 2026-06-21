import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export type PortalAccessDeniedVariant =
  | "foreign-task"
  | "foreign-project"
  | "archived"
  | "no-access";

const COPY: Record<
  PortalAccessDeniedVariant,
  { title: string; description: string; backLabel: string; backTo: "/portal" | "/portal/projects" }
> = {
  "foreign-task": {
    title: "Task not available",
    description:
      "This task is either internal, archived, or not part of your firm's engagement. If you believe this is a mistake, contact your accountant.",
    backLabel: "Back to portal",
    backTo: "/portal",
  },
  "foreign-project": {
    title: "Project not available",
    description:
      "This project is either archived or not part of your firm's engagements. If you believe this is a mistake, contact your accountant.",
    backLabel: "Back to projects",
    backTo: "/portal/projects",
  },
  archived: {
    title: "No longer available",
    description: "This item has been archived by your accounting team.",
    backLabel: "Back to portal",
    backTo: "/portal",
  },
  "no-access": {
    title: "Portal access not enabled",
    description:
      "Your accountant has not granted portal access for this email. Please contact your firm so they can grant you access.",
    backLabel: "Back to portal",
    backTo: "/portal",
  },
};

/**
 * Unified access-denied surface for the Client Portal.
 *
 * Stable selectors for Playwright:
 *   - data-testid="portal-access-denied"
 *   - data-variant="<variant>"
 *
 * Copy is intentionally generic — it must never reveal whether the row
 * exists, who owns it, or what its internal title is.
 */
export function PortalAccessDenied({ variant }: { variant: PortalAccessDeniedVariant }) {
  const c = COPY[variant];
  return (
    <Card
      className="glass border-white/40"
      data-testid="portal-access-denied"
      data-variant={variant}
    >
      <CardContent className="space-y-3 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">{c.title}</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{c.description}</p>
        <Link to={c.backTo} className="text-sm text-primary hover:underline">
          ← {c.backLabel}
        </Link>
      </CardContent>
    </Card>
  );
}
