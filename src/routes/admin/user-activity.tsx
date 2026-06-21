import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  Activity,
  Download,
  Search,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Eye,
  X,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { SortableTh, type SortState } from "@/components/shared/sortable-th";
import { PaginationFooter } from "@/components/shared/pagination-footer";
import { supabase } from "@/integrations/supabase/client";
import { downloadCSV, toCSV } from "@/lib/format/csv";

export const Route = createFileRoute("/admin/user-activity")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/activity-audit", search: { tab: "login" } });
  },
});

type LoginEvent = {
  id: string;
  user_id: string;
  user_email: string | null;
  ip_address: string | null;
  device_type: string | null;
  device_name: string | null;
  browser: string | null;
  browser_version: string | null;
  os: string | null;
  os_version: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  language: string | null;
  screen_resolution: string | null;
  user_agent: string | null;
  session_id: string | null;
  event_type: string;
  created_at: string;
};

type SortKey =
  | "created_at"
  | "user_email"
  | "ip_address"
  | "country"
  | "device_type"
  | "browser"
  | "os";

function DeviceIcon({ type }: { type: string | null }) {
  if (type === "mobile") return <Smartphone className="h-4 w-4" />;
  if (type === "tablet") return <Tablet className="h-4 w-4" />;
  return <Monitor className="h-4 w-4" />;
}

export function UserActivityPage({ embedded = false }: { embedded?: boolean } = {}) {
  if (embedded) return <Inner embedded />;
  return (
    <AuthGuard allow={["admin", "super_admin", "hr_manager"]}>
      <AppShell>
        <Inner />
      </AppShell>
    </AuthGuard>
  );
}

function Inner({ embedded = false }: { embedded?: boolean }) {
  const today = new Date().toISOString().slice(0, 10);
  const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(sevenAgo);
  const [to, setTo] = useState(today);
  const [q, setQ] = useState("");
  const [deviceFilter, setDeviceFilter] = useState<"all" | "desktop" | "mobile" | "tablet">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "created_at", dir: "desc" });
  const [selected, setSelected] = useState<LoginEvent | null>(null);

  // Reset to page 1 when filters change.
  const filtersKey = `${from}|${to}|${q}|${deviceFilter}|${sort.key}|${sort.dir}|${pageSize}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useResetPage(setPage, filtersKey);

  const { data, isFetching, isLoading } = useQuery({
    queryKey: ["login-events", from, to, q, deviceFilter, sort.key, sort.dir, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const fromIdx = (page - 1) * pageSize;
      const toIdx = fromIdx + pageSize - 1;
      let query = supabase
        .from("login_events" as never)
        .select("*", { count: "exact" })
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59.999`);
      if (deviceFilter !== "all") query = query.eq("device_type", deviceFilter);
      const term = q.trim();
      if (term) {
        // Server-side OR across the searchable text columns.
        const safe = term.replace(/[,()]/g, " ");
        query = query.or(
          [
            `user_email.ilike.%${safe}%`,
            `ip_address.ilike.%${safe}%`,
            `browser.ilike.%${safe}%`,
            `os.ilike.%${safe}%`,
            `device_name.ilike.%${safe}%`,
            `city.ilike.%${safe}%`,
            `country.ilike.%${safe}%`,
          ].join(","),
        );
      }
      query = query
        .order(sort.key, { ascending: sort.dir === "asc", nullsFirst: false })
        .range(fromIdx, toIdx);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as LoginEvent[], total: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const exportCsv = async () => {
    // Export the current filtered set, not just the visible page (capped to 5000).
    const fromIdx = 0;
    const toIdx = Math.min(total, 5000) - 1;
    let query = supabase
      .from("login_events" as never)
      .select("*")
      .gte("created_at", `${from}T00:00:00`)
      .lte("created_at", `${to}T23:59:59.999`);
    if (deviceFilter !== "all") query = query.eq("device_type", deviceFilter);
    const term = q.trim();
    if (term) {
      const safe = term.replace(/[,()]/g, " ");
      query = query.or(
        [
          `user_email.ilike.%${safe}%`,
          `ip_address.ilike.%${safe}%`,
          `browser.ilike.%${safe}%`,
          `os.ilike.%${safe}%`,
          `device_name.ilike.%${safe}%`,
          `city.ilike.%${safe}%`,
          `country.ilike.%${safe}%`,
        ].join(","),
      );
    }
    query = query
      .order(sort.key, { ascending: sort.dir === "asc", nullsFirst: false })
      .range(fromIdx, Math.max(0, toIdx));
    const { data: all } = await query;
    const list = (all ?? []) as unknown as LoginEvent[];
    const csvRows = list.map((e) => ({
      time: new Date(e.created_at).toISOString(),
      user: e.user_email ?? e.user_id,
      event: e.event_type,
      ip: e.ip_address ?? "",
      country: e.country ?? "",
      region: e.region ?? "",
      city: e.city ?? "",
      device: e.device_name ?? "",
      device_type: e.device_type ?? "",
      os: `${e.os ?? ""} ${e.os_version ?? ""}`.trim(),
      browser: `${e.browser ?? ""} ${e.browser_version ?? ""}`.trim(),
      screen: e.screen_resolution ?? "",
      timezone: e.timezone ?? "",
      language: e.language ?? "",
      user_agent: e.user_agent ?? "",
    }));
    downloadCSV(`user-activity-${from}_to_${to}.csv`, toCSV(csvRows));
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="User Activity Report"
          description="Sign-in events with device, browser, OS, IP, and location details."
        />
      )}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-0 sm:min-w-[220px]">
            <label className="text-xs text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="email, IP, browser, OS, city…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Device type</label>
            <Select
              value={deviceFilter}
              onValueChange={(v) => setDeviceFilter(v as typeof deviceFilter)}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All devices</SelectItem>
                <SelectItem value="desktop">Desktop</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="tablet">Tablet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={exportCsv}
            disabled={total === 0}
            title="Export CSV"
            aria-label="Export CSV"
          >
            <Download className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : total === 0 ? (
            <EmptyState
              icon={<Activity className="h-6 w-6" />}
              title="No sign-in activity"
              description="Try widening the date range or clearing the search."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <SortableTh
                        field="created_at"
                        label="When"
                        sort={sort}
                        onSortChange={setSort}
                      />
                      <SortableTh
                        field="user_email"
                        label="User"
                        sort={sort}
                        onSortChange={setSort}
                      />
                      <SortableTh
                        field="device_type"
                        label="Device"
                        sort={sort}
                        onSortChange={setSort}
                      />
                      <SortableTh
                        field="browser"
                        label="Browser"
                        sort={sort}
                        onSortChange={setSort}
                      />
                      <SortableTh field="os" label="OS" sort={sort} onSortChange={setSort} />
                      <SortableTh
                        field="ip_address"
                        label="IP"
                        sort={sort}
                        onSortChange={setSort}
                      />
                      <SortableTh
                        field="country"
                        label="Location"
                        sort={sort}
                        onSortChange={setSort}
                      />
                      <th className="px-3 py-2 text-xs uppercase text-muted-foreground"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr
                        key={e.id}
                        className="border-t hover:bg-muted/30 cursor-pointer"
                        onClick={() => setSelected(e)}
                      >
                        <td className="px-3 py-2 whitespace-nowrap">
                          {new Date(e.created_at).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{e.user_email ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">
                            <Badge variant="outline" className="mr-1">
                              {e.event_type}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <DeviceIcon type={e.device_type} />
                            <span>{e.device_name ?? e.device_type ?? "—"}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {e.browser} {e.browser_version}
                        </td>
                        <td className="px-3 py-2">
                          {e.os} {e.os_version}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{e.ip_address ?? "—"}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Globe className="h-3 w-3 text-muted-foreground" />
                            {[e.city, e.region, e.country].filter(Boolean).join(", ") || "—"}
                          </div>
                          {e.timezone && (
                            <div className="text-xs text-muted-foreground">{e.timezone}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setSelected(e);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationFooter
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
                isLoading={isFetching}
              />
            </>
          )}
        </CardContent>
      </Card>

      <DetailsDrawer event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function DetailsDrawer({ event, onClose }: { event: LoginEvent | null; onClose: () => void }) {
  const open = !!event;

  const historyQ = useQuery({
    queryKey: ["login-events", "user-history", event?.user_id],
    enabled: open && !!event?.user_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("login_events" as never)
        .select(
          "id,created_at,ip_address,city,country,device_name,device_type,browser,os,event_type",
        )
        .eq("user_id", event!.user_id)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data ?? []) as unknown as Pick<
        LoginEvent,
        | "id"
        | "created_at"
        | "ip_address"
        | "city"
        | "country"
        | "device_name"
        | "device_type"
        | "browser"
        | "os"
        | "event_type"
      >[];
    },
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        {event && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <DeviceIcon type={event.device_type} /> Sign-in details
              </SheetTitle>
              <SheetDescription>{new Date(event.created_at).toLocaleString()}</SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              <Section title="User">
                <Field label="Email" value={event.user_email} mono />
                <Field label="User ID" value={event.user_id} mono />
                <Field label="Event" value={event.event_type} />
                <Field label="Session" value={event.session_id} mono />
              </Section>

              <Section title="Network">
                <Field label="IP address" value={event.ip_address} mono />
                <Field label="City" value={event.city} />
                <Field label="Region" value={event.region} />
                <Field label="Country" value={event.country} />
                <Field label="Timezone" value={event.timezone} />
              </Section>

              <Section title="Device">
                <Field label="Device" value={event.device_name} />
                <Field label="Type" value={event.device_type} />
                <Field
                  label="Operating system"
                  value={[event.os, event.os_version].filter(Boolean).join(" ")}
                />
                <Field
                  label="Browser"
                  value={[event.browser, event.browser_version].filter(Boolean).join(" ")}
                />
                <Field label="Screen" value={event.screen_resolution} />
                <Field label="Language" value={event.language} />
                <Field label="User agent" value={event.user_agent} mono multiline />
              </Section>

              <Section title="Recent sign-ins for this user">
                {historyQ.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 w-full" />
                    ))}
                  </div>
                ) : (historyQ.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No prior events.</p>
                ) : (
                  <ul className="divide-y rounded-md border">
                    {(historyQ.data ?? []).map((h) => (
                      <li
                        key={h.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <div>
                          <div className="font-medium">
                            {new Date(h.created_at).toLocaleString()}
                          </div>
                          <div className="text-muted-foreground">
                            {h.device_name ?? h.device_type ?? "—"} · {h.browser ?? "—"} ·{" "}
                            {h.os ?? "—"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono">{h.ip_address ?? "—"}</div>
                          <div className="text-muted-foreground">
                            {[h.city, h.country].filter(Boolean).join(", ") || "—"}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>

            <Button variant="outline" size="sm" onClick={onClose} className="mt-4">
              <X className="h-3.5 w-3.5" /> Close
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
        {title}
      </div>
      <div className="divide-y">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  multiline,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 px-3 py-2 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div
        className={`col-span-2 ${mono ? "font-mono" : ""} ${multiline ? "break-all whitespace-pre-wrap" : "truncate"}`}
      >
        {value ?? <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

// Helper: reset page to 1 whenever a filter dependency string changes.
import { useEffect, useRef } from "react";
function useResetPage(setPage: (p: number) => void, key: string) {
  const prev = useRef(key);
  useEffect(() => {
    if (prev.current !== key) {
      prev.current = key;
      setPage(1);
    }
  }, [key, setPage]);
}
