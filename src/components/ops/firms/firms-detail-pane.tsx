import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  Clock,
  ExternalLink,
  Mail,
  Phone,
  NotebookPen,
  Users,
  GitBranch,
  ClipboardList,
  Timer,
  Activity,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FirmCode } from "@/components/shared/entity-code";
import { AssigneeStack } from "@/components/shared/assignee-stack";
import { EmptyState } from "@/components/shared/empty-state";

export type FirmDetailRow = {
  id: string;
  name: string;
  firm_identifier: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  us_timezone: string | null;
  tzShort: string;
  notes: string | null;
  team: Array<{ id: string; name: string; avatar_url: string | null }>;
};

function useLiveClock(timezone: string) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => {
    try {
      const time = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(now);
      const dayDate = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "long",
        month: "short",
        day: "numeric",
      }).format(now);
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        timeZoneName: "short",
      }).formatToParts(now);
      const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
      return { time, dayDate, tzName, ok: true as const };
    } catch {
      return { time: "—", dayDate: "Invalid timezone", tzName: timezone, ok: false as const };
    }
  }, [now, timezone]);
}

const TABS: Array<{
  to:
    | "/ops/firms/$firmId"
    | "/ops/firms/$firmId/pipeline"
    | "/ops/firms/$firmId/clients"
    | "/ops/firms/$firmId/timesheet"
    | "/ops/firms/$firmId/activity"
    | "/ops/firms/$firmId/sops"
    | "/ops/firms/$firmId/communication";
  label: string;
  icon: typeof Building2;
}> = [
  { to: "/ops/firms/$firmId", label: "Overview", icon: Building2 },
  { to: "/ops/firms/$firmId/pipeline", label: "Pipeline", icon: GitBranch },
  { to: "/ops/firms/$firmId/clients", label: "Clients", icon: ClipboardList },
  { to: "/ops/firms/$firmId/timesheet", label: "Timesheet", icon: Timer },
  { to: "/ops/firms/$firmId/activity", label: "Activity", icon: Activity },
  { to: "/ops/firms/$firmId/sops", label: "SOPs", icon: FileText },
];

/**
 * Right pane of the Firms split view — compact firm summary plus quick
 * links to all firm tabs. Reuses the same data row already loaded for the
 * list pane to avoid duplicate queries.
 */
export function FirmsDetailPane({
  firm,
  onEdit,
}: {
  firm: FirmDetailRow | null;
  onEdit?: (firmId: string) => void;
}) {
  const tz = firm?.us_timezone || "America/New_York";
  const clock = useLiveClock(tz);

  if (!firm) {
    return (
      <div className="h-full grid place-items-center p-6">
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title="No firm selected"
          description="Pick a firm from the list to see details."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-2">
        <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
        <FirmCode code={firm.firm_identifier} name={firm.name} />
        <span className="font-semibold truncate">{firm.name}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {onEdit && (
            <Button size="sm" variant="outline" onClick={() => onEdit(firm.id)}>
              Edit
            </Button>
          )}
          <Button asChild size="sm">
            <Link to="/ops/firms/$firmId" params={{ firmId: firm.id }}>
              Open page
              <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {/* Live US clock */}
        <section className="rounded-xl border bg-gradient-to-br from-primary/5 to-transparent p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
            <Clock className="h-3.5 w-3.5" />
            Live US Time
            <Badge variant="outline" className="ml-auto text-[10px]">
              {tz}
            </Badge>
          </div>
          <div className="font-mono text-2xl font-semibold tabular-nums">{clock.time}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {clock.dayDate} • {clock.tzName}
          </div>
        </section>

        {/* Contact */}
        <section className="rounded-xl border p-4 space-y-2 text-sm">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Contact</div>
          <div className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{firm.contact_email || "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{firm.contact_phone || "—"}</span>
          </div>
        </section>

        {/* Team */}
        <section className="rounded-xl border p-4 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Assigned Offshore Team
            <span className="ml-auto tabular-nums">{firm.team.length}</span>
          </div>
          {firm.team.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">No team assigned yet.</div>
          ) : (
            <AssigneeStack people={firm.team} max={8} size="md" />
          )}
        </section>

        {/* Notes */}
        {firm.notes && (
          <section className="rounded-xl border p-4 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <NotebookPen className="h-3.5 w-3.5" />
              Notes
            </div>
            <p className="text-sm whitespace-pre-wrap">{firm.notes}</p>
          </section>
        )}

        <Separator />

        {/* Quick links to tabs */}
        <section>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
            Workspace
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TABS.map((t) => (
              <Button key={t.to} asChild variant="outline" size="sm" className="justify-start h-9">
                <Link to={t.to} params={{ firmId: firm.id }}>
                  <t.icon className="h-3.5 w-3.5 mr-2" />
                  {t.label}
                </Link>
              </Button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
