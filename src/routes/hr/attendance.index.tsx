import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Download,
  LogIn,
  LogOut,
  User as UserIcon,
} from "lucide-react";
import { downloadCSV, toCSV } from "@/lib/format/csv";
import { SortableTh, type SortState } from "@/components/shared/sortable-th";
import { PaginationFooter } from "@/components/shared/pagination-footer";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { CalendarDays } from "lucide-react";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { StatCard } from "@/components/shared/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/shared/utils";

export const Route = createFileRoute("/hr/attendance/")({
  component: () => (
    <AuthGuard allow={["admin", "super_admin", "hr_manager", "employee"]}>
      <AppShell
        crumbs={[
          { label: "Human Resources", to: "/hr/employees" },
          { label: "Attendance & Leaves" },
        ]}
      >
        <AttendancePage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type LeaveType = "vacation" | "sick" | "personal" | "unpaid" | "bereavement" | "other";
type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "remote" | "holiday";

const LEAVE_TYPES: { value: LeaveType; label: string }[] = [
  { value: "vacation", label: "Vacation" },
  { value: "sick", label: "Sick" },
  { value: "personal", label: "Personal" },
  { value: "unpaid", label: "Unpaid" },
  { value: "bereavement", label: "Bereavement" },
  { value: "other", label: "Other" },
];

const ATTENDANCE_STATUSES: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "Present" },
  { value: "remote", label: "Remote" },
  { value: "late", label: "Late" },
  { value: "half_day", label: "Half day" },
  { value: "absent", label: "Absent" },
  { value: "holiday", label: "Holiday" },
];

type LeaveRow = {
  id: string;
  employee_id: string;
  type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  reviewer_id: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
};

type AttendanceRow = {
  id: string;
  employee_id: string;
  entry_date: string;
  check_in: string | null;
  check_out: string | null;
  status: AttendanceStatus;
  notes: string | null;
};

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

function statusBadgeVariant(s: LeaveStatus): "default" | "secondary" | "outline" | "destructive" {
  if (s === "approved") return "default";
  if (s === "rejected") return "destructive";
  if (s === "cancelled") return "outline";
  return "secondary";
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function diffDays(start: string, end: string) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 1;
  return Math.round((b - a) / 86400000) + 1;
}

function AttendancePage() {
  const { user, role } = useAuth();
  const isManager = !!role && ["admin", "super_admin", "hr_manager"].includes(role);

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3">
      {/* Slim header */}
      <div className="flex items-center justify-between gap-3 border-b pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
          <h1 className="text-sm font-semibold shrink-0">Attendance &amp; Leaves</h1>
          <span className="hidden truncate text-xs text-muted-foreground md:inline">
            Track daily attendance and manage time-off requests
          </span>
        </div>
        {isManager && (
          <div className="flex shrink-0 gap-2">
            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <Link to="/hr/attendance/import">Import CSV</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-7 text-xs">
              <Link to="/hr/tardiness">Tardiness Tracker</Link>
            </Button>
          </div>
        )}
      </div>
      <Tabs defaultValue="leaves" className="flex flex-1 min-h-0 flex-col gap-2">
        <TabsList className="self-start">
          <TabsTrigger value="leaves">Leave requests</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="employee-inout">Employee In/Out</TabsTrigger>
        </TabsList>
        <TabsContent value="leaves" className="flex-1 min-h-0 flex flex-col gap-3 mt-0">
          <LeavesSection userId={user?.id ?? ""} isManager={isManager} />
        </TabsContent>
        <TabsContent value="attendance" className="flex-1 min-h-0 flex flex-col gap-3 mt-0">
          <AttendanceSection userId={user?.id ?? ""} isManager={isManager} />
        </TabsContent>
        <TabsContent value="employee-inout" className="flex-1 min-h-0 flex flex-col gap-3 mt-0">
          <EmployeeInOutSection currentUserId={user?.id ?? ""} isManager={isManager} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function useProfilesMap(ids: string[]) {
  return useQuery({
    queryKey: ["hr", "profiles-by-ids", ids.sort().join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .in("id", ids);
      if (error) throw error;
      const m = new Map<string, ProfileLite>();
      (data ?? []).forEach((p) => m.set(p.id, p as ProfileLite));
      return m;
    },
  });
}

/* ============== LEAVES ============== */

function LeavesSection({ userId, isManager }: { userId: string; isManager: boolean }) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<"all" | "mine">(isManager ? "all" : "mine");
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | "all">("all");

  const leavesQ = useQuery({
    queryKey: ["hr", "leaves", scope, statusFilter, userId],
    queryFn: async () => {
      let q = supabase.from("leave_requests").select("*").order("start_date", { ascending: false });
      if (scope === "mine" && userId) q = q.eq("employee_id", userId);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as LeaveRow[];
    },
  });

  const ids = useMemo(() => {
    const set = new Set<string>();
    (leavesQ.data ?? []).forEach((r) => {
      set.add(r.employee_id);
      if (r.reviewer_id) set.add(r.reviewer_id);
    });
    return Array.from(set);
  }, [leavesQ.data]);
  const profilesQ = useProfilesMap(ids);

  const counts = useMemo(() => {
    const list = leavesQ.data ?? [];
    return {
      pending: list.filter((l) => l.status === "pending").length,
      approved: list.filter((l) => l.status === "approved").length,
      rejected: list.filter((l) => l.status === "rejected").length,
      total: list.length,
    };
  }, [leavesQ.data]);

  const reviewMut = useMutation({
    mutationFn: async (input: { id: string; status: LeaveStatus; notes?: string | null }) => {
      const { error } = await supabase
        .from("leave_requests")
        .update({
          status: input.status,
          review_notes: input.notes ?? null,
          reviewer_id: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr", "leaves"] });
      toast.success("Updated leave request");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("leave_requests")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr", "leaves"] });
      toast.success("Cancelled");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("leave_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr", "leaves"] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Pending" value={counts.pending} />
        <StatCard label="Approved" value={counts.approved} />
        <StatCard label="Rejected" value={counts.rejected} />
        <StatCard label="Total" value={counts.total} />
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          {isManager && (
            <Select value={scope} onValueChange={(v) => setScope(v as "all" | "mine")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                <SelectItem value="mine">Mine only</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as LeaveStatus | "all")}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <NewLeaveDialog userId={userId} />
          </div>
        </CardContent>
      </Card>

      {leavesQ.isLoading ? (
        <Skeleton className="h-64" />
      ) : (leavesQ.data ?? []).length === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="h-8 w-8" />}
          title="No leave requests"
          description="Submit a request using the button above."
        />
      ) : (
        <Card className="flex flex-col flex-1 min-h-0">
          <CardContent className="p-0 flex-1 min-h-0 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(leavesQ.data ?? []).map((row) => {
                  const emp = profilesQ.data?.get(row.employee_id);
                  const isOwn = row.employee_id === userId;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {emp && <UserAvatar profile={emp} size="sm" />}
                          <span className="text-sm">{emp?.full_name ?? emp?.email ?? "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{row.type}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.start_date} → {row.end_date}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.days}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(row.status)} className="capitalize">
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {row.reason ?? "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          {isManager && row.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => reviewMut.mutate({ id: row.id, status: "approved" })}
                                title="Approve"
                              >
                                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => reviewMut.mutate({ id: row.id, status: "rejected" })}
                                title="Reject"
                              >
                                <XCircle className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                          {isOwn && row.status === "pending" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancelMut.mutate(row.id)}
                            >
                              Cancel
                            </Button>
                          )}
                          {(isManager || (isOwn && row.status === "pending")) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm("Delete this leave request?")) deleteMut.mutate(row.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

function NewLeaveDialog({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LeaveType>("vacation");
  const [start, setStart] = useState(todayISO());
  const [end, setEnd] = useState(todayISO());
  const [reason, setReason] = useState("");

  const days = useMemo(() => diffDays(start, end), [start, end]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase.from("leave_requests").insert({
        employee_id: userId,
        type,
        start_date: start,
        end_date: end,
        days,
        reason: reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr", "leaves"] });
      toast.success("Leave request submitted");
      setOpen(false);
      setReason("");
      setType("vacation");
      setStart(todayISO());
      setEnd(todayISO());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New leave
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request time off</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Dates</Label>
            <DateRangePicker
              value={{ from: start, to: end }}
              onChange={(r) => {
                if (r.from) setStart(r.from);
                if (r.to) setEnd(r.to);
              }}
              placeholder="Start → end"
            />
          </div>
          <div className="text-xs text-muted-foreground">Total: {days} day(s)</div>
          <div className="grid gap-1.5">
            <Label>Reason (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============== ATTENDANCE ============== */

function AttendanceSection({ userId, isManager }: { userId: string; isManager: boolean }) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<"all" | "mine">(isManager ? "all" : "mine");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayISO());
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [searchEmployeeIds, setSearchEmployeeIds] = useState<string[] | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<SortState<"entry_date" | "status">>({
    key: "entry_date",
    dir: "desc",
  });
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [scope, from, to, statusFilter, searchEmployeeIds, pageSize, sort.key, sort.dir]);

  // Resolve employee search (name/email) → ids server-side, then filter rows by those ids.
  useEffect(() => {
    const term = search.trim();
    if (!term) {
      setSearchEmployeeIds(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(500);
      if (!cancelled) setSearchEmployeeIds((data ?? []).map((r: { id: string }) => r.id));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [search]);

  const buildQuery = (forCount: boolean) => {
    let q = supabase
      .from("attendance_entries")
      .select("*", forCount ? { count: "exact" } : undefined)
      .gte("entry_date", from)
      .lte("entry_date", to)
      .order(sort.key, { ascending: sort.dir === "asc" });
    if (scope === "mine" && userId) q = q.eq("employee_id", userId);
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (searchEmployeeIds !== null) {
      if (searchEmployeeIds.length === 0)
        q = q.eq("employee_id", "00000000-0000-0000-0000-000000000000");
      else q = q.in("employee_id", searchEmployeeIds);
    }
    return q;
  };

  const attendanceQ = useQuery({
    queryKey: [
      "hr",
      "attendance",
      scope,
      from,
      to,
      userId,
      page,
      pageSize,
      sort.key,
      sort.dir,
      statusFilter,
      searchEmployeeIds?.join(",") ?? "",
    ],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const fromIdx = (page - 1) * pageSize;
      const toIdx = fromIdx + pageSize - 1;
      const { data, error, count } = await buildQuery(true).range(fromIdx, toIdx);
      if (error) throw error;
      return { rows: (data ?? []) as AttendanceRow[], total: count ?? 0 };
    },
  });

  const rows = attendanceQ.data?.rows ?? [];
  const total = attendanceQ.data?.total ?? 0;

  const ids = useMemo(() => Array.from(new Set(rows.map((r) => r.employee_id))), [rows]);
  const profilesQ = useProfilesMap(ids);

  // Independent lookup for today's entry (so check-in works regardless of pagination)
  const todayQ = useQuery({
    queryKey: ["hr", "attendance", "today", userId],
    enabled: !!userId,
    queryFn: async () => {
      const t = todayISO();
      const { data, error } = await supabase
        .from("attendance_entries")
        .select("*")
        .eq("employee_id", userId)
        .eq("entry_date", t)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AttendanceRow | null;
    },
  });
  const todayEntry = todayQ.data ?? undefined;

  const checkInMut = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not signed in");
      const now = new Date().toISOString();
      if (todayEntry) {
        const { error } = await supabase
          .from("attendance_entries")
          .update({ check_in: todayEntry.check_in ?? now })
          .eq("id", todayEntry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("attendance_entries").insert({
          employee_id: userId,
          entry_date: todayISO(),
          check_in: now,
          status: "present",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr", "attendance"] });
      toast.success("Checked in");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkOutMut = useMutation({
    mutationFn: async () => {
      if (!todayEntry) throw new Error("Check in first");
      const { error } = await supabase
        .from("attendance_entries")
        .update({ check_out: new Date().toISOString() })
        .eq("id", todayEntry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr", "attendance"] });
      toast.success("Checked out");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attendance_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr", "attendance"] });
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              {todayEntry?.check_in
                ? `Checked in at ${new Date(todayEntry.check_in).toLocaleTimeString()}`
                : "Not checked in today"}
            </span>
          </div>
          <Button size="sm" onClick={() => checkInMut.mutate()} disabled={checkInMut.isPending}>
            Check in
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkOutMut.mutate()}
            disabled={checkOutMut.isPending || !todayEntry}
          >
            Check out
          </Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {isManager && (
              <Select value={scope} onValueChange={(v) => setScope(v as "all" | "mine")}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All employees</SelectItem>
                  <SelectItem value="mine">Mine only</SelectItem>
                </SelectContent>
              </Select>
            )}
            {isManager && (
              <Input
                placeholder="Search employee…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-44"
              />
            )}
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as AttendanceStatus | "all")}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {ATTENDANCE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DateRangePicker
              value={{ from, to }}
              onChange={(r) => {
                if (r.from) setFrom(r.from);
                if (r.to) setTo(r.to);
              }}
              className="h-9 w-[260px]"
              placeholder="Date range"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              title="Export CSV"
              aria-label="Export CSV"
              disabled={total === 0 || exportBusy}
              onClick={async () => {
                setExportBusy(true);
                try {
                  const cap = Math.min(total, 5000);
                  const { data } = await buildQuery(false).range(0, Math.max(0, cap - 1));
                  const list = (data ?? []) as AttendanceRow[];
                  const empIds = Array.from(new Set(list.map((r) => r.employee_id)));
                  const { data: profs } = empIds.length
                    ? await supabase.from("profiles").select("id,full_name,email").in("id", empIds)
                    : {
                        data: [] as {
                          id: string;
                          full_name: string | null;
                          email: string | null;
                        }[],
                      };
                  const pmap = new Map<
                    string,
                    { full_name: string | null; email: string | null }
                  >();
                  (profs ?? []).forEach((p) => pmap.set(p.id, p));
                  const rows = list.map((r) => {
                    const p = pmap.get(r.employee_id);
                    return {
                      date: r.entry_date,
                      employee: p?.full_name ?? p?.email ?? r.employee_id,
                      email: p?.email ?? "",
                      status: r.status,
                      check_in: r.check_in ? new Date(r.check_in).toISOString() : "",
                      check_out: r.check_out ? new Date(r.check_out).toISOString() : "",
                      notes: r.notes ?? "",
                    };
                  });
                  downloadCSV(`attendance-${from}_to_${to}.csv`, toCSV(rows));
                } finally {
                  setExportBusy(false);
                }
              }}
            >
              {exportBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="sr-only">Export CSV</span>
            </Button>
            {isManager && <ManualEntryDialog />}
          </div>
        </CardContent>
      </Card>

      {attendanceQ.isLoading ? (
        <Skeleton className="h-64" />
      ) : total === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="h-8 w-8" />}
          title="No attendance records"
          description="Use check in to record attendance."
        />
      ) : (
        <Card className="flex flex-col flex-1 min-h-0">
          <CardContent className="p-0 flex flex-1 min-h-0 flex-col">
            <div className="relative flex-1 min-h-0 overflow-auto">
              {attendanceQ.isFetching && (
                <div className="absolute right-3 top-2 z-10">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <SortableTh<"entry_date" | "status">
                      field="entry_date"
                      label="Date"
                      sort={sort}
                      onSortChange={setSort}
                      className="text-left"
                    />
                    <th className="px-3 py-2 text-xs uppercase text-muted-foreground text-left">
                      Employee
                    </th>
                    <SortableTh<"entry_date" | "status">
                      field="status"
                      label="Status"
                      sort={sort}
                      onSortChange={setSort}
                      className="text-left"
                    />
                    <th className="px-3 py-2 text-xs uppercase text-muted-foreground text-left">
                      Check in
                    </th>
                    <th className="px-3 py-2 text-xs uppercase text-muted-foreground text-left">
                      Check out
                    </th>
                    <th className="px-3 py-2 text-xs uppercase text-muted-foreground text-left">
                      Notes
                    </th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const emp = profilesQ.data?.get(row.employee_id);
                    return (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2 text-sm">{row.entry_date}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {emp && <UserAvatar profile={emp} size="sm" />}
                            <span className="text-sm">{emp?.full_name ?? emp?.email ?? "—"}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="secondary" className="capitalize">
                            {row.status.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">
                          {row.check_in ? new Date(row.check_in).toLocaleTimeString() : "—"}
                        </td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">
                          {row.check_out ? new Date(row.check_out).toLocaleTimeString() : "—"}
                        </td>
                        <td className="px-3 py-2 text-sm text-muted-foreground max-w-xs truncate">
                          {row.notes ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {isManager && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm("Delete this entry?")) deleteMut.mutate(row.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <PaginationFooter
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              isLoading={attendanceQ.isLoading}
            />
          </CardContent>
        </Card>
      )}
    </>
  );
}

function ManualEntryDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [date, setDate] = useState(todayISO());
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [notes, setNotes] = useState("");

  const peopleQ = useQuery({
    queryKey: ["hr", "attendance", "people"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProfileLite[];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error("Pick an employee");
      const { error } = await supabase
        .from("attendance_entries")
        .upsert(
          { employee_id: employeeId, entry_date: date, status, notes: notes.trim() || null },
          { onConflict: "employee_id,entry_date" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr", "attendance"] });
      toast.success("Saved");
      setOpen(false);
      setNotes("");
      setEmployeeId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-1" />
          Manual
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add attendance entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick employee" />
              </SelectTrigger>
              <SelectContent>
                {(peopleQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name ?? p.email ?? "—"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as AttendanceStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ATTENDANCE_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============== EMPLOYEE IN/OUT ============== */

const ATTENDANCE_STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  remote: "bg-sky-50 text-sky-700 border border-sky-200",
  late: "bg-amber-50 text-amber-700 border border-amber-200",
  half_day: "bg-orange-50 text-orange-700 border border-orange-200",
  absent: "bg-rose-50 text-rose-700 border border-rose-200",
  holiday: "bg-violet-50 text-violet-700 border border-violet-200",
};

function fmtTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function calcDuration(checkIn: string | null, checkOut: string | null): string | null {
  if (!checkIn || !checkOut) return null;
  const ms = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function EmployeeInOutSection({
  currentUserId,
  isManager,
}: {
  currentUserId: string;
  isManager: boolean;
}) {
  const [employeeId, setEmployeeId] = useState(isManager ? "" : currentUserId);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayISO);

  const employeesQ = useQuery({
    queryKey: ["hr", "attendance", "all-employees"],
    enabled: isManager,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProfileLite[];
    },
  });

  const entriesQ = useQuery({
    queryKey: ["hr", "attendance", "employee-inout", employeeId, from, to],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_entries")
        .select("*")
        .eq("employee_id", employeeId)
        .gte("entry_date", from)
        .lte("entry_date", to)
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttendanceRow[];
    },
  });

  const entries = entriesQ.data ?? [];

  const stats = useMemo(() => {
    const present = entries.filter((e) =>
      ["present", "remote", "late"].includes(e.status),
    ).length;
    const withBoth = entries.filter((e) => e.check_in && e.check_out);
    const totalMs = withBoth.reduce((acc, e) => {
      if (!e.check_in || !e.check_out) return acc;
      return acc + (new Date(e.check_out).getTime() - new Date(e.check_in).getTime());
    }, 0);
    const avgHours = withBoth.length > 0 ? totalMs / withBoth.length / 3600000 : 0;
    return { present, avgHours, total: entries.length, withBoth: withBoth.length };
  }, [entries]);

  const selectedName = isManager
    ? ((employeesQ.data ?? []).find((e) => e.id === employeeId)?.full_name ?? "")
    : "";

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          {isManager && (
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Employee</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {(employeesQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ?? p.email ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Date range</Label>
            <DateRangePicker
              value={{ from, to }}
              onChange={(r) => {
                if (r.from) setFrom(r.from);
                if (r.to) setTo(r.to);
              }}
              className="h-9 w-[240px]"
              placeholder="Date range"
            />
          </div>
          {selectedName && (
            <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
              <UserIcon className="h-4 w-4" />
              <span className="font-medium text-foreground">{selectedName}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {!employeeId ? (
        <EmptyState
          icon={<UserIcon className="h-8 w-8" />}
          title="Select an employee"
          description="Choose an employee above to view their daily In/Out times."
        />
      ) : entriesQ.isLoading ? (
        <Skeleton className="h-64" />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="h-8 w-8" />}
          title="No records found"
          description="No attendance entries for this employee in the selected range."
        />
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Present days" value={stats.present} />
            <StatCard label="Total entries" value={stats.total} />
            <StatCard label="Days with In/Out" value={stats.withBoth} />
            <StatCard label="Avg hours/day" value={`${stats.avgHours.toFixed(1)}h`} />
          </div>

          {/* In/Out table */}
          <Card className="flex flex-col flex-1 min-h-0">
            <CardContent className="p-0 flex-1 min-h-0 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>
                      <span className="flex items-center gap-1.5">
                        <LogIn className="h-3.5 w-3.5 text-emerald-600" />
                        Check In
                      </span>
                    </TableHead>
                    <TableHead>
                      <span className="flex items-center gap-1.5">
                        <LogOut className="h-3.5 w-3.5 text-rose-500" />
                        Check Out
                      </span>
                    </TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((row) => {
                    const inTime = fmtTime(row.check_in);
                    const outTime = fmtTime(row.check_out);
                    const duration = calcDuration(row.check_in, row.check_out);
                    const statusCls =
                      ATTENDANCE_STATUS_STYLE[row.status] ??
                      "bg-slate-50 text-slate-700 border border-slate-200";
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium tabular-nums text-sm">
                          {row.entry_date}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize",
                              statusCls,
                            )}
                          >
                            {row.status.replace("_", " ")}
                          </span>
                        </TableCell>
                        <TableCell>
                          {inTime ? (
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                              <span className="h-2 w-2 rounded-full bg-emerald-500" />
                              {inTime}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {outTime ? (
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-600">
                              <span className="h-2 w-2 rounded-full bg-rose-500" />
                              {outTime}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {duration ?? "—"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                          {row.notes ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
