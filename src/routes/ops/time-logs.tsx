import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Clock,
  FileText,
  FileSpreadsheet,
  Search,
  X,
  Users,
  Layers,
  Pencil,
  Copy,
  Save,
  Ban,
  ArrowUp,
  ArrowDown,
  Filter as FilterIcon,
  Settings2,
  Wand2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Building2,
  FolderKanban,
  User as UserIcon,
} from "lucide-react";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/shared/date-range-picker";

import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/shared/empty-state";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FirmCode, ProjectCode, formatPickerLabel } from "@/components/shared/entity-code";
import { FacetedSingleChip } from "@/components/shared/faceted-multi-chip";
import { fmtIST, fmtEST } from "@/lib/format/time";
import { cn } from "@/lib/shared/utils";
import { profileLabel as resolveProfileLabel } from "@/lib/shared/profile-name";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  timeLogsInfinite,
  tasksForLogQuery,
  timelogProfilesQuery,
} from "@/lib/queries/ops.queries";
import { VirtualRows } from "@/components/shared/virtual-rows";
import { GridErrorState, GridSkeletonRows } from "@/components/shared/grid-states";
import { AuditHistoryPopover } from "@/components/ops/time-logs/audit-history-popover";

export const Route = createFileRoute("/ops/time-logs")({
  beforeLoad: () => {
    throw redirect({ to: "/ops/reports", search: { tab: "time-logs" } });
  },
  component: () => (
    <AuthGuard allow={["admin", "employee"]}>
      <AppShell crumbs={[{ label: "Time Logs" }]} fullBleed>
        <TimeLogsPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

const manualEntrySchema = z.object({
  task_id: z.string().uuid({ message: "Pick a task" }),
  hours: z.coerce
    .number()
    .positive({ message: "Hours must be greater than 0" })
    .max(24, { message: "Max 24 hours per entry" }),
  note: z
    .string()
    .trim()
    .min(3, { message: "Description is required (min 3 chars)" })
    .max(500, { message: "Description too long" }),
});

const effMins = (l: {
  duration_minutes: number | null;
  effective_minutes: number | null;
  effective_override: number | null;
  break_minutes?: number | null;
}) =>
  l.effective_override ??
  l.effective_minutes ??
  Math.max(0, (l.duration_minutes ?? 0) - (l.break_minutes ?? 0));

type LogRow = {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  note: string | null;
  user_id: string;
  billable: boolean;
  break_minutes: number;
  effective_minutes: number | null;
  effective_override: number | null;
  timer_group_size: number;
  tasks: {
    title: string;
    entity_id: string;
    client_entities: {
      project_id: string;
      projects: {
        id: string;
        name: string;
        code: string | null;
        firm_id: string;
        firms: { id: string; name: string; firm_identifier: string | null } | null;
      } | null;
    } | null;
  } | null;
};

type TaskOpt = {
  id: string;
  title: string;
  client_entities: {
    project_id: string;
    projects: {
      id: string;
      name: string;
      code: string | null;
      firm_id: string;
      firms: { id: string; name: string; firm_identifier: string | null } | null;
    } | null;
  } | null;
};

type RowDraft = { break_minutes: string; effective: string; note: string };

// ───────── Column registry ─────────
type ColKey =
  | "date"
  | "user"
  | "firm"
  | "project"
  | "task"
  | "start"
  | "end"
  | "tracked"
  | "effective"
  | "note"
  | "effpct"
  | "history";

type ColDef = {
  key: ColKey;
  label: string;
  defaultWidth: number;
  minWidth: number;
  sortable: boolean;
  filter?: "text" | "range";
  align?: "left" | "right" | "center";
  alwaysVisible?: boolean;
};

const COLS: ColDef[] = [
  {
    key: "date",
    label: "Date",
    defaultWidth: 130,
    minWidth: 90,
    sortable: true,
    alwaysVisible: true,
  },
  { key: "user", label: "User", defaultWidth: 110, minWidth: 80, sortable: true, filter: "text" },
  { key: "firm", label: "Firm", defaultWidth: 70, minWidth: 60, sortable: true, filter: "text" },
  {
    key: "project",
    label: "Project",
    defaultWidth: 70,
    minWidth: 60,
    sortable: true,
    filter: "text",
  },
  { key: "task", label: "Task", defaultWidth: 220, minWidth: 120, sortable: true, filter: "text" },
  { key: "start", label: "Start", defaultWidth: 70, minWidth: 60, sortable: true, align: "right" },
  { key: "end", label: "End", defaultWidth: 70, minWidth: 60, sortable: true, align: "right" },
  {
    key: "tracked",
    label: "Tracked",
    defaultWidth: 80,
    minWidth: 60,
    sortable: true,
    filter: "range",
    align: "right",
  },
  {
    key: "effective",
    label: "Effective",
    defaultWidth: 90,
    minWidth: 70,
    sortable: true,
    filter: "range",
    align: "right",
    alwaysVisible: true,
  },
  { key: "note", label: "Note", defaultWidth: 200, minWidth: 100, sortable: false, filter: "text" },
  {
    key: "effpct",
    label: "Eff%",
    defaultWidth: 70,
    minWidth: 60,
    sortable: true,
    filter: "range",
    align: "right",
    alwaysVisible: true,
  },
  {
    key: "history",
    label: "",
    defaultWidth: 36,
    minWidth: 36,
    sortable: false,
    alwaysVisible: true,
  },
];

const STORAGE_KEY = "ops:time-logs:grid:v2";

type GridState = {
  visible: Record<ColKey, boolean>;
  widths: Record<ColKey, number>;
  sort: { key: ColKey; dir: "asc" | "desc" } | null;
  filters: Partial<Record<ColKey, { text?: string; min?: string; max?: string }>>;
  groupBy: "none" | "user" | "firm" | "project" | "task" | "day" | "week";
  collapsed: Record<string, boolean>;
};

const defaultGridState = (): GridState => ({
  visible: Object.fromEntries(COLS.map((c) => [c.key, true])) as Record<ColKey, boolean>,
  widths: Object.fromEntries(COLS.map((c) => [c.key, c.defaultWidth])) as Record<ColKey, number>,
  sort: { key: "date", dir: "desc" },
  filters: {},
  groupBy: "none",
  collapsed: {},
});

function loadGridState(): GridState {
  if (typeof window === "undefined") return defaultGridState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultGridState();
    const parsed = JSON.parse(raw) as Partial<GridState>;
    const base = defaultGridState();
    return {
      visible: { ...base.visible, ...(parsed.visible ?? {}) },
      widths: { ...base.widths, ...(parsed.widths ?? {}) },
      sort: parsed.sort ?? base.sort,
      filters: parsed.filters ?? {},
      groupBy: (parsed.groupBy ?? "none") as GridState["groupBy"],
      collapsed: parsed.collapsed ?? {},
    };
  } catch {
    return defaultGridState();
  }
}

export function TimeLogsPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();

  // Top-level filters
  const [view, setView] = useState<"all" | "mine">("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [firmFilter, setFirmFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [range, setRange] = useState<{ from?: string; to?: string }>({});
  const from = range.from ?? "";
  const to = range.to ?? "";
  const [search, setSearch] = useState("");

  // Selection (optional)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const editing = Object.keys(drafts).length > 0;

  // Grid state (persisted)
  const [grid, setGrid] = useState<GridState>(() => defaultGridState());
  useEffect(() => {
    setGrid(loadGridState());
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(grid));
    } catch {
      /* noop */
    }
  }, [grid]);

  // Dialogs
  const [open, setOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"off" | "filtered" | "selected">("off");

  const toggleOne = (id: string) =>
    setSelected((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const clearSelection = () => {
    setSelected(new Set());
    setDrafts({});
  };

  // Push high-selectivity scope to the server. View=mine and date-range are
  // server-side; firm/project/user facets stay client-side over loaded pages.
  const serverFilters = useMemo(
    () => ({
      userId: role === "employee" || view === "mine" ? (user?.id ?? null) : null,
      fromIso: from || null,
      toIso: to || null,
    }),
    [role, view, user?.id, from, to],
  );

  const {
    data: pages,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery(timeLogsInfinite(serverFilters));

  const logs = useMemo<LogRow[]>(
    () => (pages?.pages ?? []).flatMap((p) => p.rows as unknown as LogRow[]),
    [pages],
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const { data: tasksList } = useQuery({
    ...tasksForLogQuery(),
    select: (d) => d as unknown as TaskOpt[],
  });
  const { data: profiles } = useQuery(timelogProfilesQuery());

  const create = useMutation({
    mutationFn: async (input: { task_id: string; minutes: number; note: string }) => {
      const ended = new Date();
      const started = new Date(ended.getTime() - input.minutes * 60_000);
      const { error } = await supabase.from("time_logs").insert({
        task_id: input.task_id,
        user_id: user!.id,
        started_at: started.toISOString(),
        ended_at: ended.toISOString(),
        duration_minutes: input.minutes,
        note: input.note,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Time log added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["time-logs-infinite"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const userName = (uid: string) => resolveProfileLabel(profiles, uid, uid.slice(0, 6));

  // ───────── Apply top-level filters ─────────
  const baseFiltered = useMemo(() => {
    return (logs ?? []).filter((l) => {
      if (view === "mine" && l.user_id !== user?.id) return false;
      if (projectFilter !== "all" && l.tasks?.client_entities?.projects?.id !== projectFilter)
        return false;
      if (firmFilter !== "all" && l.tasks?.client_entities?.projects?.firm_id !== firmFilter)
        return false;
      if (userFilter !== "all" && l.user_id !== userFilter) return false;
      if (from && new Date(l.started_at) < new Date(from)) return false;
      if (to) {
        const toEnd = new Date(to);
        toEnd.setHours(23, 59, 59, 999);
        if (new Date(l.started_at) > toEnd) return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const p = l.tasks?.client_entities?.projects;
        const hay =
          `${l.tasks?.title ?? ""} ${l.note ?? ""} ${p?.name ?? ""} ${p?.code ?? ""} ${p?.firms?.name ?? ""} ${p?.firms?.firm_identifier ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [logs, view, user?.id, projectFilter, firmFilter, userFilter, from, to, search]);

  // ───────── Per-column filters + sort ─────────
  const cellValue = (l: LogRow, key: ColKey): string | number => {
    const p = l.tasks?.client_entities?.projects;
    const f = p?.firms;
    const tracked = l.duration_minutes ?? 0;
    const eff = effMins(l);
    switch (key) {
      case "date":
        return new Date(l.started_at).getTime();
      case "user":
        return userName(l.user_id);
      case "firm":
        return f?.firm_identifier ?? f?.name ?? "";
      case "project":
        return p?.code ?? p?.name ?? "";
      case "task":
        return l.tasks?.title ?? "";
      case "start":
        return new Date(l.started_at).getTime();
      case "end":
        return l.ended_at ? new Date(l.ended_at).getTime() : 0;
      case "tracked":
        return tracked;
      case "effective":
        return eff;
      case "note":
        return l.note ?? "";
      case "effpct":
        return tracked > 0 ? Math.round((eff / tracked) * 100) : 0;
      default:
        return "";
    }
  };

  const filtered = useMemo(() => {
    let rows = baseFiltered.slice();
    for (const c of COLS) {
      const fdef = grid.filters[c.key];
      if (!fdef) continue;
      if (c.filter === "text" && fdef.text?.trim()) {
        const needle = fdef.text.toLowerCase();
        rows = rows.filter((r) => String(cellValue(r, c.key)).toLowerCase().includes(needle));
      } else if (c.filter === "range") {
        const min = fdef.min !== undefined && fdef.min !== "" ? Number(fdef.min) : null;
        const max = fdef.max !== undefined && fdef.max !== "" ? Number(fdef.max) : null;
        const conv = (v: number) => (c.key === "tracked" || c.key === "effective" ? v / 60 : v);
        rows = rows.filter((r) => {
          const v = conv(Number(cellValue(r, c.key)));
          if (min !== null && v < min) return false;
          if (max !== null && v > max) return false;
          return true;
        });
      }
    }
    if (grid.sort) {
      const { key, dir } = grid.sort;
      rows.sort((a, b) => {
        const av = cellValue(a, key);
        const bv = cellValue(b, key);
        if (av < bv) return dir === "asc" ? -1 : 1;
        if (av > bv) return dir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFiltered, grid.filters, grid.sort, profiles]);

  // ───────── Grouping ─────────
  const groupKey = (l: LogRow): { key: string; label: string } => {
    const p = l.tasks?.client_entities?.projects;
    const f = p?.firms;
    switch (grid.groupBy) {
      case "user":
        return { key: l.user_id, label: userName(l.user_id) };
      case "firm":
        return { key: f?.id ?? "—", label: f?.name ?? "—" };
      case "project":
        return { key: p?.id ?? "—", label: p?.name ?? "—" };
      case "task":
        return { key: l.task_id, label: l.tasks?.title ?? "—" };
      case "day":
        return {
          key: new Date(l.started_at).toISOString().slice(0, 10),
          label: new Date(l.started_at).toLocaleDateString(),
        };
      case "week": {
        const d = new Date(l.started_at);
        const onejan = new Date(d.getFullYear(), 0, 1);
        const week = Math.ceil(((+d - +onejan) / 86400000 + onejan.getDay() + 1) / 7);
        const k = `${d.getFullYear()}-W${week}`;
        return { key: k, label: k };
      }
      default:
        return { key: "all", label: "" };
    }
  };

  const groups = useMemo(() => {
    if (grid.groupBy === "none") return null;
    const m = new Map<string, { label: string; rows: LogRow[] }>();
    for (const r of filtered) {
      const g = groupKey(r);
      if (!m.has(g.key)) m.set(g.key, { label: g.label, rows: [] });
      m.get(g.key)!.rows.push(r);
    }
    return Array.from(m, ([key, v]) => ({ key, label: v.label, rows: v.rows }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, grid.groupBy]);

  // Stats
  const totalMin = filtered.reduce((s, l) => s + (l.duration_minutes ?? 0), 0);
  const effectiveMin = filtered.reduce((s, l) => s + effMins(l), 0);
  const uniqueUsers = new Set(filtered.map((l) => l.user_id)).size;
  const uniqueTasks = new Set(filtered.map((l) => l.task_id)).size;

  // Filter options for top bar
  const projectOptions = useMemo(() => {
    const m = new Map<string, { name: string; code: string | null }>();
    for (const l of logs ?? []) {
      const p = l.tasks?.client_entities?.projects;
      if (p?.id) m.set(p.id, { name: p.name, code: p.code });
    }
    return Array.from(m, ([id, v]) => ({ id, ...v }));
  }, [logs]);
  const firmOptions = useMemo(() => {
    const m = new Map<string, { name: string; code: string | null }>();
    for (const l of logs ?? []) {
      const f = l.tasks?.client_entities?.projects?.firms;
      if (f?.id) m.set(f.id, { name: f.name, code: f.firm_identifier });
    }
    return Array.from(m, ([id, v]) => ({ id, ...v }));
  }, [logs]);
  const userOptions = useMemo(() => {
    const ids = new Set((logs ?? []).map((l) => l.user_id));
    return (profiles ?? []).filter((p) => ids.has(p.id));
  }, [logs, profiles]);

  // Export
  const headers = [
    "Date IST",
    "Date EST",
    "User",
    "Firm",
    "Project",
    "Task",
    "Tracked",
    "Effective",
    "Note",
  ];
  const rows = () =>
    filtered.map((l) => [
      fmtIST(l.started_at),
      fmtEST(l.started_at),
      userName(l.user_id),
      l.tasks?.client_entities?.projects?.firms?.name ?? "—",
      l.tasks?.client_entities?.projects?.name ?? "—",
      l.tasks?.title ?? "—",
      l.duration_minutes != null ? (l.duration_minutes / 60).toFixed(2) : "running",
      (effMins(l) / 60).toFixed(2),
      l.note ?? "",
    ]);
  const exportCsv = () => {
    const csv = [headers, ...rows()]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `time-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(16);
    doc.text("Time Logs", 40, 40);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(
      `${(totalMin / 60).toFixed(1)}h tracked · ${(effectiveMin / 60).toFixed(1)}h effective · ${filtered.length} entries`,
      40,
      58,
    );
    autoTable(doc, {
      startY: 72,
      head: [headers],
      body: rows().map((r) => r.map(String)),
      styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [37, 99, 235] },
    });
    doc.save(`time-logs-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const clearAll = () => {
    setProjectFilter("all");
    setFirmFilter("all");
    setUserFilter("all");
    setRange({});
    setSearch("");
  };
  const hasFilters =
    projectFilter !== "all" ||
    firmFilter !== "all" ||
    userFilter !== "all" ||
    !!from ||
    !!to ||
    !!search;

  // ───────── Inline edit (single-row via right-click or table-wide bulk) ─────────
  const beginInlineEdit = (id: string) => {
    const l = filtered.find((r) => r.id === id);
    if (!l) return;
    setDrafts({
      [id]: {
        break_minutes: String(l.break_minutes ?? 0),
        effective: String(effMins(l)),
        note: l.note ?? "",
      },
    });
    setSelected(new Set([id]));
    setBulkMode("off");
  };

  const enterBulkInline = (scope: "filtered" | "selected") => {
    const targets = scope === "selected" ? filtered.filter((l) => selected.has(l.id)) : filtered;
    if (targets.length === 0) {
      toast.error("No rows in scope");
      return;
    }
    const next: Record<string, RowDraft> = {};
    for (const l of targets) {
      next[l.id] = {
        break_minutes: String(l.break_minutes ?? 0),
        effective: String(effMins(l)),
        note: l.note ?? "",
      };
    }
    setDrafts(next);
    setBulkMode(scope);
  };

  const exitInlineEdit = () => {
    setDrafts({});
    setBulkMode("off");
  };
  const cancelInlineEdit = exitInlineEdit;

  const saveInlineEdit = async () => {
    const isDirty = (l: LogRow, d: RowDraft) => {
      const eff = Math.max(0, Math.round(Number(d.effective) || 0));
      const brk = Math.max(0, Math.round(Number(d.break_minutes) || 0));
      return (
        eff !== effMins(l) || brk !== (l.break_minutes ?? 0) || (d.note ?? "") !== (l.note ?? "")
      );
    };
    const rowsToSave = filtered.filter((l) => drafts[l.id] && isDirty(l, drafts[l.id]));
    if (rowsToSave.length === 0) {
      exitInlineEdit();
      return;
    }

    const offenders: string[] = [];
    for (const l of rowsToSave) {
      const d = drafts[l.id];
      const brk = Math.max(0, Math.round(Number(d.break_minutes) || 0));
      const eff = Math.max(0, Math.round(Number(d.effective) || 0));
      const tracked = l.duration_minutes ?? 0;
      if (brk + eff > tracked) offenders.push(l.id.slice(0, 6));
    }
    if (offenders.length > 0) {
      toast.error(`Break + Effective exceeds Tracked for ${offenders.length} row(s)`);
      return;
    }
    try {
      const bulkOpId = crypto.randomUUID();
      for (const l of rowsToSave) {
        const d = drafts[l.id];
        const { error } = await supabase.rpc(
          "bulk_update_time_logs" as never,
          {
            p_bulk_op_id: bulkOpId,
            p_ids: [l.id],
            p_set_effective: true,
            p_effective_override: Math.max(0, Math.round(Number(d.effective) || 0)),
            p_set_break: true,
            p_break_minutes: Math.max(0, Math.round(Number(d.break_minutes) || 0)),
            p_note_mode: "replace",
            p_note_value: d.note,
          } as never,
        );
        if (error) throw error;
      }
      const count = rowsToSave.length;
      exitInlineEdit();
      clearSelection();
      qc.invalidateQueries({ queryKey: ["time-logs-infinite"] });
      qc.invalidateQueries({ queryKey: ["time-log-audit"] });
      toast.success(`Saved ${count} row(s)`, {
        duration: 20000,
        action: { label: "Undo", onClick: () => handleUndo(bulkOpId) },
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // ───────── Undo handler ─────────
  const handleUndo = async (bulkOpId: string) => {
    try {
      const { error } = await supabase.rpc(
        "undo_bulk_op" as never,
        { p_bulk_op_id: bulkOpId } as never,
      );
      if (error) throw error;
      toast.success("Bulk edit undone");
      qc.invalidateQueries({ queryKey: ["time-logs-infinite"] });
      qc.invalidateQueries({ queryKey: ["time-log-audit"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Dirty count for bulk-inline status bar
  const dirtyCount = useMemo(() => {
    return filtered.reduce((n, l) => {
      const d = drafts[l.id];
      if (!d) return n;
      const eff = Math.max(0, Math.round(Number(d.effective) || 0));
      const brk = Math.max(0, Math.round(Number(d.break_minutes) || 0));
      const changed =
        eff !== effMins(l) || brk !== (l.break_minutes ?? 0) || (d.note ?? "") !== (l.note ?? "");
      return changed ? n + 1 : n;
    }, 0);
  }, [filtered, drafts]);

  // Esc/Save shortcuts
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelInlineEdit();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveInlineEdit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, drafts, filtered]);

  // ───────── Group templates ─────────
  const visibleCols = COLS.filter((c) => grid.visible[c.key]);
  const gridTemplate = `32px ${visibleCols.map((c) => `${grid.widths[c.key]}px`).join(" ")}`;

  const allVisibleSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));

  // ───────── Render row ─────────
  const renderRow = (l: LogRow) => {
    const tracked = l.duration_minutes ?? 0;
    const eff = effMins(l);
    const effPct = tracked > 0 ? Math.min(100, Math.round((eff / tracked) * 100)) : 0;
    const p = l.tasks?.client_entities?.projects;
    const f = p?.firms;
    const isSel = selected.has(l.id);
    const draft = drafts[l.id];
    const inEdit = !!draft;

    const cell = (key: ColKey) => {
      switch (key) {
        case "date":
          return (
            <span className="font-mono tabular-nums truncate" title={fmtIST(l.started_at)}>
              {fmtIST(l.started_at)}
            </span>
          );
        case "user":
          return (
            <span className="truncate" title={userName(l.user_id)}>
              {role !== "employee" ? userName(l.user_id) : "—"}
            </span>
          );
        case "firm":
          return <FirmCode code={f?.firm_identifier} name={f?.name} />;
        case "project":
          return <ProjectCode code={p?.code} name={p?.name} />;
        case "task":
          return (
            <span className="truncate" title={l.tasks?.title ?? ""}>
              {l.tasks?.title ?? "—"}
            </span>
          );
        case "start":
          return (
            <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
              {new Date(l.started_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          );
        case "end":
          return (
            <span className="font-mono tabular-nums text-[11px] text-muted-foreground">
              {l.ended_at
                ? new Date(l.ended_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </span>
          );
        case "tracked":
          return (
            <span className="font-mono tabular-nums">
              {l.duration_minutes != null ? `${(tracked / 60).toFixed(2)}h` : "—"}
            </span>
          );
        case "effective":
          return inEdit ? (
            <Input
              type="number"
              min={0}
              value={draft.effective}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [l.id]: { ...d[l.id], effective: e.target.value } }))
              }
              className="h-6 w-16 text-[11px] font-mono px-1 text-right"
            />
          ) : (
            <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-300 font-medium">
              {(eff / 60).toFixed(2)}h
            </span>
          );
        case "note":
          return inEdit ? (
            <Input
              value={draft.note}
              onChange={(e) =>
                setDrafts((d) => ({ ...d, [l.id]: { ...d[l.id], note: e.target.value } }))
              }
              className="h-6 text-[11px] px-1"
              placeholder="Note"
            />
          ) : (
            <span className="truncate" title={l.note ?? ""}>
              {l.note ?? "—"}
            </span>
          );
        case "effpct":
          return (
            <Badge
              variant="outline"
              className={cn(
                "h-5 px-1 text-[10px] tabular-nums",
                effPct >= 85 &&
                  "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30",
                effPct >= 60 &&
                  effPct < 85 &&
                  "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30",
                effPct < 60 &&
                  "border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/30",
              )}
            >
              {effPct}%
            </Badge>
          );
        case "history":
          return <AuditHistoryPopover timeLogId={l.id} userName={userName} />;
      }
    };

    return (
      <ContextMenu key={l.id}>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "grid border-b hover:bg-muted/30 transition-colors text-xs h-9 items-stretch",
              isSel && "bg-accent/40 border-l-2 border-l-primary",
              inEdit && "bg-amber-50/60 dark:bg-amber-950/20",
              bulkMode !== "off" && !inEdit && "opacity-40",
            )}
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="px-2 border-r flex items-center justify-center">
              <Checkbox
                checked={isSel}
                onCheckedChange={() => toggleOne(l.id)}
                aria-label="Select row"
              />
            </div>
            {visibleCols.map((c) => (
              <div
                key={c.key}
                className={cn(
                  "px-2 border-r flex items-center min-w-0",
                  c.align === "right" && "justify-end",
                  c.align === "center" && "justify-center",
                )}
              >
                {cell(c.key)}
              </div>
            ))}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem onClick={() => beginInlineEdit(l.id)}>
            <Pencil className="h-3.5 w-3.5 mr-2" /> Edit inline
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => {
              const text = `${p?.name ?? ""} › ${l.tasks?.title ?? ""}`.trim();
              navigator.clipboard.writeText(text).then(
                () => toast.success("Copied"),
                () => toast.error("Copy failed"),
              );
            }}
          >
            <Copy className="h-3.5 w-3.5 mr-2" /> Copy task ref
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  // ───────── Group header ─────────
  const renderGroupHeader = (g: { key: string; label: string; rows: LogRow[] }) => {
    const collapsed = !!grid.collapsed[g.key];
    const gTracked = g.rows.reduce((s, l) => s + (l.duration_minutes ?? 0), 0);
    const gEff = g.rows.reduce((s, l) => s + effMins(l), 0);
    const gPct = gTracked > 0 ? Math.round((gEff / gTracked) * 100) : 0;
    return (
      <button
        type="button"
        onClick={() =>
          setGrid((g0) => ({ ...g0, collapsed: { ...g0.collapsed, [g.key]: !collapsed } }))
        }
        className="w-full grid items-center bg-muted/40 hover:bg-muted/60 border-b border-t text-[11px] font-medium h-7 px-2 gap-2 sticky"
        style={{ gridTemplateColumns: "24px minmax(180px,1fr) auto auto auto" }}
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
        <span className="truncate text-left">{g.label || "—"}</span>
        <span className="text-muted-foreground tabular-nums">{g.rows.length} rows</span>
        <span className="tabular-nums">{(gTracked / 60).toFixed(1)}h tracked</span>
        <span className="tabular-nums text-emerald-700 dark:text-emerald-300">
          {(gEff / 60).toFixed(1)}h eff · {gPct}%
        </span>
      </button>
    );
  };

  // ───────── Layout ─────────
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col h-full min-h-0 overflow-hidden">
        {/* Header strip */}
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2 border-b bg-background">
          <h1 className="text-base font-semibold tracking-tight leading-tight">Time Logs</h1>
          <MiniStat
            icon={<Clock className="h-3 w-3" />}
            label="Total"
            value={`${(totalMin / 60).toFixed(1)}h`}
          />
          <MiniStat
            icon={<Clock className="h-3 w-3 text-emerald-600" />}
            label="Effective"
            value={`${(effectiveMin / 60).toFixed(1)}h`}
          />
          <MiniStat
            icon={<Users className="h-3 w-3 text-sky-600" />}
            label="People"
            value={String(uniqueUsers)}
          />
          <MiniStat
            icon={<Layers className="h-3 w-3 text-sky-600" />}
            label="Tasks"
            value={String(uniqueTasks)}
          />
          <div className="ml-auto flex items-center gap-1.5">
            {bulkMode === "off" && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={() => enterBulkInline("filtered")}
                disabled={filtered.length === 0}
                title="Bulk edit (all filtered rows)"
                aria-label="Bulk edit"
              >
                <Wand2 className="h-3.5 w-3.5 mr-1" /> Bulk edit
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={exportPdf}
              disabled={filtered.length === 0}
              title="Export PDF"
              aria-label="Export PDF"
            >
              <FileText className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              title="Export CSV"
              aria-label="Export CSV"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-7 px-2 gap-1">
                  <Plus className="h-3.5 w-3.5" /> Manual entry
                </Button>
              </DialogTrigger>
              <ManualEntryDialog
                tasks={tasksList ?? []}
                onSubmit={(v) => create.mutate(v)}
                pending={create.isPending}
              />
            </Dialog>
          </div>
        </div>

        {/* Filter strip */}
        <div className="shrink-0 flex flex-wrap items-center gap-1.5 px-4 py-1.5 border-b bg-muted/30">
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList className="h-7">
              <TabsTrigger value="all" className="h-6 px-2 text-xs">
                All
              </TabsTrigger>
              <TabsTrigger value="mine" className="h-6 px-2 text-xs">
                Mine
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-7 pl-7 w-full sm:w-56 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search task, note, firm, project…"
            />
          </div>
          {role !== "employee" && (
            <FacetedSingleChip
              icon={<UserIcon className="h-3 w-3" />}
              label="User"
              value={userFilter}
              emptyValue="all"
              onChange={setUserFilter}
              options={[
                { value: "all", label: "Anyone" },
                ...userOptions.map((p) => ({ value: p.id, label: p.full_name || p.email || p.id })),
              ]}
            />
          )}
          <FacetedSingleChip
            icon={<Building2 className="h-3 w-3" />}
            label="Firm"
            value={firmFilter}
            emptyValue="all"
            onChange={setFirmFilter}
            options={[
              { value: "all", label: "All firms" },
              ...firmOptions.map((f) => ({
                value: f.id,
                label: formatPickerLabel(f.code, f.name),
              })),
            ]}
          />
          <FacetedSingleChip
            icon={<FolderKanban className="h-3 w-3" />}
            label="Project"
            value={projectFilter}
            emptyValue="all"
            onChange={setProjectFilter}
            options={[
              { value: "all", label: "All projects" },
              ...projectOptions.map((p) => ({
                value: p.id,
                label: formatPickerLabel(p.code, p.name),
              })),
            ]}
          />
          <DateRangePicker
            value={range}
            onChange={setRange}
            className="w-[230px] h-7"
            placeholder="Date range"
          />

          <FacetedSingleChip
            icon={<Layers className="h-3 w-3" />}
            label="Group by"
            value={grid.groupBy}
            emptyValue="none"
            onChange={(v) => setGrid((g) => ({ ...g, groupBy: v as GridState["groupBy"] }))}
            options={[
              { value: "none", label: "None" },
              { value: "user", label: "User" },
              { value: "firm", label: "Firm" },
              { value: "project", label: "Project" },
              { value: "task", label: "Task" },
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
            ]}
          />

          <ColumnVisibilityPopover grid={grid} setGrid={setGrid} />

          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={clearAll}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {filtered.length} of {logs.length}
            {hasNextPage ? "+" : ""} loaded
          </span>
        </div>

        {/* Grid */}
        <div className="flex-1 min-h-0 overflow-hidden bg-background border-t border-border-subtle">
          {isError ? (
            <GridErrorState error={error} onRetry={() => void refetch()} />
          ) : isLoading ? (
            <GridSkeletonRows rows={12} />
          ) : filtered.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Clock className="h-10 w-10" />}
                title="No time logged in this view"
                description="Adjust filters or use the timer on a task."
              />
            </div>
          ) : groups ? (
            <div className="h-full overflow-auto">
              <div
                className="grid sticky top-0 z-10 bg-muted/60 backdrop-blur border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div className="px-2 py-1.5 border-r flex items-center justify-center">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={(v) => {
                      if (v) setSelected(new Set(filtered.map((l) => l.id)));
                      else clearSelection();
                    }}
                    aria-label="Select all"
                  />
                </div>
                {visibleCols.map((c) => (
                  <ColumnHeader key={c.key} col={c} grid={grid} setGrid={setGrid} />
                ))}
              </div>
              {groups.map((g) => (
                <div key={g.key}>
                  {renderGroupHeader(g)}
                  {!grid.collapsed[g.key] && g.rows.map(renderRow)}
                </div>
              ))}
              {hasNextPage && (
                <div className="px-3 py-2 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleEndReached}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <VirtualRows
              rows={filtered}
              estimateRowHeight={36}
              rowKey={(l) => l.id}
              onEndReached={handleEndReached}
              topSlot={
                <div
                  className="grid sticky top-0 z-10 bg-muted/60 backdrop-blur border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <div className="px-2 py-1.5 border-r flex items-center justify-center">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={(v) => {
                        if (v) setSelected(new Set(filtered.map((l) => l.id)));
                        else clearSelection();
                      }}
                      aria-label="Select all"
                    />
                  </div>
                  {visibleCols.map((c) => (
                    <ColumnHeader key={c.key} col={c} grid={grid} setGrid={setGrid} />
                  ))}
                </div>
              }
              bottomSlot={
                isFetchingNextPage ? (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground text-center">
                    Loading more…
                  </div>
                ) : !hasNextPage && filtered.length > 0 ? (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground text-center">
                    End of log
                  </div>
                ) : null
              }
              renderRow={(l) => renderRow(l)}
            />
          )}
        </div>

        {/* Selection / edit bar */}
        {(selected.size > 0 || editing) && (
          <div className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-1.5 border-t bg-primary/5">
            {editing ? (
              <>
                <span className="text-xs font-medium">
                  Inline edit · {Object.keys(drafts).length} row(s)
                  {bulkMode !== "off" &&
                    ` · ${bulkMode === "selected" ? "selected scope" : "all filtered"}`}{" "}
                  · {dirtyCount} changed
                </span>
                <Button
                  size="sm"
                  className="h-7"
                  onClick={saveInlineEdit}
                  disabled={dirtyCount === 0}
                >
                  <Save className="h-3.5 w-3.5 mr-1" /> Save all
                  {dirtyCount > 0 ? ` (${dirtyCount})` : ""}
                </Button>
                <Button size="sm" variant="outline" className="h-7" onClick={cancelInlineEdit}>
                  <Ban className="h-3.5 w-3.5 mr-1" /> Cancel
                </Button>
                <span className="text-[11px] text-muted-foreground ml-2">
                  Esc cancel · ⌘/Ctrl+S save
                </span>
              </>
            ) : (
              <>
                <span className="text-xs font-medium">{selected.size} selected</span>
                <Button size="sm" className="h-7" onClick={() => enterBulkInline("selected")}>
                  <Wand2 className="h-3.5 w-3.5 mr-1" /> Bulk edit selected
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 ml-auto"
              onClick={() => {
                clearSelection();
                exitInlineEdit();
              }}
            >
              Clear
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// ───────── Mini stat chip ─────────
function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] bg-card">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

// ───────── Column header with sort, filter, resize ─────────
function ColumnHeader({
  col,
  grid,
  setGrid,
}: {
  col: ColDef;
  grid: GridState;
  setGrid: React.Dispatch<React.SetStateAction<GridState>>;
}) {
  const sortDir = grid.sort?.key === col.key ? grid.sort.dir : null;
  const fval = grid.filters[col.key] ?? {};
  const filterActive = !!(
    fval.text?.trim() ||
    (fval.min !== undefined && fval.min !== "") ||
    (fval.max !== undefined && fval.max !== "")
  );

  const cycleSort = () => {
    if (!col.sortable) return;
    setGrid((g) => {
      if (g.sort?.key !== col.key) return { ...g, sort: { key: col.key, dir: "asc" } };
      if (g.sort.dir === "asc") return { ...g, sort: { key: col.key, dir: "desc" } };
      return { ...g, sort: null };
    });
  };

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = grid.widths[col.key];
    const move = (ev: MouseEvent) => {
      const w = Math.max(col.minWidth, startW + (ev.clientX - startX));
      setGrid((g) => ({ ...g, widths: { ...g.widths, [col.key]: w } }));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const onResizeReset = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setGrid((g) => ({ ...g, widths: { ...g.widths, [col.key]: col.defaultWidth } }));
  };

  return (
    <div
      className={cn(
        "relative px-2 py-1.5 border-r flex items-center gap-1 select-none group min-w-0",
        col.align === "right" && "justify-end",
        col.align === "center" && "justify-center",
      )}
    >
      <button
        type="button"
        onClick={cycleSort}
        disabled={!col.sortable}
        className={cn(
          "truncate flex items-center gap-1 hover:text-foreground",
          col.sortable && "cursor-pointer",
        )}
      >
        <span className="truncate">{col.label}</span>
        {sortDir === "asc" && <ArrowUp className="h-3 w-3" />}
        {sortDir === "desc" && <ArrowDown className="h-3 w-3" />}
      </button>

      {col.filter && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "h-4 w-4 inline-flex items-center justify-center rounded hover:bg-muted opacity-0 group-hover:opacity-100",
                filterActive && "opacity-100 text-primary",
              )}
              aria-label="Filter column"
            >
              <FilterIcon className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2 space-y-2">
            <div className="text-[11px] font-medium normal-case">Filter {col.label}</div>
            {col.filter === "text" ? (
              <Input
                value={fval.text ?? ""}
                onChange={(e) =>
                  setGrid((g) => ({
                    ...g,
                    filters: {
                      ...g.filters,
                      [col.key]: { ...g.filters[col.key], text: e.target.value },
                    },
                  }))
                }
                placeholder="Contains…"
                className="h-7 text-xs"
              />
            ) : (
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  placeholder="min"
                  value={fval.min ?? ""}
                  onChange={(e) =>
                    setGrid((g) => ({
                      ...g,
                      filters: {
                        ...g.filters,
                        [col.key]: { ...g.filters[col.key], min: e.target.value },
                      },
                    }))
                  }
                  className="h-7 text-xs"
                />
                <Input
                  type="number"
                  placeholder="max"
                  value={fval.max ?? ""}
                  onChange={(e) =>
                    setGrid((g) => ({
                      ...g,
                      filters: {
                        ...g.filters,
                        [col.key]: { ...g.filters[col.key], max: e.target.value },
                      },
                    }))
                  }
                  className="h-7 text-xs"
                />
              </div>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-full text-xs"
              onClick={() =>
                setGrid((g) => {
                  const fn = { ...g.filters };
                  delete fn[col.key];
                  return { ...g, filters: fn };
                })
              }
            >
              Clear
            </Button>
          </PopoverContent>
        </Popover>
      )}

      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        onDoubleClick={onResizeReset}
        title="Drag to resize · Double-click to reset"
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40"
      >
        <GripVertical className="h-3 w-3 opacity-0" />
      </div>
    </div>
  );
}

// ───────── Column visibility popover ─────────
function ColumnVisibilityPopover({
  grid,
  setGrid,
}: {
  grid: GridState;
  setGrid: React.Dispatch<React.SetStateAction<GridState>>;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          title="Columns"
          aria-label="Columns"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        <div className="text-[11px] font-medium mb-1">Columns</div>
        <ul className="space-y-1">
          {COLS.filter((c) => c.label).map((c) => (
            <li key={c.key} className="flex items-center gap-2">
              <Checkbox
                id={`col-${c.key}`}
                checked={grid.visible[c.key]}
                disabled={c.alwaysVisible}
                onCheckedChange={(v) =>
                  setGrid((g) => ({ ...g, visible: { ...g.visible, [c.key]: !!v } }))
                }
              />
              <Label htmlFor={`col-${c.key}`} className="text-xs font-normal cursor-pointer">
                {c.label}
              </Label>
            </li>
          ))}
        </ul>
        <div className="border-t mt-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-full text-xs"
            onClick={() =>
              setGrid((g) => ({
                ...g,
                widths: Object.fromEntries(COLS.map((c) => [c.key, c.defaultWidth])) as Record<
                  ColKey,
                  number
                >,
              }))
            }
          >
            Reset widths
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ───────── Manual entry dialog with cascading pickers ─────────

function ManualEntryDialog({
  tasks,
  onSubmit,
  pending,
}: {
  tasks: TaskOpt[];
  onSubmit: (v: { task_id: string; minutes: number; note: string }) => void;
  pending: boolean;
}) {
  const [firmId, setFirmId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [hours, setHours] = useState("0.5");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const firms = useMemo(() => {
    const m = new Map<string, { name: string; code: string | null }>();
    for (const t of tasks) {
      const f = t.client_entities?.projects?.firms;
      if (f?.id) m.set(f.id, { name: f.name, code: f.firm_identifier });
    }
    return Array.from(m, ([id, v]) => ({ id, ...v }));
  }, [tasks]);

  const projects = useMemo(() => {
    const m = new Map<string, { name: string; code: string | null; firmId: string }>();
    for (const t of tasks) {
      const p = t.client_entities?.projects;
      if (!p) continue;
      if (firmId && p.firm_id !== firmId) continue;
      m.set(p.id, { name: p.name, code: p.code, firmId: p.firm_id });
    }
    return Array.from(m, ([id, v]) => ({ id, ...v }));
  }, [tasks, firmId]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const p = t.client_entities?.projects;
      if (firmId && p?.firm_id !== firmId) return false;
      if (projectId && p?.id !== projectId) return false;
      return true;
    });
  }, [tasks, firmId, projectId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = manualEntrySchema.safeParse({ task_id: taskId, hours, note });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues)
        fieldErrors[String(issue.path[0] ?? "_")] = issue.message;
      setErrors(fieldErrors);
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setErrors({});
    onSubmit({
      task_id: parsed.data.task_id,
      minutes: Math.round(parsed.data.hours * 60),
      note: parsed.data.note,
    });
  };

  return (
    <DialogContent className="glass border-border-subtle">
      <DialogHeader>
        <DialogTitle>Manual time entry</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Firm</Label>
          <Select
            value={firmId}
            onValueChange={(v) => {
              setFirmId(v);
              setProjectId("");
              setTaskId("");
            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Any firm" />
            </SelectTrigger>
            <SelectContent>
              {firms.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {formatPickerLabel(f.code, f.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Project</Label>
          <Select
            value={projectId}
            onValueChange={(v) => {
              setProjectId(v);
              setTaskId("");
            }}
            disabled={projects.length === 0}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Any project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {formatPickerLabel(p.code, p.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Task *</Label>
          <Select value={taskId} onValueChange={setTaskId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder={`Select task (${filteredTasks.length})`} />
            </SelectTrigger>
            <SelectContent>
              {filteredTasks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.task_id && <p className="text-xs text-destructive">{errors.task_id}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Hours *</Label>
          <Input
            type="number"
            step="0.25"
            min="0.25"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            required
            className="h-9"
          />
          {errors.hours && <p className="text-xs text-destructive">{errors.hours}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="note" className="text-xs">
            Description *
          </Label>
          <Textarea
            id="note"
            rows={3}
            placeholder="What did you work on?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            required
          />
          {errors.note && <p className="text-xs text-destructive">{errors.note}</p>}
          <p className="text-[10px] text-muted-foreground text-right">{note.length}/500</p>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Add entry"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
