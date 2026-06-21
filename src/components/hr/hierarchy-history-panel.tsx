// Hierarchy History tab — shows every reporting-line change with
// before/after manager + actor. Supports date / employee / actor / search
// filters and two CSV export scopes (filtered vs entire dataset).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  CalendarRange,
  Download,
  Loader2,
  Search,
  User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { FacetedSingleChip } from "@/components/shared/faceted-multi-chip";
import { DateRangePicker, type SimpleRange } from "@/components/shared/date-range-picker";
import {
  exportHierarchyHistory,
  listHierarchyHistory,
  type OrgNode,
} from "@/lib/hr/hierarchy.functions";
import { buildHistoryCsv, todayStamp } from "@/lib/hr/hierarchy-csv";
import { downloadCSV } from "@/lib/format/csv";
import { toast } from "sonner";

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function HierarchyHistoryPanel({ nodes = [] }: { nodes?: OrgNode[] }) {
  const fn = useServerFn(listHierarchyHistory);
  const exportFn = useServerFn(exportHierarchyHistory);

  const [offset, setOffset] = useState(0);
  const limit = 50;

  const [range, setRange] = useState<SimpleRange>({});
  const [employeeId, setEmployeeId] = useState<string>("all");
  const [actorId, setActorId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const filters = useMemo(
    () => ({
      employeeId: employeeId === "all" ? null : employeeId,
      actorId: actorId === "all" ? null : actorId,
      fromDate: range.from ?? null,
      toDate: range.to ?? null,
      search: search.trim() || null,
    }),
    [employeeId, actorId, range.from, range.to, search],
  );

  const q = useQuery({
    queryKey: ["hr", "hierarchy-history", filters, offset, limit],
    queryFn: () => fn({ data: { ...filters, offset, limit } }),
  });

  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;

  const personOptions = useMemo(() => {
    const opts = nodes
      .map((n) => ({
        value: n.id,
        label: n.full_name || n.email || n.id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [{ value: "all", label: "Anyone" }, ...opts];
  }, [nodes]);

  const resetFilters = () => {
    setEmployeeId("all");
    setActorId("all");
    setRange({});
    setSearch("");
    setOffset(0);
  };

  const hasActiveFilters =
    employeeId !== "all" || actorId !== "all" || !!range.from || !!range.to || !!search.trim();

  const doExport = async (scope: "filtered" | "all") => {
    setExporting(true);
    try {
      const res = await exportFn({
        data: scope === "all" ? { scope } : { ...filters, scope },
      });
      const csv = buildHistoryCsv(res.rows);
      const suffix = scope === "all" ? "all" : "filtered";
      downloadCSV(`org-hierarchy-history-${suffix}-${todayStamp()}.csv`, csv);
      toast.success(`Exported ${res.rows.length} change${res.rows.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            placeholder="Search name or email…"
            className="h-7 w-56 pl-7 text-xs"
          />
        </div>
        <FacetedSingleChip
          icon={<UserIcon className="h-3 w-3" />}
          label="Employee"
          value={employeeId}
          emptyValue="all"
          onChange={(v) => {
            setEmployeeId(v);
            setOffset(0);
          }}
          options={personOptions}
        />
        <FacetedSingleChip
          icon={<UserIcon className="h-3 w-3" />}
          label="Changed by"
          value={actorId}
          emptyValue="all"
          onChange={(v) => {
            setActorId(v);
            setOffset(0);
          }}
          options={personOptions}
        />
        <DateRangePicker
          value={range}
          onChange={(r) => {
            setRange(r);
            setOffset(0);
          }}
          className="h-7 w-[230px]"
          placeholder="Date range"
        />
        {hasActiveFilters && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={resetFilters}>
            Reset
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {total} change{total === 1 ? "" : "s"}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={exporting}
                title="Export CSV"
                aria-label="Export CSV"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={exporting} onSelect={() => void doExport("filtered")}>
                <CalendarRange className="mr-2 h-4 w-4" />
                Export filtered ({total})
              </DropdownMenuItem>
              <DropdownMenuItem disabled={exporting} onSelect={() => void doExport("all")}>
                <Download className="mr-2 h-4 w-4" />
                Download all
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "No matches" : "No reporting-line changes yet"}
          description={
            hasActiveFilters
              ? "Try clearing the filters or widening the date range."
              : "Edits made from the tree or list view will appear here."
          }
        />
      ) : (
        <div className="overflow-auto max-h-[calc(100vh-380px)]">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Employee</th>
                <th className="px-3 py-2 text-left">Before → After</th>
                <th className="px-3 py-2 text-left">Changed by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap" title={r.changed_at}>
                    {fmt(r.changed_at)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.employee.full_name ?? "—"}</div>
                    {r.employee.email && (
                      <div className="text-xs text-muted-foreground">{r.employee.email}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="inline-flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {r.old_manager?.full_name ?? "— none —"}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs">
                        {r.new_manager?.full_name ?? "— none —"}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div>{r.actor?.full_name ?? "—"}</div>
                    {r.actor?.email && (
                      <div className="text-xs text-muted-foreground">{r.actor.email}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > limit && (
        <div className="flex items-center justify-end gap-2 border-t px-3 py-2 text-xs">
          <Button
            size="sm"
            variant="ghost"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
