import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { fmtIST } from "@/lib/format/time";
import { timeLogAuditQuery } from "@/lib/queries/ops.queries";

type Props = {
  timeLogId: string;
  userName: (uid: string) => string;
};

const LABEL: Record<string, string> = {
  effective_override: "Effective",
  break_minutes: "Break",
  note: "Note",
  billable: "Billable",
  started_at: "Start",
  ended_at: "End",
  duration_minutes: "Tracked",
};

function fmtVal(field: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (field === "effective_override" || field === "break_minutes" || field === "duration_minutes") {
    return `${(Number(v) / 60).toFixed(2)}h`;
  }
  if (field === "billable") return v ? "Yes" : "No";
  return String(v);
}

export function AuditHistoryPopover({ timeLogId, userName }: Props) {
  const { data, isLoading } = useQuery(timeLogAuditQuery(timeLogId));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          title="Change history"
          aria-label="Change history"
        >
          <History className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="px-3 py-2 border-b text-xs font-medium">Change history</div>
        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="p-3 text-xs text-muted-foreground">Loading…</div>
          ) : !data || data.length === 0 ? (
            <div className="p-3 text-xs text-muted-foreground">No changes recorded.</div>
          ) : (
            <ul className="divide-y">
              {data.map((row) => {
                const before = (row.before ?? {}) as Record<string, unknown>;
                const after = (row.after ?? {}) as Record<string, unknown>;
                const fields = (row.fields ?? []) as string[];
                return (
                  <li key={row.id} className="px-3 py-2 text-[11px] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-muted-foreground">
                        {fmtIST(row.created_at)}
                      </span>
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">
                        {row.action}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">
                      {row.actor_id ? userName(row.actor_id) : "system"}
                    </div>
                    {row.action === "create" ? (
                      <div className="text-muted-foreground italic">Created</div>
                    ) : (
                      <ul className="space-y-0.5">
                        {fields.map((f) => (
                          <li key={f} className="flex gap-1.5">
                            <span className="font-medium w-16 shrink-0">{LABEL[f] ?? f}</span>
                            <span
                              className="text-rose-600 line-through truncate max-w-[80px]"
                              title={String(before[f] ?? "")}
                            >
                              {fmtVal(f, before[f])}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span
                              className="text-emerald-700 dark:text-emerald-300 truncate max-w-[80px]"
                              title={String(after[f] ?? "")}
                            >
                              {fmtVal(f, after[f])}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
