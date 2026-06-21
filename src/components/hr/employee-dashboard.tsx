import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Search,
  Mail,
  Phone,
  Building2,
  Calendar,
  IdCard,
  Briefcase,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Upload,
  Plus,
} from "lucide-react";
import { PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { StatCard } from "@/components/shared/stat-card";
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
import { cn } from "@/lib/shared/utils";
import { fuzzyMatchMany } from "@/lib/hr/fuzzy-search";

type EmployeeRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  position: string | null;
  position_title: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: string | null;
  department: string | null;
  employee_id: string | null;
  employment_type: string | null;
  join_date: string | null;
  firm_id: string | null;
};

type FirmRow = { id: string; name: string };

type LeaveRow = {
  id: string;
  employee_id: string;
  type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string | null;
  status: string;
  created_at: string;
};

type AttendanceRow = {
  id: string;
  employee_id: string;
  entry_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  notes: string | null;
};

const DEPT_LABELS: Record<string, string> = {
  ops: "Operations",
  finance: "Finance",
  hr: "Human Resources",
  exec: "Executive",
};

function prettyPosition(p: string | null) {
  if (!p) return "—";
  return p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusTone(s: string | null): "ok" | "warn" | "err" | undefined {
  if (!s) return undefined;
  if (s === "approved" || s === "active" || s === "present" || s === "remote") return "ok";
  if (s === "pending" || s === "late" || s === "half_day") return "warn";
  if (s === "rejected" || s === "absent" || s === "inactive") return "err";
  return undefined;
}

function leaveBadgeVariant(s: string): "default" | "secondary" | "outline" | "destructive" {
  if (s === "approved") return "default";
  if (s === "rejected") return "destructive";
  if (s === "cancelled") return "outline";
  return "secondary";
}

export function EmployeeDashboard() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const employeesQ = useQuery({
    queryKey: ["hr", "dashboard", "employees"],
    queryFn: async () => {
      const { data: roleRows, error: roleErr } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "client" as never);
      if (roleErr) throw roleErr;
      const clientIds = new Set(
        ((roleRows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
      );

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, first_name, last_name, email, position, position_title, phone, avatar_url, status, department, employee_id, employment_type, join_date, firm_id" as never,
        )
        .neq("provisioned_via" as never, "direct_client_hub" as never)
        .order("full_name", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as EmployeeRow[];
      return rows.filter((r) => !clientIds.has(r.id));
    },
  });

  const firmsQ = useQuery({
    queryKey: ["hr", "dashboard", "firms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firms")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FirmRow[];
    },
  });

  const firmMap = useMemo(() => {
    const m = new Map<string, string>();
    (firmsQ.data ?? []).forEach((f) => m.set(f.id, f.name));
    return m;
  }, [firmsQ.data]);

  const filtered = useMemo(() => {
    const list = employeesQ.data ?? [];
    const q = search.trim();
    if (!q) return list;
    const scored = list.map((e) => {
      const m = fuzzyMatchMany(q, [
        { key: "name", text: e.full_name, weight: 2 },
        { key: "email", text: e.email, weight: 1.5 },
        { key: "employee_id", text: e.employee_id, weight: 2 },
        { key: "title", text: e.position_title, weight: 1 },
      ]);
      return { e, score: m.score };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.e);
  }, [employeesQ.data, search]);

  const selected = useMemo(() => {
    if (!selectedId) return filtered[0] ?? null;
    return (employeesQ.data ?? []).find((e) => e.id === selectedId) ?? null;
  }, [selectedId, filtered, employeesQ.data]);

  const counts = useMemo(() => {
    const list = employeesQ.data ?? [];
    return {
      total: list.length,
      active: list.filter((e) => (e.status ?? "active") === "active").length,
      inactive: list.filter((e) => e.status === "inactive").length,
    };
  }, [employeesQ.data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="HR Dashboard"
        description="Browse employees on the left and view their details on the right."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/hr/employees/import">
                <Upload className="h-4 w-4" /> Bulk import
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/hr/employees">
                <Plus className="h-4 w-4" /> Manage employees
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Active" value={counts.active} tone="ok" />
        <StatCard
          label="Inactive"
          value={counts.inactive}
          tone={counts.inactive > 0 ? "err" : undefined}
        />
        <StatCard label="Showing" value={filtered.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* ── Left: Employee list ──────────────────────────────────── */}
        <Card className="overflow-hidden">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employees…"
                className="pl-9 h-9"
              />
            </div>
          </div>
          {employeesQ.isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Users className="h-8 w-8" />}
                title="No matches"
                description="Try a different search term."
              />
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <ul className="divide-y">
                {filtered.map((e) => {
                  const isActive = (selected?.id ?? filtered[0]?.id) === e.id;
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(e.id)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 text-left transition-colors hover:bg-accent",
                          isActive && "bg-accent",
                        )}
                      >
                        <UserAvatar
                          profile={{
                            id: e.id,
                            full_name: e.full_name,
                            email: e.email,
                            avatar_url: e.avatar_url,
                          }}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {e.full_name ?? "Unnamed"}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {e.position_title || prettyPosition(e.position)}
                          </div>
                        </div>
                        {(e.status ?? "active") !== "active" && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {e.status}
                          </Badge>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}
        </Card>

        {/* ── Right: Tabbed details ────────────────────────────────── */}
        <Card className="min-h-[600px]">
          {!selected ? (
            <div className="flex items-center justify-center h-[600px]">
              <EmptyState
                icon={<Users className="h-8 w-8" />}
                title="Select an employee"
                description="Pick someone from the list to see their details."
              />
            </div>
          ) : (
            <EmployeeDetailTabs
              employee={selected}
              firmName={selected.firm_id ? (firmMap.get(selected.firm_id) ?? null) : null}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Detail tabs ───────────────────────────────────────────────────────

function EmployeeDetailTabs({
  employee,
  firmName,
}: {
  employee: EmployeeRow;
  firmName: string | null;
}) {
  return (
    <CardContent className="p-0">
      {/* Header */}
      <div className="p-5 border-b flex items-start gap-4">
        <UserAvatar
          profile={{
            id: employee.id,
            full_name: employee.full_name,
            email: employee.email,
            avatar_url: employee.avatar_url,
          }}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold truncate">{employee.full_name ?? "Unnamed"}</h2>
          <p className="text-sm text-muted-foreground truncate">
            {employee.position_title || prettyPosition(employee.position)}
            {employee.employee_id ? ` · ${employee.employee_id}` : ""}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge
              variant={(employee.status ?? "active") === "active" ? "secondary" : "outline"}
              className="text-xs capitalize"
            >
              {employee.status ?? "active"}
            </Badge>
            {employee.department && (
              <Badge variant="secondary" className="text-xs">
                {DEPT_LABELS[employee.department] ?? employee.department}
              </Badge>
            )}
            {employee.employment_type && (
              <Badge variant="outline" className="text-xs capitalize">
                {employee.employment_type.replace("_", " ")}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {employee.email && (
            <Button asChild variant="outline" size="sm">
              <a href={`mailto:${employee.email}`}>
                <Mail className="h-3.5 w-3.5" /> Email
              </a>
            </Button>
          )}
          {employee.phone && (
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${employee.phone}`}>
                <Phone className="h-3.5 w-3.5" /> Call
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile" className="p-5">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="leaves">Leaves</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="pt-4">
          <ProfileTab employee={employee} firmName={firmName} />
        </TabsContent>

        <TabsContent value="attendance" className="pt-4">
          <AttendanceTab employeeId={employee.id} />
        </TabsContent>

        <TabsContent value="leaves" className="pt-4">
          <LeavesTab employeeId={employee.id} />
        </TabsContent>
      </Tabs>
    </CardContent>
  );
}

// ── Profile tab ──────────────────────────────────────────────────────

function ProfileField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md border bg-card/50">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-medium truncate mt-0.5">{value || "—"}</div>
      </div>
    </div>
  );
}

function ProfileTab({ employee, firmName }: { employee: EmployeeRow; firmName: string | null }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <ProfileField icon={<Mail className="h-4 w-4" />} label="Email" value={employee.email} />
      <ProfileField icon={<Phone className="h-4 w-4" />} label="Phone" value={employee.phone} />
      <ProfileField
        icon={<IdCard className="h-4 w-4" />}
        label="Employee ID"
        value={employee.employee_id}
      />
      <ProfileField
        icon={<Briefcase className="h-4 w-4" />}
        label="Position"
        value={employee.position_title || prettyPosition(employee.position)}
      />
      <ProfileField
        icon={<Users className="h-4 w-4" />}
        label="Department"
        value={
          employee.department ? (DEPT_LABELS[employee.department] ?? employee.department) : null
        }
      />
      <ProfileField
        icon={<Briefcase className="h-4 w-4" />}
        label="Employment type"
        value={employee.employment_type ? employee.employment_type.replace("_", " ") : null}
      />
      <ProfileField
        icon={<Calendar className="h-4 w-4" />}
        label="Join date"
        value={formatDate(employee.join_date)}
      />
      <ProfileField
        icon={<Building2 className="h-4 w-4" />}
        label="Assigned firm"
        value={firmName}
      />
    </div>
  );
}

// ── Attendance tab ───────────────────────────────────────────────────

function AttendanceTab({ employeeId }: { employeeId: string }) {
  const attendanceQ = useQuery({
    queryKey: ["hr", "dashboard", "attendance", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_entries")
        .select("id, employee_id, entry_date, check_in, check_out, status, notes")
        .eq("employee_id", employeeId)
        .order("entry_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as AttendanceRow[];
    },
  });

  if (attendanceQ.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }

  const rows = attendanceQ.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Clock className="h-8 w-8" />}
        title="No attendance records"
        description="This employee has no attendance entries yet."
      />
    );
  }

  const counts = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard label="Present" value={counts.present ?? 0} tone="ok" />
        <StatCard label="Remote" value={counts.remote ?? 0} />
        <StatCard label="Late" value={counts.late ?? 0} tone={counts.late ? "warn" : undefined} />
        <StatCard
          label="Absent"
          value={counts.absent ?? 0}
          tone={counts.absent ? "err" : undefined}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Check in</TableHead>
            <TableHead>Check out</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs tabular-nums">{formatDate(r.entry_date)}</TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs capitalize",
                    statusTone(r.status) === "ok" && "border-emerald-500/40 text-emerald-600",
                    statusTone(r.status) === "warn" && "border-amber-500/40 text-amber-600",
                    statusTone(r.status) === "err" && "border-destructive/40 text-destructive",
                  )}
                >
                  {r.status.replace("_", " ")}
                </Badge>
              </TableCell>
              <TableCell className="text-xs tabular-nums">{r.check_in ?? "—"}</TableCell>
              <TableCell className="text-xs tabular-nums">{r.check_out ?? "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                {r.notes ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Leaves tab ───────────────────────────────────────────────────────

function LeavesTab({ employeeId }: { employeeId: string }) {
  const leavesQ = useQuery({
    queryKey: ["hr", "dashboard", "leaves", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("id, employee_id, type, start_date, end_date, days, reason, status, created_at")
        .eq("employee_id", employeeId)
        .order("start_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as unknown as LeaveRow[];
    },
  });

  if (leavesQ.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }

  const rows = leavesQ.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Calendar className="h-8 w-8" />}
        title="No leave requests"
        description="This employee has no leave history yet."
      />
    );
  }

  const counts = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatCard
          label="Approved"
          value={counts.approved ?? 0}
          tone="ok"
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Pending"
          value={counts.pending ?? 0}
          tone={counts.pending ? "warn" : undefined}
        />
        <StatCard
          label="Rejected"
          value={counts.rejected ?? 0}
          tone={counts.rejected ? "err" : undefined}
          icon={<XCircle className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="Total days"
          value={rows.filter((r) => r.status === "approved").reduce((s, r) => s + (r.days ?? 0), 0)}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Start</TableHead>
            <TableHead>End</TableHead>
            <TableHead className="text-right">Days</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-xs capitalize">{r.type}</TableCell>
              <TableCell className="text-xs tabular-nums">{formatDate(r.start_date)}</TableCell>
              <TableCell className="text-xs tabular-nums">{formatDate(r.end_date)}</TableCell>
              <TableCell className="text-xs text-right tabular-nums">{r.days}</TableCell>
              <TableCell>
                <Badge variant={leaveBadgeVariant(r.status)} className="text-xs capitalize">
                  {r.status}
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                {r.reason ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
