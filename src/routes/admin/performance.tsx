import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { perfEventsQuery, type PerfRow } from "@/lib/queries/admin.queries";

export const Route = createFileRoute("/admin/performance")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/activity-audit", search: { tab: "performance" } });
  },
});

const RANGES = [
  { label: "Last 1 hour", hours: 1 },
  { label: "Last 24 hours", hours: 24 },
  { label: "Last 7 days", hours: 24 * 7 },
];

function p(arr: number[], q: number): number {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return Math.round(sorted[idx]);
}

export function PerformancePage({ embedded = false }: { embedded?: boolean } = {}) {
  const [hours, setHours] = useState(24);
  const [search, setSearch] = useState("");

  const since = useMemo(() => new Date(Date.now() - hours * 3600 * 1000).toISOString(), [hours]);

  const eventsQ = useQuery(perfEventsQuery(hours, since));

  const rows = eventsQ.data ?? [];

  const byRoute = useMemo(() => {
    const map = new Map<string, PerfRow[]>();
    for (const r of rows) {
      const arr = map.get(r.route) ?? [];
      arr.push(r);
      map.set(r.route, arr);
    }
    return [...map.entries()]
      .map(([route, list]) => {
        const renders = list.map((r) => r.render_ms ?? 0).filter((n) => n > 0);
        const ttfbs = list.map((r) => r.ttfb_ms ?? 0).filter((n) => n > 0);
        const fcps = list.map((r) => r.fcp_ms ?? 0).filter((n) => n > 0);
        return {
          route,
          samples: list.length,
          p50: p(renders, 0.5),
          p95: p(renders, 0.95),
          ttfb: p(ttfbs, 0.5),
          fcp: p(fcps, 0.5),
          last: list[0]?.created_at,
        };
      })
      .filter((r) => !search.trim() || r.route.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => b.p95 - a.p95);
  }, [rows, search]);

  const summary = useMemo(() => {
    const renders = rows.map((r) => r.render_ms ?? 0).filter((n) => n > 0);
    const ttfbs = rows.map((r) => r.ttfb_ms ?? 0).filter((n) => n > 0);
    return {
      total: rows.length,
      p50: p(renders, 0.5),
      p95: p(renders, 0.95),
      ttfb: p(ttfbs, 0.5),
    };
  }, [rows]);

  const slowBadge = (ms: number) => {
    if (ms === 0) return <span className="text-muted-foreground">—</span>;
    if (ms > 2000) return <Badge variant="destructive">{ms} ms</Badge>;
    if (ms > 1000) return <Badge>{ms} ms</Badge>;
    return <Badge variant="secondary">{ms} ms</Badge>;
  };

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => eventsQ.refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      ) : (
        <PageHeader
          title="Performance Telemetry"
          description="Real client-side timings (TTFB, render, query) collected from every navigation. Catch slow routes before users complain."
          actions={
            <Button variant="outline" onClick={() => eventsQ.refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          }
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Activity className="h-3 w-3" />
              Samples
            </div>
            <div className="text-2xl font-semibold mt-1">{summary.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Activity className="h-3 w-3" />
              Render p50
            </div>
            <div className="text-2xl font-semibold mt-1">{summary.p50} ms</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Activity className="h-3 w-3" />
              Render p95
            </div>
            <div className="text-2xl font-semibold mt-1">{summary.p95} ms</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              TTFB p50
            </div>
            <div className="text-2xl font-semibold mt-1">{summary.ttfb} ms</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.hours} value={String(r.hours)}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Filter route…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {eventsQ.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                  <TableHead className="text-right">Render p50</TableHead>
                  <TableHead className="text-right">Render p95</TableHead>
                  <TableHead className="text-right">TTFB p50</TableHead>
                  <TableHead className="text-right">FCP p50</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byRoute.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No telemetry yet — navigate around the app to collect samples.
                    </TableCell>
                  </TableRow>
                ) : (
                  byRoute.map((r) => (
                    <TableRow key={r.route}>
                      <TableCell className="font-mono text-xs">{r.route}</TableCell>
                      <TableCell className="text-right">{r.samples}</TableCell>
                      <TableCell className="text-right">{slowBadge(r.p50)}</TableCell>
                      <TableCell className="text-right">{slowBadge(r.p95)}</TableCell>
                      <TableCell className="text-right">{slowBadge(r.ttfb)}</TableCell>
                      <TableCell className="text-right">{slowBadge(r.fcp)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
