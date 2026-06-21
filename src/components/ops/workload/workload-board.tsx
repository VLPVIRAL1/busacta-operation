import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/shell/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { workloadQuery, type WorkloadData, type WorkloadTask } from "@/lib/queries/ops.queries";
import { updateWeeklyCapacity } from "@/lib/ops/workload.functions";
import { WorkloadFilters, type WorkloadSortKey } from "./workload-filters";
import { WorkloadMemberCard, type MemberStats } from "./workload-member-card";

const DUE_SOON_MS = 7 * 24 * 60 * 60 * 1000;

function deriveStats(data: WorkloadData): MemberStats[] {
  const now = Date.now();
  const dueSoonThreshold = now + DUE_SOON_MS;

  // Sum hours logged this week per user
  const weekMinutes = new Map<string, number>();
  for (const l of data.weekLogs) {
    weekMinutes.set(l.user_id, (weekMinutes.get(l.user_id) ?? 0) + (l.duration_minutes ?? 0));
  }

  // Group tasks by assigned user (task_assignees role=assignee, fallback to assignee_id)
  const tasksByUser = new Map<string, WorkloadTask[]>();
  for (const task of data.tasks) {
    const assignees = (task.task_assignees ?? [])
      .filter((a) => a.role === "assignee")
      .map((a) => a.user_id);
    const users = assignees.length > 0 ? assignees : task.assignee_id ? [task.assignee_id] : [];
    for (const uid of users) {
      const bucket = tasksByUser.get(uid) ?? [];
      bucket.push(task);
      tasksByUser.set(uid, bucket);
    }
  }

  return data.profiles.map((profile) => {
    const tasks = tasksByUser.get(profile.id) ?? [];
    const openCount = tasks.filter(
      (t) => t.status !== "ready_for_review" && t.status !== "complete",
    ).length;
    const inReviewCount = tasks.filter((t) => t.status === "ready_for_review").length;
    const dueSoonCount = tasks.filter((t) => {
      if (!t.due_date) return false;
      const due = new Date(t.due_date).getTime();
      return due >= now && due <= dueSoonThreshold;
    }).length;
    const weekHours = (weekMinutes.get(profile.id) ?? 0) / 60;
    const capacityHours = profile.weekly_capacity_hours;
    const utilizationPct = capacityHours > 0 ? (weekHours / capacityHours) * 100 : 0;

    return {
      profile,
      openCount,
      inReviewCount,
      dueSoonCount,
      weekHours,
      capacityHours,
      utilizationPct,
      tasks,
    };
  });
}

export function WorkloadBoard() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(workloadQuery());

  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [sort, setSort] = useState<WorkloadSortKey>("utilization");

  const { mutate: saveCapacity, isPending } = useMutation({
    mutationFn: (input: { userId: string; weeklyCapacityHours: number }) =>
      updateWeeklyCapacity({ data: input }),
    onMutate: async ({ userId, weeklyCapacityHours }) => {
      await qc.cancelQueries({ queryKey: ["workload"] });
      const prev = qc.getQueryData<WorkloadData>(["workload"]);
      qc.setQueryData<WorkloadData>(["workload"], (cur) =>
        cur
          ? {
              ...cur,
              profiles: cur.profiles.map((p) =>
                p.id === userId ? { ...p, weekly_capacity_hours: weeklyCapacityHours } : p,
              ),
            }
          : cur,
      );
      return { prev };
    },
    onError: (err: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["workload"], ctx.prev);
      toast.error(`Failed to update capacity: ${err.message}`);
    },
    onSuccess: () => {
      toast.success("Capacity updated");
      qc.invalidateQueries({ queryKey: ["workload"] });
    },
  });

  const allStats = useMemo(() => (data ? deriveStats(data) : []), [data]);

  const departments = useMemo(
    () =>
      [...new Set(allStats.map((s) => s.profile.department).filter(Boolean) as string[])].sort(),
    [allStats],
  );

  const filtered = useMemo(() => {
    let list = allStats;
    if (selectedDept) list = list.filter((s) => s.profile.department === selectedDept);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.profile.full_name?.toLowerCase().includes(q) ||
          s.profile.email?.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (sort === "utilization") return b.utilizationPct - a.utilizationPct;
      if (sort === "open_tasks") return b.openCount - a.openCount;
      return (a.profile.full_name ?? "").localeCompare(b.profile.full_name ?? "");
    });
  }, [allStats, selectedDept, search, sort]);

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Workload" description="Team capacity and task load at a glance." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-lg" />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Workload" description="Team capacity and task load at a glance." />

      <WorkloadFilters
        departments={departments}
        selectedDept={selectedDept}
        onDeptChange={setSelectedDept}
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        className="mb-4"
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
          <Users className="h-8 w-8 opacity-40" />
          <p className="text-sm">No team members match your filters.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((stats) => (
            <WorkloadMemberCard
              key={stats.profile.id}
              stats={stats}
              onCapacityChange={(userId, hours) =>
                saveCapacity({ userId, weeklyCapacityHours: hours })
              }
              isPending={isPending}
            />
          ))}
        </div>
      )}
    </>
  );
}
