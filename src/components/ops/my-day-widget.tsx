import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sun, X, History as HistoryIcon, Sunrise } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth/auth-context";
import {
  myDayActiveQuery,
  myDayHistoryQuery,
  removeFromMyDay,
  type MyDayRow,
} from "@/lib/queries/ops.queries";
import { fmtDMY } from "@/lib/format/format-date";

export function MyDayWidget() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: active = [], isLoading } = useQuery(myDayActiveQuery(user?.id));
  const { data: history = [] } = useQuery(myDayHistoryQuery(user?.id));
  const [tab, setTab] = useState<"today" | "history">("today");

  const mRemove = useMutation({
    mutationFn: async (taskId: string) => {
      if (!user) throw new Error("Not signed in");
      await removeFromMyDay(taskId, user.id);
    },
    onSuccess: () => {
      toast.success("Removed from My Day");
      qc.invalidateQueries({ queryKey: ["my-day", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const historyByDay = useMemo(() => {
    const map = new Map<string, MyDayRow[]>();
    for (const r of history) {
      const arr = map.get(r.day) ?? [];
      arr.push(r);
      map.set(r.day, arr);
    }
    return Array.from(map.entries());
  }, [history]);

  return (
    <Card className="border-amber-300/30 bg-gradient-to-br from-amber-50/40 to-background dark:from-amber-950/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sunrise className="h-4 w-4 text-amber-500" />
            My Day
            <Badge variant="outline" className="text-[10px]">
              {active.length}
            </Badge>
          </CardTitle>
          <Tabs value={tab} onValueChange={(v) => setTab(v as "today" | "history")}>
            <TabsList className="h-7">
              <TabsTrigger value="today" className="text-xs h-6">
                Today
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs h-6 gap-1">
                <HistoryIcon className="h-3 w-3" /> History
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        {tab === "today" ? (
          isLoading ? (
            <p className="text-xs text-muted-foreground py-3">Loading…</p>
          ) : active.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">
              No tasks pinned for today. Open any task and click the{" "}
              <Sun className="inline h-3 w-3" /> icon to add it to your day.
            </p>
          ) : (
            <ScrollArea className="max-h-[280px]">
              <ul className="space-y-1">
                {active.map((r) => (
                  <MyDayItem key={r.id} row={r} onRemove={() => mRemove.mutate(r.task_id)} />
                ))}
              </ul>
            </ScrollArea>
          )
        ) : (
          <ScrollArea className="max-h-[280px]">
            {historyByDay.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3">No history yet.</p>
            ) : (
              historyByDay.map(([day, items]) => (
                <div key={day} className="mb-2">
                  <div className="text-[10px] uppercase text-muted-foreground px-1 py-1">
                    {fmtDMY(day)}
                  </div>
                  <ul className="space-y-1">
                    {items.map((r) => (
                      <MyDayItem key={r.id} row={r} readOnly />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function MyDayItem({
  row,
  onRemove,
  readOnly,
}: {
  row: MyDayRow;
  onRemove?: () => void;
  readOnly?: boolean;
}) {
  const t = row.tasks;
  if (!t) return null;
  const project = t.client_entities?.projects;
  const firm = project?.firms;
  return (
    <li className="flex items-center gap-2 rounded-md border bg-card/60 px-2 py-1.5 text-xs">
      <Sun className="h-3 w-3 text-amber-500 fill-amber-400 shrink-0" />
      <Link
        to="/ops/tasks/$taskId"
        params={{ taskId: t.id }}
        className="flex-1 min-w-0 hover:text-primary"
      >
        <div className="flex items-center gap-1 truncate">
          {t.display_id && (
            <span className="font-mono text-[10px] text-muted-foreground">{t.display_id}</span>
          )}
          <span className="font-medium truncate">{t.title}</span>
        </div>
        <div className="text-[10px] text-muted-foreground truncate">
          {firm?.name ?? "—"} · {project?.name ?? "—"}
          {t.due_date && <> · Due {fmtDMY(t.due_date)}</>}
        </div>
      </Link>
      {!readOnly && onRemove && (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6 shrink-0"
          onClick={onRemove}
          title="Remove from My Day"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </li>
  );
}
