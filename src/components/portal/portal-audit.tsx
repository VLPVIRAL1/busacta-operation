import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, History, Loader2, UserCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { portalAuditQuery, type PortalAuditEvent } from "@/lib/queries/portal.queries";

type Props = { firmId: string };

function pretty(v: unknown): string {
  if (v == null) return "";
  return String(v)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Describe an audit event for the client. RLS restricts the feed to
 * `status_changed` / `assignee_changed`; for assignment we deliberately avoid
 * naming internal staff (the payload holds staff UUIDs) and keep it generic.
 */
function describe(e: PortalAuditEvent): { icon: typeof History; text: string } {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  if (e.event_type === "status_changed") {
    const from = p.from ? `${pretty(p.from)} → ` : "";
    return { icon: CheckCircle2, text: `Status moved ${from}${pretty(p.to) || "updated"}` };
  }
  if (e.event_type === "assignee_changed") {
    return { icon: UserCheck, text: "Assignment updated by your team" };
  }
  return { icon: History, text: pretty(e.event_type) };
}

/** Read-only activity feed of the status/assignment changes clients may see. */
export function PortalAudit({ firmId }: Props) {
  const { data, isLoading } = useQuery(portalAuditQuery(firmId));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading activity…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<History className="h-10 w-10" />}
        title="No activity yet"
        description="Status updates on your engagements will appear here as work progresses."
      />
    );
  }

  return (
    <Card className="glass border-border-subtle">
      <CardContent className="p-4">
        <ul className="space-y-3">
          {data.map((e) => {
            const { icon: Icon, text } = describe(e);
            return (
              <li key={e.id} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{e.tasks?.title ?? "Task"}</div>
                  <div className="text-muted-foreground">{text}</div>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {new Date(e.created_at).toLocaleDateString()}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
