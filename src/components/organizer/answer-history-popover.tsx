import { useState } from "react";
import { Loader2, History as HistoryIcon } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { getResponseHistory } from "@/lib/organizer/history.functions";

export function AnswerHistoryPopover({
  deploymentId,
  blockId,
}: {
  deploymentId: string;
  blockId: string;
}) {
  const fetchHistory = useServerFn(getResponseHistory);
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["organizer", "history", deploymentId, blockId],
    enabled: open,
    queryFn: () => fetchHistory({ data: { deployment_id: deploymentId, block_id: blockId } }),
  });
  const history = data?.history ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          title="View answer history"
          aria-label="View answer history"
        >
          <HistoryIcon className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-2 max-h-96 overflow-y-auto">
        <div className="text-xs font-medium mb-2">Answer history</div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : history.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">No history.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="border-l-2 border-muted pl-2 text-xs">
                <div className="text-muted-foreground">
                  {h.changed_by_name ?? "Unknown"} · {new Date(h.changed_at).toLocaleString()}
                </div>
                <div className="font-mono text-[11px] whitespace-pre-wrap break-words bg-muted/40 rounded px-1.5 py-1 mt-1">
                  {formatVal(h.new_value_json)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v, null, 2);
}
