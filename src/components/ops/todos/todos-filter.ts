import type { TodoRow } from "@/lib/queries/ops.queries";
import { istDayStart, istDayEnd, istWeekEnd } from "@/lib/ops/date-buckets";
import { EMPTY_TODOS_EXTRA, type TodosExtraFilters } from "./todos-filter-bar";

export type TodosScope = "mine" | "all" | "unassigned";

export interface TodosFilterInput {
  scope: TodosScope;
  myDayOnly: boolean;
  myDaySet: Set<string>;
  search: string;
  extra?: TodosExtraFilters;
  userId?: string | null;
}

/**
 * Single source of truth for filtering To-Do rows by the shared filter bar
 * (scope + My Day + search + faceted Stream/Stage/Priority/Complexity/Firm/
 * Project/Assignee/Due). Used by BOTH the Table grid and the Split list so the
 * one common filter bar produces identical results in either view.
 */
export function filterTodoRows(rows: TodoRow[], opts: TodosFilterInput): TodoRow[] {
  const { scope, myDayOnly, myDaySet, search, userId } = opts;
  const ex = opts.extra ?? EMPTY_TODOS_EXTRA;
  const q = search.trim().toLowerCase();
  const startToday = istDayStart();
  const endToday = istDayEnd();
  const endWeek = istWeekEnd();

  return rows.filter((r) => {
    if (scope === "mine" && userId) {
      const me =
        r.assignee_id === userId || (r.task_assignees ?? []).some((p) => p.user_id === userId);
      if (!me) return false;
    } else if (scope === "unassigned") {
      if (r.assignee_id || (r.task_assignees ?? []).some((p) => p.role === "assignee"))
        return false;
    }
    if (myDayOnly && !myDaySet.has(r.id)) return false;
    if (q) {
      const firm =
        r.stream === "direct"
          ? (r.direct_clients?.display_name ?? "")
          : (r.client_entities?.projects?.firms?.name ?? "");
      const project = r.client_entities?.projects?.name ?? "";
      const client = r.client_entities?.name ?? "";
      const hay = `${r.title} ${r.display_id ?? ""} ${firm} ${project} ${client}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (ex.streams?.length && !ex.streams.includes(r.stream as "cpa" | "direct")) return false;
    if (ex.stageHeads.length) {
      const head = r.project_pipeline_stages?.primary_state;
      if (!head || !ex.stageHeads.includes(head)) return false;
    }
    if (ex.priorities.length && !ex.priorities.includes(r.priority)) return false;
    if (ex.complexities.length && !ex.complexities.includes(r.complexity)) return false;
    if (ex.firmIds.length) {
      const fid = r.client_entities?.projects?.firm_id;
      if (!fid || !ex.firmIds.includes(fid)) return false;
    }
    if (ex.projectIds.length) {
      const pid = r.project_id;
      if (!pid || !ex.projectIds.includes(pid)) return false;
    }
    if (ex.assigneeIds.length) {
      const set = new Set(ex.assigneeIds);
      const matches =
        (r.assignee_id && set.has(r.assignee_id)) ||
        (r.task_assignees ?? []).some((p) => set.has(p.user_id));
      if (!matches) return false;
    }
    if (ex.due !== "any") {
      const dueStr = r.due_date;
      if (ex.due === "no_date") {
        if (dueStr != null) return false;
      } else {
        if (dueStr == null) return false;
        const t = new Date(dueStr).getTime();
        if (ex.due === "overdue" && !(t < startToday && r.status !== "done")) return false;
        if (ex.due === "today" && !(t >= startToday && t < endToday)) return false;
        if (ex.due === "this_week" && !(t >= startToday && t < endWeek)) return false;
      }
    }
    return true;
  });
}
