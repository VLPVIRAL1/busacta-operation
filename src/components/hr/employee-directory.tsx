import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/auth-context";
import {
  Search,
  Mail,
  Phone,
  Calendar,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Upload,
  Plus,
  Settings,
  Loader2,
  Check,
  TrendingUp,
  Download,
  Lock,
  UserCircle,
  Briefcase,
  Building2,
  BadgeCheck,
  KeyRound,
  Copy,
  CheckCheck,
  X,
  Link2,
  AlertTriangle,
  Landmark,
  Pencil,
  Trash2,
  Star,
  FileText,
  Eye,
  BarChart3,
  CalendarDays,
  Timer,
  Sparkles,
  GraduationCap,
  Award,
  BookOpen,
  ExternalLink,
  RotateCcw,
  RefreshCw,
} from "lucide-react";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import { PayrollEmployeeSetup } from "@/components/hr/payroll-employee-setup";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { AvatarUploader } from "@/components/shared/avatar-uploader";
import { EmployeeCreateSheet } from "@/components/hr/employee-create-sheet";
import { EmployeeRowActions } from "@/components/hr/employee-row-actions";
import { resendEmployeeInvite, generateTempPassword } from "@/lib/hr/invites.functions";
import { HighlightedText } from "@/components/hr/highlighted-text";
import { supabase } from "@/integrations/supabase/client";
import {
  updateEmployee,
  updateEmployeeEmail,
  setFirmAssignments,
  setClientAssignments,
  deactivateEmployee,
  reactivateEmployee,
  upsertEmployeeBankAccount,
  deleteEmployeeBankAccount,
  upsertEmployeeSpecialty,
  deleteEmployeeSpecialty,
} from "@/lib/hr/employees.functions";
import { cn } from "@/lib/shared/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { DateRangePicker, type SimpleRange } from "@/components/shared/date-range-picker";
import { AvatarCropDialog } from "@/components/shared/avatar-crop-dialog";
import {
  resolveAndSaveNotebookServerFn,
  clearOneNoteNotebookServerFn,
  testOneNoteAccessServerFn,
  syncAllNotesForEmployeeServerFn,
  type OneNoteTestResult,
  type OneNoteBulkSyncResult,
} from "@/lib/onenote/functions";
import { fuzzyMatchMany } from "@/lib/hr/fuzzy-search";
import { PermissionMatrixEditor } from "@/components/hr/permission-matrix-editor";
import type { PermissionMap } from "@/lib/hr/employees.server";

// ── Types ─────────────────────────────────────────────────────────────

type EmployeeRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  position: string | null;
  position_title: string | null;
  specialty: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: string | null;
  department: string | null;
  employee_id: string | null;
  employment_type: string | null;
  join_date: string | null;
  firm_id: string | null;
  status_effective_date: string | null;
  separation_type: string | null;
  birth_date: string | null;
  aadhar_number: string | null;
  pan_number: string | null;
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

// ── Constants ─────────────────────────────────────────────────────────

const DEPT_LABELS: Record<string, string> = {
  ops: "Operations",
  finance: "Finance",
  hr: "Human Resources",
  exec: "Executive",
};

const DEPARTMENTS = [
  { value: "ops", label: "Operations" },
  { value: "finance", label: "Finance" },
  { value: "hr", label: "Human Resources" },
  { value: "exec", label: "Executive" },
];

const POSITIONS = [
  "partner",
  "manager",
  "senior",
  "staff",
  "reviewer",
  "preparer",
  "client_contact",
  "other",
];

const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "hr_manager", label: "HR Manager" },
  { value: "employee", label: "Employee" },
];

// ── Utilities ─────────────────────────────────────────────────────────

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

// ── IconBtn helper ────────────────────────────────────────────────────

function IconBtn({
  icon,
  label,
  onClick,
  asChild,
  href,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  asChild?: boolean;
  href?: string;
  className?: string;
}) {
  const btn = href ? (
    <Button asChild variant="ghost" size="icon" className={cn("h-7 w-7", className)}>
      <a href={href} aria-label={label}>
        {icon}
      </a>
    </Button>
  ) : (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7", className)}
      onClick={onClick}
      aria-label={label}
    >
      {icon}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function TardinessQuickLink({ employeeKey }: { employeeKey: string }) {
  const { role } = useAuth();
  const navigate = useNavigate();
  const allowed = !!role && ["super_admin", "admin", "hr_manager"].includes(role);
  if (!allowed || !employeeKey) return null;
  return (
    <IconBtn
      icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
      label="Tardiness"
      onClick={() =>
        navigate({
          to: "/hr/tardiness",
          search: { employee: employeeKey } as Record<string, string>,
        })
      }
    />
  );
}

// ── Root view ─────────────────────────────────────────────────────────

export function EmployeeDirectoryView() {
  const navigate = useNavigate();

  // ── Filter state ──────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const [pos, setPos] = useState("all");
  const [status, setStatus] = useState("active");
  const [firmFilter, setFirmFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "employee_id">("name");

  // ── Selection & sheet state ───────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────
  const employeesQ = useQuery({
    queryKey: ["hr", "employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, first_name, last_name, email, position, position_title, specialty, phone, avatar_url, status, department, employee_id, employment_type, join_date, firm_id, status_effective_date, separation_type, birth_date, aadhar_number, pan_number" as never,
        )
        .neq("provisioned_via" as never, "direct_client_hub" as never)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as EmployeeRow[];
    },
  });

  const firmsQ = useQuery({
    queryKey: ["hr", "employees", "firms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("firms")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FirmRow[];
    },
  });

  const rolesQ = useQuery({
    queryKey: ["hr", "employees", "roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      const map = new Map<string, Set<string>>();
      for (const r of (data ?? []) as Array<{ user_id: string; role: string }>) {
        const set = map.get(r.user_id) ?? new Set<string>();
        set.add(r.role);
        map.set(r.user_id, set);
      }
      return map;
    },
  });

  // ── Derived data ──────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const list = employeesQ.data ?? [];
    const q = search.trim();
    const base = list.filter((e) => {
      const userRoles = rolesQ.data?.get(e.id);
      if (userRoles?.has("client")) return false;
      if (status !== "all" && (e.status ?? "active") !== status) return false;
      if (dept !== "all" && (e.department ?? "") !== dept) return false;
      if (pos !== "all" && (e.position ?? "") !== pos) return false;
      if (roleFilter !== "all") {
        if (!userRoles || !userRoles.has(roleFilter)) return false;
      }
      if (firmFilter === "unassigned") {
        if (e.firm_id) return false;
      } else if (firmFilter !== "all" && e.firm_id !== firmFilter) {
        return false;
      }
      return true;
    });
    if (!q) {
      if (sortBy === "employee_id") {
        return [...base].sort((a, b) =>
          (a.employee_id ?? "").localeCompare(b.employee_id ?? "", undefined, { numeric: true }),
        );
      }
      return [...base].sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
    }
    const scored = base.map((e) => {
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
  }, [employeesQ.data, search, dept, pos, firmFilter, status, roleFilter, rolesQ.data, sortBy]);

  const counts = useMemo(() => {
    const list = (employeesQ.data ?? []).filter((e) => !rolesQ.data?.get(e.id)?.has("client"));
    return {
      total: list.length,
      active: list.filter((e) => (e.status ?? "active") === "active").length,
      inactive: list.filter((e) => e.status === "inactive").length,
      left: list.filter((e) => e.status === "left").length,
    };
  }, [employeesQ.data, rolesQ.data]);

  const selected = useMemo(() => {
    if (!selectedId) return filtered[0] ?? null;
    return (employeesQ.data ?? []).find((e) => e.id === selectedId) ?? null;
  }, [selectedId, filtered, employeesQ.data]);

  // ── Helpers ───────────────────────────────────────────────────────
  const openSettings = () => navigate({ to: "/admin/settings" });

  // ── Panes ─────────────────────────────────────────────────────────
  const leftPane = (
    <div className="h-full flex flex-col overflow-hidden border rounded-lg bg-background">
      {/* Fixed toolbar */}
      <div className="shrink-0 border-b px-2 py-1.5 space-y-1.5">
        {/* Row 1: search + action icons */}
        <div className="flex items-center gap-1">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees…"
              className="pl-7 h-7 text-xs"
            />
          </div>
          <TooltipProvider delayDuration={150}>
            <IconBtn
              icon={<Plus className="h-3.5 w-3.5" />}
              label="Add employee"
              onClick={() => setSheetOpen(true)}
            />
            <IconBtn
              icon={<Upload className="h-3.5 w-3.5" />}
              label="Bulk import"
              href="/hr/employees/import"
            />
          </TooltipProvider>
        </div>

        {/* Row 2: compact filters */}
        <div className="flex items-center gap-1 flex-wrap">
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="h-6 text-[11px] w-auto min-w-0 px-2 gap-1">
              <SelectValue placeholder="Dept" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All depts</SelectItem>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d.value} value={d.value} className="text-xs">
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={pos} onValueChange={setPos}>
            <SelectTrigger className="h-6 text-[11px] w-auto min-w-0 px-2 gap-1">
              <SelectValue placeholder="Position" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All positions</SelectItem>
              {POSITIONS.map((p) => (
                <SelectItem key={p} value={p} className="text-xs">
                  {prettyPosition(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-6 text-[11px] w-auto min-w-0 px-2 gap-1">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="left">Left</SelectItem>
            </SelectContent>
          </Select>

          <Select value={firmFilter} onValueChange={setFirmFilter}>
            <SelectTrigger className="h-6 text-[11px] w-auto min-w-0 px-2 gap-1">
              <SelectValue placeholder="Firm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All firms</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {(firmsQ.data ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id} className="text-xs">
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-6 text-[11px] w-auto min-w-0 px-2 gap-1">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value} className="text-xs">
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "name" | "employee_id")}>
            <SelectTrigger className="h-6 text-[11px] w-auto min-w-0 px-2 gap-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name" className="text-xs">
                Sort: Name
              </SelectItem>
              <SelectItem value="employee_id" className="text-xs">
                Sort: ID
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Count strip */}
      <div className="shrink-0 border-b px-3 py-1 text-[10px] text-muted-foreground tabular-nums text-right">
        {counts.total} total · {counts.active} active · {counts.inactive} inactive · {counts.left}{" "}
        left · {filtered.length} shown
      </div>

      {/* Scrollable list */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1">
        {employeesQ.isLoading ? (
          <div className="space-y-1">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-md" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Users className="h-7 w-7" />}
              title="No matches"
              description="Adjust filters or search."
            />
          </div>
        ) : (
          filtered.map((e) => {
            const isActive = selected?.id === e.id;
            return (
              <ContextMenu key={e.id}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setSelectedId(e.id)}
                    className={cn(
                      "w-full text-left rounded-md border-l-2 pl-2 pr-2.5 py-2 transition-colors",
                      "border-y border-r hover:bg-violet-500/5",
                      isActive
                        ? "bg-violet-500/10 border-l-violet-400/60 border-y-violet-500/30 border-r-violet-500/30"
                        : "border-l-violet-400/30 border-y-transparent border-r-transparent",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar
                        profile={{
                          id: e.id,
                          full_name: e.full_name,
                          email: e.email,
                          avatar_url: e.avatar_url,
                        }}
                        size="sm"
                      />
                      <span className="text-xs font-medium truncate flex-1">
                        <HighlightedText text={e.full_name ?? "Unnamed"} query={search} />
                      </span>
                      {(e.status ?? "active") !== "active" && (
                        <Badge
                          variant={e.status === "left" ? "destructive" : "outline"}
                          className="text-[10px] shrink-0 h-4 px-1 capitalize"
                        >
                          {e.status}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 pl-8">
                      {e.employee_id && (
                        <span className="text-[10px] font-mono text-primary/70 shrink-0">
                          {e.employee_id}
                        </span>
                      )}
                      {e.employee_id && (e.position_title || e.position) && (
                        <span className="text-[10px] text-muted-foreground/50">·</span>
                      )}
                      <span className="text-[10px] text-muted-foreground truncate flex-1">
                        {e.position_title || prettyPosition(e.position)}
                      </span>
                      {e.department && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0">
                          {DEPT_LABELS[e.department] ?? e.department}
                        </Badge>
                      )}
                    </div>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-44">
                  {e.email && (
                    <ContextMenuItem onSelect={() => window.open(`mailto:${e.email}`, "_blank")}>
                      <Mail className="h-3.5 w-3.5 mr-2" />
                      Send email
                    </ContextMenuItem>
                  )}
                  {e.phone && (
                    <ContextMenuItem onSelect={() => window.open(`tel:${e.phone}`, "_blank")}>
                      <Phone className="h-3.5 w-3.5 mr-2" />
                      Call
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={openSettings}>
                    <Settings className="h-3.5 w-3.5 mr-2" />
                    Open Settings
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })
        )}
      </div>
    </div>
  );

  const rightPane = selected ? (
    <RightPane
      employee={selected}
      firmsData={firmsQ.data ?? []}
      roles={rolesQ.data?.get(selected.id) ?? new Set()}
      onRolesChange={() => rolesQ.refetch()}
    />
  ) : (
    <div className="h-full flex items-center justify-center border rounded-lg bg-background">
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="Select an employee"
        description="Pick someone from the list to view their details."
      />
    </div>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="h-full flex flex-col overflow-hidden p-2">
        <ResizableTwoPane
          storageKey="hr-employee-dir"
          defaultLeft={28}
          minLeft={20}
          maxLeft={50}
          hideToolbar
          left={leftPane}
          right={rightPane}
        />
      </div>

      <EmployeeCreateSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </TooltipProvider>
  );
}

// ── Password management ───────────────────────────────────────────────

function PasswordManagementButton({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const resendFn = useServerFn(resendEmployeeInvite);
  const generateFn = useServerFn(generateTempPassword);

  const sendReset = useMutation({
    mutationFn: () => resendFn({ data: { profileId: employeeId, kind: "recovery" } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Password reset email sent to ${r.email}`);
      else toast.error(r.reason ?? "Couldn't send email");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const genTemp = useMutation({
    mutationFn: () => generateFn({ data: { profileId: employeeId } }),
    onSuccess: (r) => {
      if (r.ok && r.password) {
        setTempPassword(r.password);
        toast.success("Temporary password generated");
      } else {
        toast.error(r.reason ?? "Failed to generate password");
        setOpen(false);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const copy = async () => {
    if (!tempPassword) return;
    await navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const busy = sendReset.isPending || genTemp.isPending;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => {
              setTempPassword(null);
              setCopied(false);
              setOpen(true);
            }}
            aria-label="Manage password"
          >
            <KeyRound className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          Manage password
        </TooltipContent>
      </Tooltip>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(false);
            setTempPassword(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Password management
            </DialogTitle>
            <DialogDescription>
              Choose how to reset the password for{" "}
              <span className="font-medium">{employeeName ?? "this employee"}</span>.
            </DialogDescription>
          </DialogHeader>

          {tempPassword ? (
            /* Show generated password */
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                This temporary password has been set. Share it securely — it won't be shown again.
              </p>
              <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
                <code className="flex-1 text-sm font-mono tracking-wider select-all">
                  {tempPassword}
                </code>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={copy}>
                  {copied ? (
                    <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                The employee should change this on first login.
              </p>
              <Button
                className="w-full"
                onClick={() => {
                  setOpen(false);
                  setTempPassword(null);
                }}
              >
                Done
              </Button>
            </div>
          ) : (
            /* Two options */
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => sendReset.mutate()}
                className="w-full flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-accent transition-colors disabled:opacity-50"
              >
                <Mail className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-medium">Send reset email</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Emails a secure reset link to the employee's registered address.
                  </div>
                </div>
                {sendReset.isPending && <Loader2 className="h-4 w-4 animate-spin ml-auto mt-0.5" />}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => genTemp.mutate()}
                className="w-full flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-accent transition-colors disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                <div>
                  <div className="text-sm font-medium">Generate temporary password</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Sets a new random password instantly — shown once so you can share it.
                  </div>
                </div>
                {genTemp.isPending && <Loader2 className="h-4 w-4 animate-spin ml-auto mt-0.5" />}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Employee hero card ────────────────────────────────────────────────

function EmployeeHeroCard({ employee }: { employee: EmployeeRow }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const initials =
    [employee.first_name, employee.last_name]
      .filter(Boolean)
      .map((n) => n![0].toUpperCase())
      .join("") || (employee.full_name ?? "U")[0].toUpperCase();

  const removePhoto = async () => {
    setRemoving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: null } as never)
        .eq("id", employee.id);
      if (error) throw error;
      toast.success("Profile photo removed");
      qc.invalidateQueries({ queryKey: ["hr", "employees"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove photo");
    } finally {
      setRemoving(false);
    }
  };

  const uploadCroppedBlob = async (blob: Blob) => {
    setUploading(true);
    try {
      const path = `${employee.id}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: dbErr } = await supabase
        .from("profiles")
        .update({ avatar_url: data.publicUrl } as never)
        .eq("id", employee.id);
      if (dbErr) throw dbErr;
      toast.success("Profile photo updated");
      qc.invalidateQueries({ queryKey: ["hr", "employees"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="shrink-0 border-b bg-gradient-to-br from-primary/10 via-background to-background">
      <AvatarCropDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        imageSrc={employee.avatar_url}
        onSave={uploadCroppedBlob}
        onDelete={removePhoto}
        busy={uploading || removing}
      />
      <div className="px-4 pt-4 pb-3 flex flex-wrap items-start gap-4">
        {/* Avatar — click to open the profile-photo editor */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="group relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-primary text-primary-foreground text-3xl font-semibold shadow-md ring-2 ring-background select-none"
            aria-label="Edit profile photo"
          >
            {employee.avatar_url ? (
              <img
                src={employee.avatar_url}
                alt={employee.full_name ?? ""}
                className="h-full w-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
            <span className="absolute inset-0 hidden flex-col items-center justify-center bg-black/50 text-[9px] font-semibold uppercase tracking-widest text-white group-hover:flex">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Change"}
            </span>
          </button>
        </div>

        {/* Name + subtitle + badges */}
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight truncate leading-tight">
            {employee.full_name ?? "Unnamed"}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {[employee.position_title || prettyPosition(employee.position), employee.employee_id]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge
              variant={(employee.status ?? "active") === "active" ? "default" : "destructive"}
              className="text-[11px] capitalize"
            >
              {employee.status === "left" ? "Left" : (employee.status ?? "active")}
            </Badge>
            {employee.department && (
              <Badge variant="secondary" className="text-[11px]">
                {DEPT_LABELS[employee.department] ?? employee.department}
              </Badge>
            )}
            {employee.employment_type && (
              <Badge variant="outline" className="text-[11px] capitalize">
                {employee.employment_type.replace(/_/g, " ")}
              </Badge>
            )}
            {employee.status_effective_date &&
              (employee.status === "inactive" || employee.status === "left") && (
                <span className="text-[11px] text-muted-foreground self-center">
                  effective {formatDate(employee.status_effective_date)}
                </span>
              )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <TooltipProvider delayDuration={150}>
            {employee.email && (
              <IconBtn
                icon={<Mail className="h-3.5 w-3.5" />}
                label={`Email ${employee.full_name ?? "employee"}`}
                href={`mailto:${employee.email}`}
              />
            )}
            {employee.phone && (
              <IconBtn
                icon={<Phone className="h-3.5 w-3.5" />}
                label="Call"
                href={`tel:${employee.phone}`}
              />
            )}
            <TardinessQuickLink employeeKey={employee.employee_id ?? employee.full_name ?? ""} />
            <PasswordManagementButton employeeId={employee.id} employeeName={employee.full_name} />
          </TooltipProvider>
          <EmployeeRowActions
            employeeId={employee.id}
            isActive={(employee.status ?? "active") === "active"}
            currentStatus={employee.status ?? "active"}
          />
        </div>
      </div>
    </div>
  );
}

// ── Employee stats bar ────────────────────────────────────────────────

function EmployeeStatsBar({ employee }: { employee: EmployeeRow }) {
  const thisMonth = (() => {
    const now = new Date();
    return `${now.toLocaleString("default", { month: "short" })} ${now.getFullYear()} attendance`;
  })();

  const attendanceQ = useQuery({
    queryKey: ["hr", "stats", "attendance-month", employee.id],
    queryFn: async () => {
      const now = new Date();
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const { data, error } = await supabase
        .from("attendance_entries")
        .select("status")
        .eq("employee_id", employee.id)
        .gte("entry_date", from);
      if (error) throw error;
      const rows = (data ?? []) as { status: string }[];
      const present = rows.filter((r) => ["present", "remote"].includes(r.status)).length;
      const late = rows.filter((r) => r.status === "late").length;
      const absent = rows.filter((r) => r.status === "absent").length;
      return { total: rows.length, present, late, absent };
    },
    staleTime: 5 * 60 * 1000,
  });

  const leaveQ = useQuery({
    queryKey: ["hr", "stats", "leaves", employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_requests")
        .select("status, days")
        .eq("employee_id", employee.id);
      if (error) throw error;
      const rows = (data ?? []) as { status: string; days: number }[];
      const pending = rows.filter((r) => r.status === "pending").length;
      const approved = rows.filter((r) => r.status === "approved").length;
      const ytdDays = rows
        .filter((r) => r.status === "approved")
        .reduce((s, r) => s + (r.days ?? 0), 0);
      return { pending, approved, ytdDays };
    },
    staleTime: 5 * 60 * 1000,
  });

  const att = attendanceQ.data;
  const lv = leaveQ.data;

  const stats = [
    {
      icon: <BarChart3 className="h-4 w-4 text-sky-500" />,
      label: thisMonth,
      value: att ? `${att.present}/${att.total} days` : "—",
      sub: att ? `${att.late} late · ${att.absent} absent` : null,
      color: "bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800",
    },
    {
      icon: <Timer className="h-4 w-4 text-amber-500" />,
      label: "Pending leave requests",
      value: lv !== undefined ? String(lv.pending) : "—",
      sub: lv ? `${lv.approved} approved total` : null,
      color: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
    },
    {
      icon: <TrendingUp className="h-4 w-4 text-emerald-500" />,
      label: "Leave days taken (YTD)",
      value: lv !== undefined ? `${lv.ytdDays} days` : "—",
      sub: null,
      color: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
    },
  ];

  return (
    <section className="rounded-xl border p-4">
      <ProfileSectionHeader icon={<BarChart3 className="h-3.5 w-3.5" />}>
        Statistics
      </ProfileSectionHeader>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className={cn("rounded-lg border p-3 space-y-1", s.color)}>
            <div className="flex items-center gap-2">
              {s.icon}
              <span className="text-[11px] text-muted-foreground font-medium">{s.label}</span>
            </div>
            <p className="text-xl font-bold tabular-nums">{s.value}</p>
            {s.sub && <p className="text-[11px] text-muted-foreground">{s.sub}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Right pane ────────────────────────────────────────────────────────

function RightPane({
  employee,
  firmsData,
  roles,
  onRolesChange,
}: {
  employee: EmployeeRow;
  firmsData: FirmRow[];
  roles: Set<string>;
  onRolesChange: () => void;
}) {
  const { roles: viewerRoles } = useAuth();
  const isSuper = (viewerRoles ?? []).includes("super_admin");
  const isPayrollManager = (viewerRoles ?? []).some((r) =>
    ["super_admin", "admin", "hr_manager"].includes(r),
  );
  return (
    <Tabs
      defaultValue="profile"
      className="h-full flex flex-col overflow-hidden border rounded-lg bg-background"
    >
      {/* Hero profile card */}
      <EmployeeHeroCard employee={employee} />

      {/* Fixed tabs list — colored active states */}
      <div className="shrink-0 border-b px-3 pt-1 bg-background overflow-x-auto">
        <TabsList className="h-auto w-max gap-1 rounded-none bg-transparent p-0">
          <TabsTrigger
            value="profile"
            className="h-7 rounded-b-none border-t-2 border-transparent px-2 text-sm font-medium data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none"
          >
            Profile
          </TabsTrigger>
          {isSuper && (
            <TabsTrigger
              value="permissions"
              className="h-7 rounded-b-none border-t-2 border-transparent px-2 text-sm font-medium data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-700 data-[state=active]:shadow-none dark:data-[state=active]:text-emerald-300"
            >
              Hub Permissions
            </TabsTrigger>
          )}
          <TabsTrigger
            value="specialty"
            className="h-7 rounded-b-none border-t-2 border-transparent px-2 text-sm font-medium data-[state=active]:border-violet-500 data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-700 data-[state=active]:shadow-none dark:data-[state=active]:text-violet-300"
          >
            Specialty
          </TabsTrigger>
          {isPayrollManager && (
            <TabsTrigger
              value="compensation"
              className="h-7 rounded-b-none border-t-2 border-transparent px-2 text-sm font-medium data-[state=active]:border-orange-500 data-[state=active]:bg-orange-500/10 data-[state=active]:text-orange-700 data-[state=active]:shadow-none dark:data-[state=active]:text-orange-300"
            >
              Compensation
            </TabsTrigger>
          )}
          <TabsTrigger
            value="attendance"
            className="h-7 rounded-b-none border-t-2 border-transparent px-2 text-sm font-medium data-[state=active]:border-sky-500 data-[state=active]:bg-sky-500/10 data-[state=active]:text-sky-700 data-[state=active]:shadow-none dark:data-[state=active]:text-sky-300"
          >
            Attendance
          </TabsTrigger>
          <TabsTrigger
            value="leaves"
            className="h-7 rounded-b-none border-t-2 border-transparent px-2 text-sm font-medium data-[state=active]:border-amber-500 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-700 data-[state=active]:shadow-none dark:data-[state=active]:text-amber-300"
          >
            Leaves
          </TabsTrigger>
          <TabsTrigger
            value="documents"
            className="h-7 rounded-b-none border-t-2 border-transparent px-2 text-sm font-medium data-[state=active]:border-indigo-500 data-[state=active]:bg-indigo-500/10 data-[state=active]:text-indigo-700 data-[state=active]:shadow-none dark:data-[state=active]:text-indigo-300"
          >
            Documents
          </TabsTrigger>
        </TabsList>
      </div>

      {/* Tab content — each tab manages its own scroll */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <TabsContent value="profile" className="mt-0 h-full overflow-y-auto p-3">
          <ProfileAutoSave key={employee.id} employee={employee} firmsData={firmsData} />
        </TabsContent>
        {isSuper && (
          <TabsContent value="permissions" className="mt-0 h-full overflow-y-auto p-3">
            <HubPermissionsTab
              key={employee.id}
              employee={employee}
              roles={roles}
              onRolesChange={onRolesChange}
            />
          </TabsContent>
        )}
        <TabsContent value="specialty" className="mt-0 h-full overflow-y-auto p-3">
          <SpecialtyTab key={employee.id} employeeId={employee.id} />
        </TabsContent>
        {isPayrollManager && (
          <TabsContent value="compensation" className="mt-0 h-full overflow-hidden">
            <PayrollEmployeeSetup key={employee.id} initialEmployeeId={employee.id} />
          </TabsContent>
        )}
        <TabsContent value="attendance" className="mt-0 h-full flex flex-col overflow-hidden">
          <AttendanceTab employeeId={employee.id} employee={employee} />
        </TabsContent>
        <TabsContent value="leaves" className="mt-0 h-full overflow-y-auto p-3">
          <LeavesTab employeeId={employee.id} />
        </TabsContent>
        <TabsContent value="documents" className="mt-0 h-full overflow-y-auto p-3">
          <DocumentsTab employee={employee} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

// ── Auto-save profile tab ─────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved" | "error";

type PatchField =
  | "first_name"
  | "last_name"
  | "phone"
  | "employee_id"
  | "specialty"
  | "department"
  | "position"
  | "position_title"
  | "employment_type"
  | "join_date"
  | "assigned_firm_id"
  | "birth_date"
  | "aadhar_number"
  | "pan_number";

function StatusDot({ status }: { status: SaveStatus }) {
  if (status === "saving")
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />;
  if (status === "saved") return <Check className="h-3 w-3 text-emerald-600 shrink-0" />;
  if (status === "error") return <XCircle className="h-3 w-3 text-destructive shrink-0" />;
  return null;
}

function FieldShell({
  label,
  status,
  error,
  children,
  className,
}: {
  icon?: React.ReactNode;
  label: string;
  status: SaveStatus;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
          {label}
        </span>
        <StatusDot status={status} />
      </div>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function useFieldSaver(userId: string) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateEmployee);
  return async (field: PatchField, raw: string) => {
    const value: string | null = raw.length === 0 ? null : raw;
    await updateFn({
      data: {
        userId,
        patch: { [field]: value ?? undefined } as any,
      },
    });
    qc.invalidateQueries({ queryKey: ["hr", "employees"] });
  };
}

function validateField(field: PatchField, raw: string): string | null {
  const v = raw.trim();
  switch (field) {
    case "first_name":
    case "last_name":
      if (!v) return "Required";
      if (v.length > 100) return "Max 100 chars";
      return null;
    case "employee_id":
      if (!v) return "Required";
      if (v.length > 40) return "Max 40 chars";
      if (!/^[A-Za-z0-9._-]+$/.test(v)) return "Letters, digits, . _ - only";
      return null;
    case "phone":
      if (v.length > 40) return "Max 40 chars";
      return null;
    case "position_title":
      if (v.length > 120) return "Max 120 chars";
      return null;
    case "join_date":
    case "birth_date":
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Use YYYY-MM-DD";
      return null;
    case "aadhar_number":
      if (v && !/^\d{12}$/.test(v)) return "Must be 12 digits";
      return null;
    case "pan_number":
      if (v && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)) return "Format: ABCDE1234F";
      return null;
    default:
      return null;
  }
}

function AutoSaveText({
  userId,
  field,
  initial,
  label,
  type,
  className,
  placeholder,
}: {
  userId: string;
  field: PatchField;
  initial: string | null | undefined;
  label: string;
  type?: "text" | "date";
  className?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef(initial ?? "");

  useEffect(() => {
    setValue(initial ?? "");
    lastSaved.current = initial ?? "";
    setStatus("idle");
    setError(null);
  }, [userId, initial]);

  const save = useFieldSaver(userId);

  const commit = async () => {
    const trimmed = value.trim();
    if (trimmed === lastSaved.current) {
      setError(null);
      return;
    }
    const err = validateField(field, trimmed);
    if (err) {
      setError(err);
      setStatus("error");
      return;
    }
    setError(null);
    setStatus("saving");
    try {
      await save(field, trimmed);
      lastSaved.current = trimmed;
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch (e: any) {
      setStatus("error");
      const msg = e?.message ?? "Save failed";
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <FieldShell label={label} status={status} error={error} className={className}>
      <Input
        type={type === "date" ? "date" : "text"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
    </FieldShell>
  );
}

function AutoSaveSelect({
  userId,
  field,
  initial,
  label,
  options,
  placeholder,
  className,
}: {
  userId: string;
  field: PatchField;
  initial: string | null | undefined;
  label: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef(initial ?? "");

  useEffect(() => {
    setValue(initial ?? "");
    lastSaved.current = initial ?? "";
    setStatus("idle");
    setError(null);
  }, [userId, initial]);

  const save = useFieldSaver(userId);

  const onChange = async (next: string) => {
    setValue(next);
    if (next === lastSaved.current) return;
    setStatus("saving");
    setError(null);
    try {
      await save(field, next);
      lastSaved.current = next;
      setStatus("saved");
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch (e: any) {
      setStatus("error");
      const msg = e?.message ?? "Save failed";
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <FieldShell label={label} status={status} error={error} className={className}>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue placeholder={placeholder ?? "—"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

function AutoSaveEmail({
  userId,
  initial,
}: {
  userId: string;
  initial: string | null | undefined;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateEmployeeEmail);
  const [value, setValue] = useState(initial ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const lastSaved = useRef(initial ?? "");

  useEffect(() => {
    setValue(initial ?? "");
    lastSaved.current = initial ?? "";
    setStatus("idle");
    setError(null);
  }, [userId, initial]);

  const commit = async () => {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === lastSaved.current.toLowerCase()) {
      setError(null);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email");
      setStatus("error");
      return;
    }
    setError(null);
    setStatus("saving");
    try {
      await updateFn({ data: { userId, email: trimmed } });
      lastSaved.current = trimmed;
      setValue(trimmed);
      setStatus("saved");
      qc.invalidateQueries({ queryKey: ["hr", "employees"] });
      setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch (e: any) {
      setStatus("error");
      const msg = e?.message ?? "Save failed";
      setError(msg);
      toast.error(msg);
    }
  };

  return (
    <FieldShell label="Email" status={status} error={error}>
      <Input
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-8 text-sm"
      />
    </FieldShell>
  );
}

function ProfileSectionHeader({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-3">
      {icon}
      {children}
    </div>
  );
}

function ProfileAutoSave({ employee, firmsData }: { employee: EmployeeRow; firmsData: FirmRow[] }) {
  return (
    <div className="space-y-4">
      {/* ── Statistics ──────────────────────────────────────── */}
      <EmployeeStatsBar employee={employee} />

      {/* ── Personal Information ────────────────────────────── */}
      <section className="rounded-xl border p-4">
        <ProfileSectionHeader icon={<UserCircle className="h-3.5 w-3.5" />}>
          Personal Information
        </ProfileSectionHeader>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
          <AutoSaveText
            userId={employee.id}
            field="first_name"
            initial={employee.first_name}
            label="First Name"
          />
          <AutoSaveText
            userId={employee.id}
            field="last_name"
            initial={employee.last_name}
            label="Last Name"
          />
          <AutoSaveEmail userId={employee.id} initial={employee.email} />
          <AutoSaveText userId={employee.id} field="phone" initial={employee.phone} label="Phone" />
        </div>
      </section>

      {/* ── Role & Expertise ────────────────────────────────── */}
      <section className="rounded-xl border p-4">
        <ProfileSectionHeader icon={<Briefcase className="h-3.5 w-3.5" />}>
          Role & Expertise
        </ProfileSectionHeader>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
          <AutoSaveText
            userId={employee.id}
            field="position_title"
            initial={employee.position_title}
            label="Designation"
          />
          <AutoSaveSelect
            userId={employee.id}
            field="position"
            initial={employee.position}
            label="Position Level"
            placeholder="Select…"
            options={["partner", "manager", "senior", "staff", "reviewer", "preparer", "other"].map(
              (p) => ({
                value: p,
                label: prettyPosition(p),
              }),
            )}
          />
          <AutoSaveSelect
            userId={employee.id}
            field="department"
            initial={employee.department}
            label="Department"
            placeholder="Select…"
            options={[
              { value: "ops", label: "Operations" },
              { value: "finance", label: "Finance" },
              { value: "hr", label: "Human Resources" },
              { value: "exec", label: "Executive" },
            ]}
          />
        </div>
      </section>

      {/* ── Employment Details ──────────────────────────────── */}
      <section className="rounded-xl border p-4">
        <ProfileSectionHeader icon={<BadgeCheck className="h-3.5 w-3.5" />}>
          Employment Details
        </ProfileSectionHeader>
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
          <AutoSaveText
            userId={employee.id}
            field="employee_id"
            initial={employee.employee_id}
            label="Employee ID"
          />
          <AutoSaveSelect
            userId={employee.id}
            field="employment_type"
            initial={employee.employment_type}
            label="Employment Type"
            placeholder="Select…"
            options={[
              { value: "full_time", label: "Full-Time" },
              { value: "part_time", label: "Part-Time" },
              { value: "contractor", label: "Contractor" },
              { value: "intern", label: "Intern" },
            ]}
          />
          <AutoSaveText
            userId={employee.id}
            field="join_date"
            initial={employee.join_date}
            label="Join Date"
            type="date"
          />
        </div>
      </section>

      {/* ── Employment Status ────────────────────────────────── */}
      <StatusSection employee={employee} />

      {/* ── Firm & Client Assignments ───────────────────────── */}
      <AssignmentsSection employee={employee} firmsData={firmsData} />

      {/* ── Bank Accounts ────────────────────────────────────── */}
      <BankAccountsSection employeeId={employee.id} />

      {/* ── OneNote Backup ───────────────────────────────────── */}
      <OneNoteBackupSection employeeId={employee.id} />

      <p className="text-[10px] text-muted-foreground px-1">Changes save automatically on blur.</p>
    </div>
  );
}

// ── Employment Status section ─────────────────────────────────────────

function StatusSection({ employee }: { employee: EmployeeRow }) {
  const qc = useQueryClient();
  const deactivateFn = useServerFn(deactivateEmployee);
  const reactivateFn = useServerFn(reactivateEmployee);

  const currentStatus = (employee.status ?? "active") as "active" | "inactive" | "left";

  const [editing, setEditing] = useState(false);
  const [newStatus, setNewStatus] = useState<"active" | "inactive" | "left">(currentStatus);
  const [effectiveDate, setEffectiveDate] = useState(employee.status_effective_date ?? "");
  const [dateError, setDateError] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (newStatus === "active") {
        return reactivateFn({ data: { userId: employee.id } });
      }
      if (!effectiveDate) {
        setDateError("Effective date is required");
        throw new Error("Effective date is required");
      }
      return deactivateFn({
        data: { userId: employee.id, separationType: newStatus, effectiveDate },
      });
    },
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["hr", "employees"] });
      setEditing(false);
      setDateError("");
    },
    onError: (e: any) => {
      if (e?.message !== "Effective date is required") toast.error(e?.message ?? "Failed");
    },
  });

  const openEdit = () => {
    setNewStatus(currentStatus);
    setEffectiveDate(employee.status_effective_date ?? "");
    setDateError("");
    setEditing(true);
  };

  const statusLabel: Record<string, string> = {
    active: "Active",
    inactive: "Inactive",
    left: "Left",
  };

  return (
    <section className="rounded-xl border p-4">
      <ProfileSectionHeader icon={<BadgeCheck className="h-3.5 w-3.5" />}>
        Employment Status
      </ProfileSectionHeader>

      {!editing ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant={currentStatus === "active" ? "default" : "destructive"}
              className="text-[11px] capitalize"
            >
              {statusLabel[currentStatus] ?? currentStatus}
            </Badge>
            {employee.status_effective_date && currentStatus !== "active" && (
              <span className="text-xs text-muted-foreground">
                effective {formatDate(employee.status_effective_date)}
              </span>
            )}
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={openEdit}>
            Change
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <RadioGroup
            value={newStatus}
            onValueChange={(v) => {
              setNewStatus(v as "active" | "inactive" | "left");
              setDateError("");
            }}
            className="gap-2"
          >
            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <RadioGroupItem value="active" className="mt-0.5" />
              <div>
                <div className="text-sm font-medium">Active</div>
                <div className="text-xs text-muted-foreground">Full access restored.</div>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent transition-colors has-[:checked]:border-amber-500 has-[:checked]:bg-amber-500/5">
              <RadioGroupItem value="inactive" className="mt-0.5" />
              <div>
                <div className="text-sm font-medium">Inactive</div>
                <div className="text-xs text-muted-foreground">
                  Temporary — on leave, medical, or suspended. Can be reactivated.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent transition-colors has-[:checked]:border-destructive has-[:checked]:bg-destructive/5">
              <RadioGroupItem value="left" className="mt-0.5" />
              <div>
                <div className="text-sm font-medium">Left</div>
                <div className="text-xs text-muted-foreground">
                  Permanent — resigned, terminated, or contract ended.
                </div>
              </div>
            </label>
          </RadioGroup>

          {newStatus !== "active" && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                Effective date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => {
                  setEffectiveDate(e.target.value);
                  if (e.target.value) setDateError("");
                }}
                className="h-8 text-sm"
              />
              {dateError && <p className="text-[11px] text-destructive">{dateError}</p>}
              <p className="text-[11px] text-muted-foreground">
                Used for payroll cut-off and reports. Access is revoked immediately.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setEditing(false);
                setDateError("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={mutation.isPending || newStatus === currentStatus}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Bank Accounts ─────────────────────────────────────────────────────

type BankAccountRow = {
  id: string;
  bank_name: string;
  account_holder_name: string;
  account_number: string;
  ifsc_code: string | null;
  account_type: string;
  is_payroll_account: boolean;
};

const EMPTY_FORM = {
  bankName: "",
  accountHolderName: "",
  accountNumber: "",
  ifscCode: "",
  accountType: "savings" as "savings" | "current" | "salary",
  isPayrollAccount: false,
};

function maskAccount(num: string) {
  if (num.length <= 4) return num;
  return "•".repeat(num.length - 4) + num.slice(-4);
}

function BankAccountsSection({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertEmployeeBankAccount);
  const deleteFn = useServerFn(deleteEmployeeBankAccount);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const q = useQuery({
    queryKey: ["hr", "employees", "bank-accounts", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_bank_accounts" as never)
        .select(
          "id, bank_name, account_holder_name, account_number, ifsc_code, account_type, is_payroll_account",
        )
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BankAccountRow[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const errs: Record<string, string> = {};
      if (!form.bankName.trim()) errs.bankName = "Required";
      if (!form.accountHolderName.trim()) errs.accountHolderName = "Required";
      if (!form.accountNumber.trim()) errs.accountNumber = "Required";
      if (Object.keys(errs).length) {
        setErrors(errs);
        throw new Error("Validation");
      }
      setErrors({});
      return upsertFn({
        data: {
          id: editId ?? undefined,
          employeeId,
          bankName: form.bankName.trim(),
          accountHolderName: form.accountHolderName.trim(),
          accountNumber: form.accountNumber.trim(),
          ifscCode: form.ifscCode.trim() || null,
          accountType: form.accountType,
          isPayrollAccount: form.isPayrollAccount,
        },
      });
    },
    onSuccess: () => {
      toast.success(editId ? "Bank account updated" : "Bank account added");
      qc.invalidateQueries({ queryKey: ["hr", "employees", "bank-accounts", employeeId] });
      setShowForm(false);
      setEditId(null);
      setForm(EMPTY_FORM);
    },
    onError: (e: any) => {
      if (e?.message !== "Validation") toast.error(e?.message ?? "Failed");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (accountId: string) => deleteFn({ data: { accountId, employeeId } }),
    onSuccess: () => {
      toast.success("Bank account removed");
      qc.invalidateQueries({ queryKey: ["hr", "employees", "bank-accounts", employeeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const openAdd = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setShowForm(true);
  };

  const openEdit = (acc: BankAccountRow) => {
    setEditId(acc.id);
    setForm({
      bankName: acc.bank_name,
      accountHolderName: acc.account_holder_name,
      accountNumber: acc.account_number,
      ifscCode: acc.ifsc_code ?? "",
      accountType: acc.account_type as "savings" | "current" | "salary",
      isPayrollAccount: acc.is_payroll_account,
    });
    setErrors({});
    setShowForm(true);
  };

  const accounts = q.data ?? [];

  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-center justify-between mb-3">
        <ProfileSectionHeader icon={<Landmark className="h-3.5 w-3.5" />}>
          Bank Accounts
        </ProfileSectionHeader>
        {!showForm && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openAdd}>
            <Plus className="h-3 w-3 mr-1" /> Add Account
          </Button>
        )}
      </div>

      {/* Account cards */}
      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : accounts.length === 0 && !showForm ? (
        <p className="text-xs text-muted-foreground">No bank accounts linked yet.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className={cn(
                "rounded-lg border p-3 flex items-start justify-between gap-3",
                acc.is_payroll_account &&
                  "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20",
              )}
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{acc.bank_name}</span>
                  <Badge variant="secondary" className="text-[10px] capitalize h-4 px-1">
                    {acc.account_type}
                  </Badge>
                  {acc.is_payroll_account && (
                    <Badge className="text-[10px] h-4 px-1 gap-0.5 bg-emerald-600 hover:bg-emerald-600">
                      <Star className="h-2.5 w-2.5" /> Payroll
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{acc.account_holder_name}</p>
                <p className="text-xs font-mono tabular-nums text-foreground/70">
                  {maskAccount(acc.account_number)}
                  {acc.ifsc_code && <span className="ml-2 not-italic">{acc.ifsc_code}</span>}
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => openEdit(acc)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(acc.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
          <p className="text-xs font-semibold text-foreground/70">
            {editId ? "Edit account" : "New bank account"}
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                Bank Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.bankName}
                onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                placeholder="e.g. HDFC Bank"
                className="h-8 text-sm"
              />
              {errors.bankName && <p className="text-[11px] text-destructive">{errors.bankName}</p>}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                Account Type
              </Label>
              <Select
                value={form.accountType}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, accountType: v as typeof form.accountType }))
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="savings">Savings</SelectItem>
                  <SelectItem value="current">Current</SelectItem>
                  <SelectItem value="salary">Salary</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                Account Holder Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.accountHolderName}
                onChange={(e) => setForm((f) => ({ ...f, accountHolderName: e.target.value }))}
                placeholder="Full name as per bank records"
                className="h-8 text-sm"
              />
              {errors.accountHolderName && (
                <p className="text-[11px] text-destructive">{errors.accountHolderName}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                Account Number <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.accountNumber}
                onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                placeholder="Account number"
                className="h-8 text-sm font-mono"
              />
              {errors.accountNumber && (
                <p className="text-[11px] text-destructive">{errors.accountNumber}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                IFSC Code
              </Label>
              <Input
                value={form.ifscCode}
                onChange={(e) => setForm((f) => ({ ...f, ifscCode: e.target.value.toUpperCase() }))}
                placeholder="e.g. HDFC0001234"
                className="h-8 text-sm font-mono"
                maxLength={11}
              />
            </div>
          </div>

          {/* Payroll toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.isPayrollAccount}
              onChange={(e) => setForm((f) => ({ ...f, isPayrollAccount: e.target.checked }))}
              className="h-4 w-4 rounded border-input accent-emerald-600"
            />
            <span className="text-sm">Use this account for payroll processing</span>
            {form.isPayrollAccount && (
              <Badge className="text-[10px] h-4 px-1.5 gap-0.5 bg-emerald-600 hover:bg-emerald-600">
                <Star className="h-2.5 w-2.5" /> Payroll
              </Badge>
            )}
          </label>
          {form.isPayrollAccount && (
            <p className="text-[11px] text-muted-foreground">
              Any previously marked payroll account will be unset automatically.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setShowForm(false);
                setEditId(null);
                setErrors({});
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Saving…" : editId ? "Update" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Specialty tab ─────────────────────────────────────────────────────

// Curated specialties for an accounting/CA firm. "Other" lets HR free-type.
const SPECIALTY_OPTIONS = [
  "Income Tax",
  "GST (Goods & Services Tax)",
  "Statutory Audit",
  "Internal Audit",
  "Tax Audit",
  "Forensic Audit",
  "Accounting & Bookkeeping",
  "Financial Reporting",
  "ROC / Company Law (MCA)",
  "TDS / TCS",
  "Payroll & Compliance",
  "Transfer Pricing",
  "International Taxation",
  "FEMA / RBI",
  "Indirect Tax / Customs",
  "Due Diligence",
  "Valuation",
  "Insolvency & Bankruptcy",
  "Project Finance",
  "Management Consulting",
];

type SpecialtyRow = {
  id: string;
  specialty: string;
  description: string | null;
};

type TrainingRow = {
  id: string;
  status: string;
  score: number | null;
  completed_at: string | null;
  course: {
    title: string;
    category: string;
    provider: string | null;
    cpe_credits: number | null;
  } | null;
};

const TRAINING_CATEGORY_LABELS: Record<string, string> = {
  compliance: "Compliance",
  technical: "Technical",
  soft_skills: "Soft Skills",
  onboarding: "Onboarding",
  other: "Other",
};

// ── OneNote Backup section ─────────────────────────────────────────────

type OneNoteProfile = {
  onenote_notebook_id: string | null;
  onenote_notebook_url: string | null;
};

function OneNoteBackupSection({ employeeId }: { employeeId: string }) {
  const resolveNotebookFn = useServerFn(resolveAndSaveNotebookServerFn);
  const clearNotebookFn = useServerFn(clearOneNoteNotebookServerFn);
  const testAccessFn = useServerFn(testOneNoteAccessServerFn);
  const syncAllFn = useServerFn(syncAllNotesForEmployeeServerFn);
  const qc = useQueryClient();

  const [linkMode, setLinkMode] = useState(false);
  const [notebookUrlDraft, setNotebookUrlDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<OneNoteTestResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [bulkResult, setBulkResult] = useState<OneNoteBulkSyncResult | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["hr", "onenote-profile", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("onenote_notebook_id, onenote_notebook_url")
        .eq("id", employeeId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as OneNoteProfile | null;
    },
    staleTime: 60_000,
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["hr", "onenote-profile", employeeId] });

  async function handleResolveNotebook() {
    const val = notebookUrlDraft.trim();
    if (!val) return;
    setSaving(true);
    try {
      await resolveNotebookFn({ data: { employeeId, notebookUrl: val } });
      setNotebookUrlDraft("");
      setLinkMode(false);
      await invalidate();
      toast.success("Notebook linked successfully");
    } catch (e) {
      toast.error("Could not resolve notebook", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleClearNotebook() {
    setSaving(true);
    try {
      await clearNotebookFn({ data: { employeeId } });
      await invalidate();
      toast.success("Notebook reset — will auto-create on next sync");
    } catch (e) {
      toast.error("Failed to reset notebook", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestAccess() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testAccessFn({});
      setTestResult(result);
    } catch (e) {
      setTestResult({
        ok: false,
        stage: "api",
        error: (e as Error).message ?? "Unknown error",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleBulkSync() {
    setSyncing(true);
    setBulkResult(null);
    try {
      const result = await syncAllFn({ data: { employeeId } });
      setBulkResult(result);
      if (result.synced > 0) {
        toast.success(
          result.remaining > 0
            ? `Synced ${result.synced} notes — ${result.remaining} remaining (run again)`
            : `All ${result.synced} note${result.synced !== 1 ? "s" : ""} synced to OneNote`,
        );
      } else if (result.total === 0) {
        toast.success("All notes already synced — nothing to do");
      }
    } catch (e) {
      toast.error("Bulk sync failed", { description: (e as Error).message });
    } finally {
      setSyncing(false);
    }
  }

  const isLinked = !!profile?.onenote_notebook_id;

  return (
    <section className="rounded-xl border p-4">
      <ProfileSectionHeader icon={<BookOpen className="h-3.5 w-3.5" />}>
        OneNote Backup
      </ProfileSectionHeader>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Status badge */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                isLinked ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
              )}
            >
              {isLinked ? (
                <>
                  <Check className="h-3 w-3" /> Notebook linked
                </>
              ) : (
                <>
                  <Clock className="h-3 w-3" /> Will auto-create on first note save
                </>
              )}
            </span>
            {profile?.onenote_notebook_url && (
              <a
                href={profile.onenote_notebook_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                Open notebook <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Notebook config */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
              Notebook
            </span>
            {!linkMode ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setLinkMode(true)}
                >
                  <Link2 className="mr-1 h-3 w-3" /> Link existing notebook
                </Button>
                {isLinked && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    disabled={saving}
                    onClick={() => void handleClearNotebook()}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" /> Reset to auto-create
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="url"
                  value={notebookUrlDraft}
                  onChange={(e) => setNotebookUrlDraft(e.target.value)}
                  placeholder="https://…sharepoint.com/…/Notebooks/MyNotebook"
                  className="h-8 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={saving || !notebookUrlDraft.trim()}
                    onClick={() => void handleResolveNotebook()}
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Resolve & Save"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setLinkMode(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Test API access */}
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={testing || saving}
              onClick={() => void handleTestAccess()}
            >
              {testing ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Testing…
                </>
              ) : (
                <>
                  <Check className="mr-1 h-3 w-3" /> Test OneNote API Access
                </>
              )}
            </Button>
            {testResult && (
              <div
                className={cn(
                  "rounded-md border px-3 py-2 text-xs",
                  testResult.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-800",
                )}
              >
                {testResult.ok ? (
                  <div className="space-y-0.5">
                    <p className="font-semibold">✓ OneNote API working — {testResult.siteUrl}</p>
                    <p>
                      {testResult.notebookCount === 0
                        ? "No notebooks yet (will be created on first sync)"
                        : `${testResult.notebookCount} notebook${testResult.notebookCount !== 1 ? "s" : ""}: ${testResult.notebooks.join(", ")}`}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    <p className="font-semibold">
                      ✗{" "}
                      {testResult.stage === "config"
                        ? "Not configured"
                        : testResult.stage === "token"
                          ? "Token error"
                          : testResult.stage === "site"
                            ? "Site not found"
                            : "API error"}
                    </p>
                    <p className="break-all">{testResult.error}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Backfill — sync all un-synced notes */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
              Backfill
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={syncing || saving}
              onClick={() => void handleBulkSync()}
            >
              {syncing ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Syncing…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-1 h-3 w-3" /> Sync un-synced notes
                </>
              )}
            </Button>

            {bulkResult && (
              <div
                className={cn(
                  "rounded-md border px-3 py-2 text-xs",
                  bulkResult.errors.length > 0
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800",
                )}
              >
                {bulkResult.total === 0 ? (
                  <p className="font-semibold">✓ All notes already synced</p>
                ) : (
                  <div className="space-y-1">
                    <p className="font-semibold">
                      {bulkResult.errors.length === 0 ? "✓" : "⚠"} Synced {bulkResult.synced} of{" "}
                      {bulkResult.total} note
                      {bulkResult.total !== 1 ? "s" : ""}
                      {bulkResult.remaining > 0 &&
                        ` · ${bulkResult.remaining} remaining — run again`}
                    </p>
                    {bulkResult.errors.length > 0 && (
                      <ul className="ml-2 list-disc space-y-0.5">
                        {bulkResult.errors.map((e) => (
                          <li key={e.noteDate} className="break-all">
                            <span className="font-medium">{e.noteDate}:</span> {e.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground">
            Daily Notes sync to the firm OneNote account after each save. Configure the service
            account in <span className="font-medium">Admin → Integrations → Microsoft Graph</span>.
          </p>
        </div>
      )}
    </section>
  );
}

function SpecialtyTab({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertEmployeeSpecialty);
  const deleteFn = useServerFn(deleteEmployeeSpecialty);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [specialty, setSpecialty] = useState("");
  const [customSpecialty, setCustomSpecialty] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const specialtiesQ = useQuery({
    queryKey: ["hr", "employees", "specialties", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_specialties" as never)
        .select("id, specialty, description")
        .eq("employee_id", employeeId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as SpecialtyRow[];
    },
  });

  const trainingQ = useQuery({
    queryKey: ["hr", "employees", "training", employeeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_assignments" as never)
        .select(
          "id, status, score, completed_at, course:training_courses(title, category, provider, cpe_credits)",
        )
        .eq("employee_id", employeeId)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as TrainingRow[];
    },
  });

  const reset = () => {
    setShowForm(false);
    setEditId(null);
    setSpecialty("");
    setCustomSpecialty("");
    setDescription("");
    setError(null);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const label = (specialty === "__other__" ? customSpecialty : specialty).trim();
      if (!label) {
        setError("Pick or enter a specialty");
        throw new Error("Validation");
      }
      setError(null);
      return upsertFn({
        data: {
          id: editId ?? undefined,
          employeeId,
          specialty: label,
          description: description.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success(editId ? "Specialty updated" : "Specialty added");
      qc.invalidateQueries({ queryKey: ["hr", "employees", "specialties", employeeId] });
      reset();
    },
    onError: (e: any) => {
      if (e?.message === "Validation") return;
      const msg = /unique|duplicate/i.test(e?.message ?? "")
        ? "This specialty is already added"
        : (e?.message ?? "Failed");
      toast.error(msg);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (specialtyId: string) => deleteFn({ data: { specialtyId, employeeId } }),
    onSuccess: () => {
      toast.success("Specialty removed");
      qc.invalidateQueries({ queryKey: ["hr", "employees", "specialties", employeeId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const openAdd = () => {
    setEditId(null);
    setSpecialty("");
    setCustomSpecialty("");
    setDescription("");
    setError(null);
    setShowForm(true);
  };

  const openEdit = (row: SpecialtyRow) => {
    setEditId(row.id);
    const known = SPECIALTY_OPTIONS.includes(row.specialty);
    setSpecialty(known ? row.specialty : "__other__");
    setCustomSpecialty(known ? "" : row.specialty);
    setDescription(row.description ?? "");
    setError(null);
    setShowForm(true);
  };

  const specialties = specialtiesQ.data ?? [];
  const training = trainingQ.data ?? [];

  // Already-used labels can't be re-added (DB enforces uniqueness too).
  const usedLabels = new Set(
    specialties.filter((s) => s.id !== editId).map((s) => s.specialty.toLowerCase()),
  );

  const completed = training.filter((t) => t.status === "completed");
  const scored = completed.filter((t) => t.score !== null && t.score !== undefined);
  const overallScore =
    scored.length > 0
      ? Math.round((scored.reduce((sum, t) => sum + (t.score ?? 0), 0) / scored.length) * 10) / 10
      : null;

  return (
    <div className="space-y-4">
      {/* ── Specialties ─────────────────────────────────────── */}
      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <ProfileSectionHeader icon={<Sparkles className="h-3.5 w-3.5" />}>
            Specialties
          </ProfileSectionHeader>
          {!showForm && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openAdd}>
              <Plus className="h-3 w-3 mr-1" /> Add Specialty
            </Button>
          )}
        </div>

        {specialtiesQ.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : specialties.length === 0 && !showForm ? (
          <p className="text-xs text-muted-foreground">
            No specialties added yet. Add areas of expertise with a short description.
          </p>
        ) : (
          <div className="space-y-2 mb-3">
            {specialties.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <Badge className="text-[11px] gap-1 bg-violet-600 hover:bg-violet-600">
                    <Sparkles className="h-2.5 w-2.5" /> {row.specialty}
                  </Badge>
                  {row.description && (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {row.description}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(row.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add / Edit form */}
        {showForm && (
          <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
            <p className="text-xs font-semibold text-foreground/70">
              {editId ? "Edit specialty" : "New specialty"}
            </p>

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                Specialty <span className="text-destructive">*</span>
              </Label>
              <Select value={specialty} onValueChange={setSpecialty}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select a specialty…" />
                </SelectTrigger>
                <SelectContent>
                  {SPECIALTY_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt}
                      value={opt}
                      disabled={usedLabels.has(opt.toLowerCase())}
                      className="text-xs"
                    >
                      {opt}
                    </SelectItem>
                  ))}
                  <SelectItem value="__other__" className="text-xs">
                    Other (type below)…
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {specialty === "__other__" && (
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                  Custom specialty <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={customSpecialty}
                  onChange={(e) => setCustomSpecialty(e.target.value)}
                  placeholder="e.g. Crypto Taxation"
                  className="h-8 text-sm"
                  maxLength={120}
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                Description
              </Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this person handles within this specialty…"
                className="text-sm min-h-[72px]"
                maxLength={2000}
              />
            </div>

            {error && <p className="text-[11px] text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={reset}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                {saveMutation.isPending ? "Saving…" : editId ? "Update" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ── Training & competency ───────────────────────────── */}
      <section className="rounded-xl border p-4">
        <div className="flex items-center justify-between mb-3">
          <ProfileSectionHeader icon={<GraduationCap className="h-3.5 w-3.5" />}>
            Training Completed
          </ProfileSectionHeader>
          {overallScore !== null && (
            <Badge
              className={cn(
                "text-[11px] gap-1",
                overallScore >= 70
                  ? "bg-emerald-600 hover:bg-emerald-600"
                  : overallScore >= 40
                    ? "bg-amber-600 hover:bg-amber-600"
                    : "bg-rose-600 hover:bg-rose-600",
              )}
            >
              <Award className="h-2.5 w-2.5" /> Overall {overallScore}%
            </Badge>
          )}
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="rounded-lg border p-3 space-y-0.5 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800">
            <p className="text-[11px] text-muted-foreground font-medium">Completed</p>
            <p className="text-xl font-bold tabular-nums">{completed.length}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-0.5 bg-sky-50 border-sky-200 dark:bg-sky-950/30 dark:border-sky-800">
            <p className="text-[11px] text-muted-foreground font-medium">Assigned</p>
            <p className="text-xl font-bold tabular-nums">{training.length}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-0.5 bg-violet-50 border-violet-200 dark:bg-violet-950/30 dark:border-violet-800">
            <p className="text-[11px] text-muted-foreground font-medium">Overall Score</p>
            <p className="text-xl font-bold tabular-nums">
              {overallScore !== null ? `${overallScore}%` : "—"}
            </p>
          </div>
        </div>

        {trainingQ.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : completed.length === 0 ? (
          <p className="text-xs text-muted-foreground">No completed training yet.</p>
        ) : (
          <div className="space-y-2">
            {completed.map((t) => (
              <div
                key={t.id}
                className="rounded-lg border p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {t.course?.title ?? "Untitled course"}
                    </span>
                    {t.course?.category && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1">
                        {TRAINING_CATEGORY_LABELS[t.course.category] ?? t.course.category}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {[
                      t.course?.provider,
                      t.completed_at ? `Completed ${formatDate(t.completed_at)}` : null,
                      t.course?.cpe_credits ? `${t.course.cpe_credits} CPE` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                {t.score !== null && t.score !== undefined ? (
                  <Badge
                    className={cn(
                      "text-[11px] shrink-0",
                      t.score >= 70
                        ? "bg-emerald-600 hover:bg-emerald-600"
                        : t.score >= 40
                          ? "bg-amber-600 hover:bg-amber-600"
                          : "bg-rose-600 hover:bg-rose-600",
                    )}
                  >
                    {t.score}%
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[11px] shrink-0 gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" /> Done
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Firm & Client Assignments ─────────────────────────────────────────

type DirectClientRow = { id: string; display_name: string; client_code: string };

function AssignmentsSection({
  employee,
  firmsData,
}: {
  employee: EmployeeRow;
  firmsData: FirmRow[];
}) {
  const qc = useQueryClient();
  const setFirmsFn = useServerFn(setFirmAssignments);
  const setClientsFn = useServerFn(setClientAssignments);

  // ── Queries ──────────────────────────────────────────────
  const firmAssignmentsQ = useQuery({
    queryKey: ["hr", "employees", "firm-assignments", employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_firm_assignments" as never)
        .select("firm_id")
        .eq("employee_id", employee.id);
      if (error) throw error;
      return ((data ?? []) as Array<{ firm_id: string }>).map((r) => r.firm_id);
    },
  });

  const clientAssignmentsQ = useQuery({
    queryKey: ["hr", "employees", "client-assignments", employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_client_assignments" as never)
        .select("client_id")
        .eq("employee_id", employee.id);
      if (error) throw error;
      return ((data ?? []) as Array<{ client_id: string }>).map((r) => r.client_id);
    },
  });

  const clientsQ = useQuery({
    queryKey: ["hr", "direct-clients-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("direct_clients")
        .select("id, display_name, client_code")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DirectClientRow[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // ── Mutations ─────────────────────────────────────────────
  const firmMutation = useMutation({
    mutationFn: (firmIds: string[]) => setFirmsFn({ data: { userId: employee.id, firmIds } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr", "employees", "firm-assignments", employee.id] });
      toast.success("Firm assignments saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const clientMutation = useMutation({
    mutationFn: (clientIds: string[]) => setClientsFn({ data: { userId: employee.id, clientIds } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr", "employees", "client-assignments", employee.id] });
      toast.success("Client assignments saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  const assignedFirmIds = firmAssignmentsQ.data ?? [];
  const assignedClientIds = clientAssignmentsQ.data ?? [];

  const toggleFirm = (firmId: string) => {
    const next = assignedFirmIds.includes(firmId)
      ? assignedFirmIds.filter((id) => id !== firmId)
      : [...assignedFirmIds, firmId];
    firmMutation.mutate(next);
  };

  const toggleClient = (clientId: string) => {
    const next = assignedClientIds.includes(clientId)
      ? assignedClientIds.filter((id) => id !== clientId)
      : [...assignedClientIds, clientId];
    clientMutation.mutate(next);
  };

  return (
    <section className="rounded-xl border p-4 space-y-5">
      <ProfileSectionHeader icon={<Link2 className="h-3.5 w-3.5" />}>
        Firm & Client Assignments
      </ProfileSectionHeader>

      {/* Firms */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
            Firms
          </span>
          {firmMutation.isPending && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Assigned chips */}
        <div className="flex flex-wrap gap-1.5 min-h-[24px]">
          {firmAssignmentsQ.isLoading ? (
            <Skeleton className="h-5 w-24" />
          ) : assignedFirmIds.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">No firms assigned</span>
          ) : (
            assignedFirmIds.map((fid) => {
              const firm = firmsData.find((f) => f.id === fid);
              return (
                <span
                  key={fid}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px] font-medium"
                >
                  {firm?.name ?? fid.slice(0, 8)}
                  <button
                    type="button"
                    onClick={() => toggleFirm(fid)}
                    disabled={firmMutation.isPending}
                    className="hover:text-destructive transition-colors"
                    aria-label="Remove firm"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })
          )}
        </div>

        {/* Add firm dropdown */}
        <Select
          value=""
          onValueChange={(v) => {
            if (v) toggleFirm(v);
          }}
        >
          <SelectTrigger className="h-7 text-xs w-auto min-w-0">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Plus className="h-3 w-3" /> Add firm
            </span>
          </SelectTrigger>
          <SelectContent>
            {firmsData
              .filter((f) => !assignedFirmIds.includes(f.id))
              .map((f) => (
                <SelectItem key={f.id} value={f.id} className="text-xs">
                  {f.name}
                </SelectItem>
              ))}
            {firmsData.filter((f) => !assignedFirmIds.includes(f.id)).length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">All firms assigned</div>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* B2C Clients */}
      <div className="space-y-2 border-t pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
            B2C Clients
          </span>
          {clientMutation.isPending && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Assigned chips */}
        <div className="flex flex-wrap gap-1.5 min-h-[24px]">
          {clientAssignmentsQ.isLoading ? (
            <Skeleton className="h-5 w-24" />
          ) : assignedClientIds.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">No clients assigned</span>
          ) : (
            assignedClientIds.map((cid) => {
              const client = (clientsQ.data ?? []).find((c) => c.id === cid);
              return (
                <span
                  key={cid}
                  className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-300 px-2 py-0.5 text-[11px] font-medium"
                >
                  {client ? `${client.client_code} · ${client.display_name}` : cid.slice(0, 8)}
                  <button
                    type="button"
                    onClick={() => toggleClient(cid)}
                    disabled={clientMutation.isPending}
                    className="hover:text-destructive transition-colors"
                    aria-label="Remove client"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })
          )}
        </div>

        {/* Add client dropdown */}
        <Select
          value=""
          onValueChange={(v) => {
            if (v) toggleClient(v);
          }}
        >
          <SelectTrigger className="h-7 text-xs w-auto min-w-0">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Plus className="h-3 w-3" /> Add client
            </span>
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {clientsQ.isLoading ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</div>
            ) : (
              (clientsQ.data ?? [])
                .filter((c) => !assignedClientIds.includes(c.id))
                .map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    <span className="font-mono text-muted-foreground mr-1">{c.client_code}</span>
                    {c.display_name}
                  </SelectItem>
                ))
            )}
            {!clientsQ.isLoading &&
              (clientsQ.data ?? []).filter((c) => !assignedClientIds.includes(c.id)).length ===
                0 && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  All clients assigned
                </div>
              )}
          </SelectContent>
        </Select>
      </div>
    </section>
  );
}

// ── Hub permissions tab ───────────────────────────────────────────────

function HubPermissionsTab({
  employee,
  roles,
  onRolesChange,
}: {
  employee: EmployeeRow;
  roles: Set<string>;
  onRolesChange: () => void;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateEmployee);
  const [perms, setPerms] = useState<PermissionMap>({});

  const mutation = useMutation({
    mutationFn: async () =>
      updateFn({
        data: {
          userId: employee.id,
          patch: {},
          permissions: perms,
        },
      }),
    onSuccess: () => {
      toast.success("Hub permissions saved");
      qc.invalidateQueries({ queryKey: ["hr", "employees"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const addRole = useMutation({
    mutationFn: async (role: string) => {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: employee.id, role: role as never });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role assigned");
      onRolesChange();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to assign role"),
  });

  const removeRole = useMutation({
    mutationFn: async (role: string) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", employee.id)
        .eq("role", role as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role removed");
      onRolesChange();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove role"),
  });

  const AVAILABLE_ROLES = [
    { value: "employee", label: "Employee", desc: "Standard team member" },
    { value: "hr_manager", label: "HR Manager", desc: "Manage employees & payroll" },
    { value: "admin", label: "Admin", desc: "Full system access" },
    { value: "super_admin", label: "Super Admin", desc: "System administration" },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">System Roles</h3>
          <a
            href="/admin/access-control?tab=members"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-500 hover:underline"
          >
            Manage in Admin →
          </a>
        </div>
        <p className="text-xs text-muted-foreground">
          Roles grant capabilities like creating firms, managing projects, viewing reports, etc.
        </p>
        {roles.size === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-center">
            <p className="text-xs text-muted-foreground">No roles assigned yet</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {Array.from(roles).map((role) => (
              <Badge key={role} variant="secondary" className="gap-1 capitalize text-xs">
                {role.replace(/_/g, " ")}
                <button
                  type="button"
                  onClick={() => removeRole.mutate(role)}
                  disabled={removeRole.isPending}
                  className="hover:text-destructive ml-0.5"
                  aria-label={`Remove ${role} role`}
                >
                  ×
                </button>
              </Badge>
            ))}
          </div>
        )}
        <div>
          <Select
            value=""
            onValueChange={(role) => {
              if (!roles.has(role)) {
                addRole.mutate(role);
              }
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="+ Add role" />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_ROLES.filter((r) => !roles.has(r.value)).map((r) => (
                <SelectItem key={r.value} value={r.value} className="text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="capitalize font-medium">{r.label}</span>
                    <span className="text-[11px] text-muted-foreground">{r.desc}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border-t pt-4 space-y-2">
        <h3 className="text-sm font-semibold">Hub Module Visibility</h3>
        <p className="text-xs text-muted-foreground">
          Override which hub modules this employee can see. Leave as <em>Inherit</em> to use the
          global default from Admin → System Preferences.
        </p>
        <PermissionMatrixEditor userId={employee.id} value={perms} onChange={setPerms} />
        <div className="flex justify-end">
          <Button
            size="sm"
            className="h-7 text-xs"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Save hub permissions
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Compensation tab ──────────────────────────────────────────────────

function CompensationTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center space-y-2">
        <div className="flex justify-center">
          <div className="rounded-full bg-muted p-3">
            <Download className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        <p className="text-sm font-medium">Salary Slips</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          Generate and download monthly salary slips for this employee. Slips will reflect approved
          payroll entries.
        </p>
        <div className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <Lock className="h-2.5 w-2.5" />
          To be built
        </div>
      </div>

      <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-center space-y-2">
        <div className="flex justify-center">
          <div className="rounded-full bg-muted p-3">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        <p className="text-sm font-medium">Increment History</p>
        <p className="text-xs text-muted-foreground max-w-xs mx-auto">
          Track salary increments, effective dates, percentage changes, and manager notes for this
          employee.
        </p>
        <div className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <Lock className="h-2.5 w-2.5" />
          To be built
        </div>
      </div>
    </div>
  );
}

// ── Attendance tab ────────────────────────────────────────────────────

/** Convert a time/datetime string to HH:MM in IST (UTC+5:30). */
function toISTTime(raw: string | null): string {
  if (!raw) return "—";
  // Pure time like "09:30:00" — display as-is (already local or server-local)
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(raw)) return raw.slice(0, 5);
  // Full ISO / datetime — shift to IST
  try {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    const h = ist.getUTCHours().toString().padStart(2, "0");
    const m = ist.getUTCMinutes().toString().padStart(2, "0");
    return `${h}:${m}`;
  } catch {
    return raw;
  }
}

/** Strip "Imported status:" / "Important status:" prefix from notes. */
function cleanNote(note: string | null): string {
  if (!note) return "—";
  return note.replace(/^(imported|important)\s+status\s*:\s*/i, "").trim() || "—";
}

/** Calculate duration between two UTC timestamp strings, formatted as "Xh YYm". */
function calcHours(checkIn: string | null, checkOut: string | null): string {
  if (!checkIn || !checkOut) return "—";
  try {
    const diffMs = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    if (diffMs <= 0) return "—";
    const totalMins = Math.floor(diffMs / 60000);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  } catch {
    return "—";
  }
}

function AttendanceTab({ employeeId, employee }: { employeeId: string; employee: EmployeeRow }) {
  const [range, setRange] = useState<SimpleRange>(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - 30);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  });

  const q = useQuery({
    queryKey: ["hr", "dashboard", "attendance", employeeId, range.from, range.to],
    queryFn: async () => {
      let query = supabase
        .from("attendance_entries")
        .select("id, employee_id, entry_date, check_in, check_out, status, notes")
        .eq("employee_id", employeeId)
        .order("entry_date", { ascending: false });
      if (range.from) query = query.gte("entry_date", range.from);
      if (range.to) query = query.lte("entry_date", range.to);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AttendanceRow[];
    },
  });

  // Hide records on/after the effective date unless the employee actually clocked in
  const rows = (q.data ?? []).filter((r) => {
    const effectiveDate = employee.status_effective_date;
    const isOffboarded =
      (employee.status === "inactive" || employee.status === "left") && effectiveDate;
    if (!isOffboarded) return true;
    if (r.entry_date <= effectiveDate!) return true;
    return r.check_in !== null; // after effective date — only show if there's a real time entry
  });

  const c = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Single toolbar row: date picker + summary ── */}
      <div className="shrink-0 flex items-center gap-3 flex-wrap px-3 py-2 border-b bg-background">
        <DateRangePicker
          value={range}
          onChange={setRange}
          className="h-8"
          placeholder="Select date range"
        />
        {q.isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {rows.length > 0 && (
          <>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-emerald-600 font-medium">{c.present ?? 0} present</span>
            <span className="text-xs text-muted-foreground">{c.remote ?? 0} remote</span>
            <span
              className={cn(
                "text-xs",
                c.late ? "text-amber-600 font-medium" : "text-muted-foreground",
              )}
            >
              {c.late ?? 0} late
            </span>
            <span
              className={cn(
                "text-xs",
                c.absent ? "text-destructive font-medium" : "text-muted-foreground",
              )}
            >
              {c.absent ?? 0} absent
            </span>
            <span className="text-xs text-muted-foreground ml-auto">{rows.length} records</span>
          </>
        )}
      </div>

      {/* ── Scrollable table area ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {q.isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Clock className="h-7 w-7" />}
              title="No attendance records"
              description={
                range.from || range.to
                  ? "No records in this date range."
                  : "This employee has no attendance entries yet."
              }
            />
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-white dark:bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
              <tr>
                <th className="text-left font-semibold px-3 py-2.5 text-xs text-foreground/70 whitespace-nowrap">
                  Date
                </th>
                <th className="text-left font-semibold px-3 py-2.5 text-xs text-foreground/70 whitespace-nowrap">
                  Status
                </th>
                <th className="text-left font-semibold px-3 py-2.5 text-xs text-foreground/70 whitespace-nowrap">
                  In (IST)
                </th>
                <th className="text-left font-semibold px-3 py-2.5 text-xs text-foreground/70 whitespace-nowrap">
                  Out (IST)
                </th>
                <th className="text-left font-semibold px-3 py-2.5 text-xs text-foreground/70 whitespace-nowrap">
                  Hours
                </th>
                <th className="text-left font-semibold px-3 py-2.5 text-xs text-foreground/70">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-background divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 text-sm tabular-nums whitespace-nowrap font-medium">
                    {formatDate(r.entry_date)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs capitalize",
                        statusTone(r.status) === "ok" &&
                          "border-emerald-500/40 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
                        statusTone(r.status) === "warn" &&
                          "border-amber-500/40 text-amber-600 bg-amber-50 dark:bg-amber-950/30",
                        statusTone(r.status) === "err" &&
                          "border-destructive/40 text-destructive bg-destructive/5",
                      )}
                    >
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-sm tabular-nums font-mono">
                    {toISTTime(r.check_in)}
                  </td>
                  <td className="px-3 py-2 text-sm tabular-nums font-mono">
                    {toISTTime(r.check_out)}
                  </td>
                  <td className="px-3 py-2 text-sm tabular-nums font-mono text-sky-700 dark:text-sky-400">
                    {calcHours(r.check_in, r.check_out)}
                  </td>
                  <td className="px-3 py-2 text-sm text-muted-foreground max-w-[200px] truncate">
                    {cleanNote(r.notes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Documents tab ────────────────────────────────────────────────────

type EmployeeDocRow = {
  id: string;
  doc_type: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  uploaded_at: string;
};

function DocumentsTab({ employee }: { employee: EmployeeRow }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const fileRefs = {
    aadhar: useRef<HTMLInputElement>(null),
    pan: useRef<HTMLInputElement>(null),
  };

  const docsQ = useQuery({
    queryKey: ["hr", "employees", "documents", employee.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_documents" as never)
        .select("id, doc_type, file_name, file_url, file_size, uploaded_at")
        .eq("employee_id", employee.id);
      if (error) throw error;
      const rows = (data ?? []) as EmployeeDocRow[];
      return Object.fromEntries(rows.map((r) => [r.doc_type, r])) as Record<string, EmployeeDocRow>;
    },
  });

  const uploadDoc = async (docType: "aadhar" | "pan", file: File) => {
    if (!file.type.includes("pdf") && !file.type.startsWith("image/")) {
      toast.error("Only PDF or image files allowed");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File must be under 10 MB");
      return;
    }
    setUploading((u) => ({ ...u, [docType]: true }));
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${employee.id}/${docType}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("employee-docs")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("employee-docs").getPublicUrl(path);
      const { error: dbErr } = await supabase.from("employee_documents" as never).upsert(
        {
          employee_id: employee.id,
          doc_type: docType,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_size: file.size,
        } as never,
        { onConflict: "employee_id,doc_type" },
      );
      if (dbErr) throw dbErr;
      toast.success(`${docType === "aadhar" ? "Aadhaar" : "PAN"} uploaded`);
      qc.invalidateQueries({ queryKey: ["hr", "employees", "documents", employee.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading((u) => ({ ...u, [docType]: false }));
    }
  };

  const removeDoc = async (docType: string) => {
    const { error } = await supabase
      .from("employee_documents" as never)
      .delete()
      .eq("employee_id", employee.id)
      .eq("doc_type", docType);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Document removed");
    qc.invalidateQueries({ queryKey: ["hr", "employees", "documents", employee.id] });
  };

  const fmtSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const docs = docsQ.data ?? {};

  const DocCard = ({
    docType,
    label,
    numberField,
    numberLabel,
    numberPlaceholder,
    numberInitial,
    inputRef,
  }: {
    docType: "aadhar" | "pan";
    label: string;
    numberField: PatchField;
    numberLabel: string;
    numberPlaceholder: string;
    numberInitial: string | null | undefined;
    inputRef: React.RefObject<HTMLInputElement | null>;
  }) => {
    const doc = docs[docType];
    return (
      <section className="rounded-xl border p-4 space-y-4">
        <ProfileSectionHeader icon={<FileText className="h-3.5 w-3.5" />}>
          {label}
        </ProfileSectionHeader>

        {/* Number field */}
        <AutoSaveText
          userId={employee.id}
          field={numberField}
          initial={numberInitial}
          label={numberLabel}
          placeholder={numberPlaceholder}
        />

        {/* Uploaded file */}
        <div className="space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
            Document (PDF / Image)
          </span>
          {docsQ.isLoading ? (
            <Skeleton className="h-12 rounded-lg" />
          ) : doc ? (
            <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/20">
              <FileText className="h-8 w-8 shrink-0 text-indigo-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{doc.file_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {fmtSize(doc.file_size)} · Uploaded {formatDate(doc.uploaded_at)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                        <Eye className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">View</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <a href={doc.file_url} download={doc.file_name}>
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Download</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => removeDoc(docType)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Remove</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-center space-y-2">
              <p className="text-xs text-muted-foreground">No document uploaded yet</p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={uploading[docType]}
                onClick={() => inputRef.current?.click()}
              >
                {uploading[docType] ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Plus className="h-3.5 w-3.5 mr-1" />
                )}
                Upload
              </Button>
            </div>
          )}
          {doc && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs w-full"
              disabled={uploading[docType]}
              onClick={() => inputRef.current?.click()}
            >
              {uploading[docType] ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1" />
              )}
              Replace document
            </Button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadDoc(docType, f);
              e.target.value = "";
            }}
          />
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-4">
      {/* Birth Date */}
      <section className="rounded-xl border p-4">
        <ProfileSectionHeader icon={<CalendarDays className="h-3.5 w-3.5" />}>
          Personal Details
        </ProfileSectionHeader>
        <AutoSaveText
          userId={employee.id}
          field="birth_date"
          initial={employee.birth_date}
          label="Date of Birth"
          type="date"
        />
      </section>

      {/* Aadhaar */}
      <DocCard
        docType="aadhar"
        label="Aadhaar Card"
        numberField="aadhar_number"
        numberLabel="Aadhaar Number"
        numberPlaceholder="12-digit Aadhaar number"
        numberInitial={employee.aadhar_number}
        inputRef={fileRefs.aadhar}
      />

      {/* PAN */}
      <DocCard
        docType="pan"
        label="PAN Card"
        numberField="pan_number"
        numberLabel="PAN Number"
        numberPlaceholder="e.g. ABCDE1234F"
        numberInitial={employee.pan_number}
        inputRef={fileRefs.pan}
      />

      <p className="text-[10px] text-muted-foreground px-1">
        Changes to numbers save automatically on blur.
      </p>
    </div>
  );
}

// ── Leaves tab ────────────────────────────────────────────────────────

function LeavesTab({ employeeId }: { employeeId: string }) {
  const q = useQuery({
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

  if (q.isLoading) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    );
  }

  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Calendar className="h-7 w-7" />}
        title="No leave requests"
        description="This employee has no leave history yet."
      />
    );
  }

  const c = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const approvedDays = rows
    .filter((r) => r.status === "approved")
    .reduce((s, r) => s + (r.days ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground border rounded p-2 bg-muted/30">
        <span className="text-emerald-600 font-medium">
          <CheckCircle2 className="h-3 w-3 inline mr-0.5" />
          {c.approved ?? 0} approved
        </span>
        <span className={cn(c.pending && "text-amber-600 font-medium")}>
          {c.pending ?? 0} pending
        </span>
        <span className={cn(c.rejected && "text-destructive font-medium")}>
          <XCircle className="h-3 w-3 inline mr-0.5" />
          {c.rejected ?? 0} rejected
        </span>
        <span className="ml-auto">{approvedDays} days taken</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="h-7">
            <TableHead className="text-[11px] py-1">Type</TableHead>
            <TableHead className="text-[11px] py-1">Start</TableHead>
            <TableHead className="text-[11px] py-1">End</TableHead>
            <TableHead className="text-[11px] py-1 text-right">Days</TableHead>
            <TableHead className="text-[11px] py-1">Status</TableHead>
            <TableHead className="text-[11px] py-1">Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="h-7">
              <TableCell className="text-[11px] capitalize py-1">{r.type}</TableCell>
              <TableCell className="text-[11px] tabular-nums py-1">
                {formatDate(r.start_date)}
              </TableCell>
              <TableCell className="text-[11px] tabular-nums py-1">
                {formatDate(r.end_date)}
              </TableCell>
              <TableCell className="text-[11px] text-right tabular-nums py-1">{r.days}</TableCell>
              <TableCell className="py-1">
                <Badge
                  variant={leaveBadgeVariant(r.status)}
                  className="text-[10px] h-4 px-1 capitalize"
                >
                  {r.status}
                </Badge>
              </TableCell>
              <TableCell className="text-[11px] text-muted-foreground truncate max-w-[160px] py-1">
                {r.reason ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
