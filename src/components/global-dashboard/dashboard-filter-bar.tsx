import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, User, Layers, Building2 } from "lucide-react";
import { FacetedMultiChip } from "@/components/shared/faceted-multi-chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  dashboardStaffProfilesQuery,
  UNASSIGNED_SENTINEL,
  type DashboardPeriod,
  type DashboardScope,
} from "@/lib/queries/global-dashboard.queries";

const PERIOD_OPTIONS: { value: string; label: string }[] = [
  { value: "5", label: "Last 5 Days" },
  { value: "10", label: "Last 10 Days" },
  { value: "15", label: "Last 15 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "60", label: "Last 60 Days" },
  { value: "all", label: "All" },
];

const SCOPE_OPTIONS: { value: DashboardScope; label: string }[] = [
  { value: "assignee", label: "Assignee" },
  { value: "reviewer", label: "Reviewer" },
  { value: "watcher", label: "Watcher" },
];

export interface DashboardFilterBarProps {
  period: DashboardPeriod;
  onPeriodChange: (p: DashboardPeriod) => void;
  scope: DashboardScope[];
  onScopeChange: (s: DashboardScope[]) => void;
  users: string[];
  onUsersChange: (u: string[]) => void;
  currentUserId: string;
  /** Client filter options derived from the loaded task set (firm entities + B2C clients). */
  clientOptions: { value: string; label: string }[];
  clients: string[];
  onClientsChange: (c: string[]) => void;
}

export function DashboardFilterBar({
  period,
  onPeriodChange,
  scope,
  onScopeChange,
  users,
  onUsersChange,
  currentUserId,
  clientOptions,
  clients,
  onClientsChange,
}: DashboardFilterBarProps) {
  const { data: profiles = [] } = useQuery(dashboardStaffProfilesQuery());
  const userOptions = useMemo(() => {
    const staffOptions = profiles
      .map((p) => ({
        value: p.id,
        label:
          p.id === currentUserId
            ? `${p.full_name ?? p.email ?? "Me"} (Me)`
            : (p.full_name ?? p.email ?? p.id.slice(0, 6)),
        avatarUrl: p.avatar_url,
      }))
      .sort((a, b) =>
        a.value === currentUserId
          ? -1
          : b.value === currentUserId
            ? 1
            : a.label.localeCompare(b.label),
      );
    return [{ value: UNASSIGNED_SENTINEL, label: "Unassigned" }, ...staffOptions];
  }, [profiles, currentUserId]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        value={String(period)}
        onValueChange={(v) => onPeriodChange(v === "all" ? "all" : (Number(v) as DashboardPeriod))}
      >
        <SelectTrigger className="h-7 w-[150px] gap-1.5 px-2 text-[11px]">
          <CalendarRange className="h-3 w-3" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <FacetedMultiChip
        icon={<Layers className="h-3 w-3" />}
        label="Role"
        options={SCOPE_OPTIONS}
        selected={scope}
        onChange={(v) => onScopeChange(v as DashboardScope[])}
      />

      <FacetedMultiChip
        icon={<User className="h-3 w-3" />}
        label={
          users.length === 0
            ? "Me"
            : users.length === 1 && users[0] === UNASSIGNED_SENTINEL
              ? "Unassigned"
              : "Users"
        }
        options={userOptions}
        selected={users}
        onChange={onUsersChange}
        showAvatars
        enableSelectAll
      />

      <FacetedMultiChip
        icon={<Building2 className="h-3 w-3" />}
        label="Firm / B2C Client"
        options={clientOptions}
        selected={clients}
        onChange={onClientsChange}
        enableSelectAll
      />
    </div>
  );
}
