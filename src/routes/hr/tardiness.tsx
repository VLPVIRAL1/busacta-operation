import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Download, Upload, Loader2, AlertTriangle } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { supabase } from "@/integrations/supabase/client";
import { SortableTh, type SortState } from "@/components/shared/sortable-th";
import { PaginationFooter } from "@/components/shared/pagination-footer";

type TardinessSearch = { employee?: string };

export const Route = createFileRoute("/hr/tardiness")({
  validateSearch: (search: Record<string, unknown>): TardinessSearch => ({
    employee: typeof search.employee === "string" ? search.employee : undefined,
  }),
  component: () => (
    <AuthGuard allow={["admin", "super_admin", "hr_manager"]}>
      <AppShell
        crumbs={[{ label: "Human Resources", to: "/hr/employees" }, { label: "Tardiness Tracker" }]}
      >
        <TardinessPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type LogRow = {
  id: string;
  employee_code: string | null;
  employee_name: string;
  department: string | null;
  entry_date: string;
  is_late_arrival: boolean;
  is_early_checkout: boolean;
  late_by_minutes: number;
  early_by_minutes: number;
  auto_status: string;
};

type TardinessSortKey = "entry_date" | "employee_name" | "department" | "minutes" | "auto_status";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function monthStartISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(",")]
    .concat(
      rows.map((r) =>
        headers
          .map((h) => {
            const v = r[h];
            if (v == null) return "";
            const s = String(v).replace(/"/g, '""');
            return /[",\n]/.test(s) ? `"${s}"` : s;
          })
          .join(","),
      ),
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function TardinessPage() {
  const search = useSearch({ from: "/hr/tardiness" });
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [department, setDepartment] = useState<string>("all");
  const [employee, setEmployee] = useState<string>(search.employee ?? "all");
  const [tab, setTab] = useState<"late" | "early" | "by-employee">("late");

  useEffect(() => {
    if (search.employee && search.employee !== employee) {
      setEmployee(search.employee);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.employee]);

  // Lightweight query for filter dropdowns + by-employee aggregation (capped)
  const facetsQ = useQuery({
    queryKey: ["tardiness-facets", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_logs")
        .select(
          "employee_code,employee_name,department,is_late_arrival,is_early_checkout,late_by_minutes,early_by_minutes",
        )
        .gte("entry_date", from)
        .lte("entry_date", to)
        .or("is_late_arrival.eq.true,is_early_checkout.eq.true")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Pick<
        LogRow,
        | "employee_code"
        | "employee_name"
        | "department"
        | "is_late_arrival"
        | "is_early_checkout"
        | "late_by_minutes"
        | "early_by_minutes"
      >[];
    },
  });

  const departments = useMemo(() => {
    const s = new Set<string>();
    (facetsQ.data ?? []).forEach((r) => r.department && s.add(r.department));
    return Array.from(s).sort();
  }, [facetsQ.data]);

  const employees = useMemo(() => {
    const m = new Map<string, string>();
    (facetsQ.data ?? [])
      .filter((r) => department === "all" || r.department === department)
      .forEach((r) => {
        const key = r.employee_code || r.employee_name;
        m.set(key, `${r.employee_name}${r.employee_code ? ` (${r.employee_code})` : ""}`);
      });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [facetsQ.data, department]);

  const fileSuffix = `${from}-to-${to}${department !== "all" ? `-${department}` : ""}${employee !== "all" ? `-${employee}` : ""}`;

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3">
      {/* Slim header */}
      <div className="flex items-center justify-between gap-3 border-b pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <h1 className="text-sm font-semibold shrink-0">Tardiness Tracker</h1>
          <span className="hidden truncate text-xs text-muted-foreground md:inline">
            Late arrivals &amp; early checkouts from imported attendance logs
          </span>
        </div>
        <Button asChild variant="outline" size="sm" className="h-7 shrink-0 text-xs">
          <Link to="/hr/attendance/import">
            <Upload className="h-3.5 w-3.5" /> Import
          </Link>
        </Button>
      </div>

      {/* Compact filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker
          value={{ from, to }}
          onChange={(r) => {
            setFrom(r.from ?? monthStartISO());
            setTo(r.to ?? todayISO());
          }}
          className="h-8 w-[260px]"
          placeholder="Date range"
        />
        <Select
          value={department}
          onValueChange={(v) => {
            setDepartment(v);
            setEmployee("all");
          }}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={employee} onValueChange={setEmployee}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All employees</SelectItem>
            {employees.map(([k, label]) => (
              <SelectItem key={k} value={k}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <ExportCsvButton
            kind="late"
            label="Late CSV"
            filename={`late-arrivals-${fileSuffix}.csv`}
            from={from}
            to={to}
            department={department}
            employee={employee}
          />
          <ExportCsvButton
            kind="early"
            label="Early CSV"
            filename={`early-checkouts-${fileSuffix}.csv`}
            from={from}
            to={to}
            department={department}
            employee={employee}
          />
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as typeof tab)}
        className="flex flex-1 min-h-0 flex-col"
      >
        <TabsList className="h-auto gap-1 bg-transparent p-0">
          <TabsTrigger
            value="late"
            className="rounded-b-none border-t-2 border-transparent text-xs data-[state=active]:border-amber-500 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-700 data-[state=active]:shadow-none dark:data-[state=active]:text-amber-300"
          >
            Late arrivals
          </TabsTrigger>
          <TabsTrigger
            value="early"
            className="rounded-b-none border-t-2 border-transparent text-xs data-[state=active]:border-sky-500 data-[state=active]:bg-sky-500/10 data-[state=active]:text-sky-700 data-[state=active]:shadow-none dark:data-[state=active]:text-sky-300"
          >
            Early checkouts
          </TabsTrigger>
          <TabsTrigger
            value="by-employee"
            className="rounded-b-none border-t-2 border-transparent text-xs data-[state=active]:border-violet-500 data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-700 data-[state=active]:shadow-none dark:data-[state=active]:text-violet-300"
          >
            By employee
          </TabsTrigger>
        </TabsList>
        <TabsContent value="late" className="flex-1 min-h-0 mt-2">
          <PaginatedDetailTable
            kind="late"
            from={from}
            to={to}
            department={department}
            employee={employee}
          />
        </TabsContent>
        <TabsContent value="early" className="flex-1 min-h-0 mt-2">
          <PaginatedDetailTable
            kind="early"
            from={from}
            to={to}
            department={department}
            employee={employee}
          />
        </TabsContent>
        <TabsContent value="by-employee" className="flex-1 min-h-0 mt-2">
          {facetsQ.isLoading ? (
            <Skeleton className="h-64" />
          ) : (
            <ByEmployeeTable
              rows={(facetsQ.data ?? []).filter((r) => {
                if (department !== "all" && r.department !== department) return false;
                if (employee !== "all" && (r.employee_code || r.employee_name) !== employee)
                  return false;
                return true;
              })}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExportCsvButton({
  kind,
  label,
  filename,
  from,
  to,
  department,
  employee,
}: {
  kind: "late" | "early";
  label: string;
  filename: string;
  from: string;
  to: string;
  department: string;
  employee: string;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          let q = supabase
            .from("attendance_logs")
            .select(
              "entry_date,employee_code,employee_name,department,late_by_minutes,early_by_minutes,auto_status",
            )
            .gte("entry_date", from)
            .lte("entry_date", to)
            .eq(kind === "late" ? "is_late_arrival" : "is_early_checkout", true)
            .order("entry_date", { ascending: false })
            .limit(50000);
          if (department !== "all") q = q.eq("department", department);
          if (employee !== "all")
            q = q.or(`employee_code.eq.${employee},employee_name.eq.${employee}`);
          const { data, error } = await q;
          if (error) throw error;
          downloadCsv(filename, (data ?? []) as Record<string, unknown>[]);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}{" "}
      {label}
    </Button>
  );
}

function PaginatedDetailTable({
  kind,
  from,
  to,
  department,
  employee,
}: {
  kind: "late" | "early";
  from: string;
  to: string;
  department: string;
  employee: string;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<SortState<TardinessSortKey>>({ key: "entry_date", dir: "desc" });

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [from, to, department, employee, kind, pageSize, sort.key, sort.dir]);

  const sortColumn =
    sort.key === "minutes" ? (kind === "late" ? "late_by_minutes" : "early_by_minutes") : sort.key;

  const q = useQuery({
    queryKey: [
      "tardiness",
      kind,
      from,
      to,
      department,
      employee,
      page,
      pageSize,
      sort.key,
      sort.dir,
    ],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const fromIdx = (page - 1) * pageSize;
      const toIdx = fromIdx + pageSize - 1;
      let req = supabase
        .from("attendance_logs")
        .select(
          "id,employee_code,employee_name,department,entry_date,is_late_arrival,is_early_checkout,late_by_minutes,early_by_minutes,auto_status",
          { count: "exact" },
        )
        .gte("entry_date", from)
        .lte("entry_date", to)
        .eq(kind === "late" ? "is_late_arrival" : "is_early_checkout", true)
        .order(sortColumn, { ascending: sort.dir === "asc" })
        .range(fromIdx, toIdx);
      if (department !== "all") req = req.eq("department", department);
      if (employee !== "all")
        req = req.or(`employee_code.eq.${employee},employee_name.eq.${employee}`);
      const { data, error, count } = await req;
      if (error) throw error;
      return { rows: (data ?? []) as LogRow[], total: count ?? 0 };
    },
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  return (
    <Card className="flex flex-col h-full min-h-0">
      <CardContent className="p-0 flex flex-1 min-h-0 flex-col">
        <div className="flex-1 min-h-0 overflow-auto relative">
          {q.isFetching && (
            <div className="absolute right-3 top-2 z-10">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <SortableTh<TardinessSortKey>
                  field="entry_date"
                  label="Date"
                  sort={sort}
                  onSortChange={setSort}
                  className="text-left"
                />
                <SortableTh<TardinessSortKey>
                  field="employee_name"
                  label="Employee"
                  sort={sort}
                  onSortChange={setSort}
                  className="text-left"
                />
                <SortableTh<TardinessSortKey>
                  field="department"
                  label="Department"
                  sort={sort}
                  onSortChange={setSort}
                  className="text-left"
                />
                <SortableTh<TardinessSortKey>
                  field="minutes"
                  label={kind === "late" ? "Late by" : "Early by"}
                  sort={sort}
                  onSortChange={setSort}
                  className="text-right"
                />
                <SortableTh<TardinessSortKey>
                  field="auto_status"
                  label="Status"
                  sort={sort}
                  onSortChange={setSort}
                  className="text-left"
                />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.entry_date}</td>
                  <td className="p-2">
                    <div className="font-medium">{r.employee_name}</div>
                    <div className="text-xs text-muted-foreground">{r.employee_code}</div>
                  </td>
                  <td className="p-2">{r.department ?? "—"}</td>
                  <td className="p-2 text-right">
                    <Badge
                      variant="outline"
                      className={
                        kind === "late"
                          ? "border-amber-400 text-amber-800 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/40"
                          : "border-blue-400 text-blue-800 bg-blue-50 dark:bg-blue-500/15 dark:text-blue-200 dark:border-blue-500/40"
                      }
                    >
                      {kind === "late" ? `+${r.late_by_minutes}m` : `-${r.early_by_minutes}m`}
                    </Badge>
                  </td>
                  <td className="p-2 capitalize">{r.auto_status.replace("_", " ")}</td>
                </tr>
              ))}
              {!q.isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No rows in this range.
                  </td>
                </tr>
              )}
              {q.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    <td colSpan={5} className="p-2">
                      <Skeleton className="h-5 w-full" />
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
          onPageSizeChange={setPageSize}
          isLoading={q.isLoading}
        />
      </CardContent>
    </Card>
  );
}

function ByEmployeeTable({
  rows,
}: {
  rows: Pick<
    LogRow,
    | "employee_code"
    | "employee_name"
    | "department"
    | "is_late_arrival"
    | "is_early_checkout"
    | "late_by_minutes"
    | "early_by_minutes"
  >[];
}) {
  const merged = useMemo(() => {
    type Agg = {
      key: string;
      name: string;
      code: string;
      department: string | null;
      lateCount: number;
      lateSum: number;
      earlyCount: number;
      earlySum: number;
    };
    const m = new Map<string, Agg>();
    for (const r of rows) {
      const key = r.employee_code || r.employee_name;
      const cur = m.get(key) ?? {
        key,
        name: r.employee_name,
        code: r.employee_code ?? "",
        department: r.department,
        lateCount: 0,
        lateSum: 0,
        earlyCount: 0,
        earlySum: 0,
      };
      if (r.is_late_arrival) {
        cur.lateCount += 1;
        cur.lateSum += r.late_by_minutes;
      }
      if (r.is_early_checkout) {
        cur.earlyCount += 1;
        cur.earlySum += r.early_by_minutes;
      }
      m.set(key, cur);
    }
    return Array.from(m.values()).sort(
      (a, b) => b.lateCount + b.earlyCount - (a.lateCount + a.earlyCount),
    );
  }, [rows]);

  return (
    <Card className="flex flex-col h-full min-h-0">
      <CardContent className="p-0 flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">Employee</th>
              <th className="text-right p-2">Late count</th>
              <th className="text-right p-2">Avg late</th>
              <th className="text-right p-2">Early count</th>
              <th className="text-right p-2">Avg early</th>
            </tr>
          </thead>
          <tbody>
            {merged.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="p-2">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.code}
                    {r.department ? ` · ${r.department}` : ""}
                  </div>
                </td>
                <td className="p-2 text-right">{r.lateCount}</td>
                <td className="p-2 text-right">
                  {r.lateCount ? `${Math.round(r.lateSum / r.lateCount)}m` : "—"}
                </td>
                <td className="p-2 text-right">{r.earlyCount}</td>
                <td className="p-2 text-right">
                  {r.earlyCount ? `${Math.round(r.earlySum / r.earlyCount)}m` : "—"}
                </td>
              </tr>
            ))}
            {merged.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
