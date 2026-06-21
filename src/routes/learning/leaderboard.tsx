import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, GraduationCap, Award } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { StatCard } from "@/components/shared/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth/auth-context";
import {
  useFirmId,
  leaderboardAssignmentsQuery,
  leaderboardPathsQuery,
  type LeaderboardAssignmentRow,
} from "@/lib/queries/learning.queries";

export const Route = createFileRoute("/learning/leaderboard")({
  component: () => (
    <AuthGuard allow={["admin", "super_admin", "hr_manager", "employee"]}>
      <AppShell
        crumbs={[{ label: "Learning & Training", to: "/learning" }, { label: "Leaderboard" }]}
      >
        <LeaderboardPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type StaffRow = {
  employeeId: string;
  fullName: string | null;
  avatarUrl: string | null;
  completed: number;
  total: number;
  cpe: number;
  lastActivity: string | null;
  pathsCompleted: number;
};

function buildLeaderboard(rows: LeaderboardAssignmentRow[]): StaffRow[] {
  const map = new Map<string, StaffRow>();
  for (const r of rows) {
    if (!r.employee_id) continue;
    if (!map.has(r.employee_id)) {
      map.set(r.employee_id, {
        employeeId: r.employee_id,
        fullName: r.profiles?.full_name ?? null,
        avatarUrl: null,
        completed: 0,
        total: 0,
        cpe: 0,
        lastActivity: null,
        pathsCompleted: 0,
      });
    }
    const entry = map.get(r.employee_id)!;
    entry.total += 1;
    if (r.status === "completed") {
      entry.completed += 1;
      entry.cpe += r.training_courses?.cpe_credits ?? 0;
      if (!entry.lastActivity || (r.completed_at && r.completed_at > entry.lastActivity)) {
        entry.lastActivity = r.completed_at;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.completed - a.completed || b.cpe - a.cpe);
}

function LeaderboardPage() {
  const firmId = useFirmId();
  const { user } = useAuth();

  const assignmentsQ = useQuery(leaderboardAssignmentsQuery(firmId));
  const pathsQ = useQuery(leaderboardPathsQuery(firmId));

  const leaderboard = useMemo(() => buildLeaderboard(assignmentsQ.data ?? []), [assignmentsQ.data]);

  // Add paths-completed per employee
  const pathCompletionMap = useMemo(() => {
    const m = new Map<string, number>();
    const pathAssignments = pathsQ.data ?? [];
    for (const pa of pathAssignments) {
      const pathItems = pa.training_paths?.training_path_items ?? [];
      if (pathItems.length === 0) continue;
      // We don't have individual completion data per-path here, so skip
    }
    return m;
  }, [pathsQ.data]);

  const totalAssigned = leaderboard.reduce((s, r) => s + r.total, 0);
  const totalCompleted = leaderboard.reduce((s, r) => s + r.completed, 0);
  const firmCompletionRate =
    totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;
  const avgCpe =
    leaderboard.length > 0
      ? Math.round(leaderboard.reduce((s, r) => s + r.cpe, 0) / leaderboard.length)
      : 0;

  const isLoading = assignmentsQ.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Leaderboard"
        description="Firm-wide training completion and CPE progress."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          label="Firm completion rate"
          value={`${firmCompletionRate}%`}
          icon={<Trophy className="h-4 w-4" />}
          loading={isLoading}
        />
        <StatCard
          label="Avg CPE per staff"
          value={avgCpe}
          icon={<Award className="h-4 w-4" />}
          loading={isLoading}
        />
        <StatCard
          label="Staff tracked"
          value={leaderboard.length}
          icon={<GraduationCap className="h-4 w-4" />}
          loading={isLoading}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : leaderboard.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-8 w-8" />}
          title="No training data yet"
          description="Completion data will appear here as staff complete their assigned courses."
        />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Rank</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead className="text-center w-28">Completed</TableHead>
                <TableHead className="text-center w-24">CPE</TableHead>
                <TableHead className="text-center w-24">Rate</TableHead>
                <TableHead className="w-32">Last Activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leaderboard.map((row, idx) => {
                const isMe = row.employeeId === user?.id;
                const rate = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0;
                return (
                  <TableRow key={row.employeeId} className={isMe ? "bg-primary/5 font-medium" : ""}>
                    <TableCell>
                      <span
                        className={`text-sm tabular-nums ${idx < 3 ? "font-bold" : "text-muted-foreground"}`}
                      >
                        {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar userId={row.employeeId} size="sm" />
                        <span className="text-sm">{row.fullName ?? "Staff"}</span>
                        {isMe && (
                          <Badge variant="secondary" className="text-[10px]">
                            You
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums">
                      {row.completed} / {row.total}
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums">
                      {row.cpe > 0 ? row.cpe : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`text-xs font-medium ${rate >= 80 ? "text-emerald-600 dark:text-emerald-400" : rate >= 50 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                      >
                        {rate}%
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.lastActivity ? new Date(row.lastActivity).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
