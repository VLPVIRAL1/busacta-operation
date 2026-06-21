import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, CalendarClock, FolderKanban, Layers, Users, GitBranch } from "lucide-react";
import { FacetedMultiChip, FacetedSingleChip } from "@/components/shared/faceted-multi-chip";
import {
  filterFirmsQuery,
  filterProjectsQuery,
  filterPeopleQuery,
  filterDirectClientsQuery,
} from "@/lib/queries/ops.queries";
import { STAGE_HEAD_OPTIONS, PRIORITY_OPTIONS, COMPLEXITY_OPTIONS } from "@/lib/ops/filter-options";

export type TodosDuePreset = "any" | "overdue" | "today" | "this_week" | "no_date";

export interface TodosExtraFilters {
  stageHeads: string[];
  priorities: string[];
  complexities: string[];
  /** @deprecated kept for backwards-compat with saved Quick Views; not applied. */
  statuses: string[];
  firmIds: string[];
  projectIds: string[];
  assigneeIds: string[];
  due: TodosDuePreset;
  /** Business stream filter — empty = both CPA + B2C Client tasks. */
  streams: ("cpa" | "direct")[];
}

export const EMPTY_TODOS_EXTRA: TodosExtraFilters = {
  stageHeads: [],
  priorities: [],
  complexities: [],
  statuses: [],
  firmIds: [],
  projectIds: [],
  assigneeIds: [],
  due: "any",
  streams: [],
};

export function todosExtraActiveCount(f: TodosExtraFilters) {
  return (
    f.stageHeads.length +
    f.priorities.length +
    f.complexities.length +
    f.firmIds.length +
    f.projectIds.length +
    f.assigneeIds.length +
    (f.streams?.length ?? 0) +
    (f.due !== "any" ? 1 : 0)
  );
}

export interface TodosFacetCounts {
  stageHeads?: Map<string, number>;
  priorities?: Map<string, number>;
  complexities?: Map<string, number>;
  firmIds?: Map<string, number>;
  projectIds?: Map<string, number>;
  assigneeIds?: Map<string, number>;
  due?: Map<string, number>;
  streams?: Map<string, number>;
}

const STREAMS = [
  { value: "cpa", label: "B2B Firm" },
  { value: "direct", label: "B2C Client" },
];

export function TodosFilterBar({
  value,
  onChange,
  counts,
}: {
  value: TodosExtraFilters;
  onChange: (next: TodosExtraFilters) => void;
  counts?: TodosFacetCounts;
}) {
  const upd = (patch: Partial<TodosExtraFilters>) => onChange({ ...value, ...patch });

  const { data: firms = [] } = useQuery(filterFirmsQuery());
  const { data: directClients = [] } = useQuery(filterDirectClientsQuery());
  // Pass only actual firm IDs (not direct-client IDs) to the projects sub-filter.
  const firmIdSet = useMemo(() => new Set(firms.map((f) => f.id)), [firms]);
  const selectedFirmIdsOnly = useMemo(
    () => value.firmIds.filter((id) => firmIdSet.has(id)),
    [value.firmIds, firmIdSet],
  );
  const { data: projects = [] } = useQuery(filterProjectsQuery(selectedFirmIdsOnly));
  const { data: people = [] } = useQuery(filterPeopleQuery());

  const firmAndClientOpts = useMemo(
    () => [
      ...firms.map((f) => ({ value: f.id, label: f.name })),
      ...directClients.map((c) => ({ value: c.id, label: `${c.display_name} (B2C)` })),
    ],
    [firms, directClients],
  );
  const projOpts = useMemo(() => projects.map((p) => ({ value: p.id, label: p.name })), [projects]);
  const peopleOpts = useMemo(
    () =>
      people.map((p) => ({
        value: p.id,
        label: p.full_name || p.email || "—",
        avatarUrl: p.avatar_url,
      })),
    [people],
  );

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <FacetedMultiChip
        icon={<GitBranch className="h-3 w-3" />}
        label="Stream"
        options={STREAMS}
        selected={value.streams ?? []}
        counts={counts?.streams}
        onChange={(v) => upd({ streams: v as ("cpa" | "direct")[] })}
      />
      <FacetedMultiChip
        icon={<Layers className="h-3 w-3" />}
        label="Stage"
        options={STAGE_HEAD_OPTIONS}
        selected={value.stageHeads}
        counts={counts?.stageHeads}
        onChange={(v) => upd({ stageHeads: v })}
      />
      <FacetedMultiChip
        icon={<Layers className="h-3 w-3" />}
        label="Priority"
        options={PRIORITY_OPTIONS}
        selected={value.priorities}
        counts={counts?.priorities}
        onChange={(v) => upd({ priorities: v })}
      />
      <FacetedMultiChip
        icon={<Layers className="h-3 w-3" />}
        label="Complexity"
        options={COMPLEXITY_OPTIONS}
        selected={value.complexities}
        counts={counts?.complexities}
        onChange={(v) => upd({ complexities: v })}
      />
      <FacetedMultiChip
        icon={<Building2 className="h-3 w-3" />}
        label="Firm / Client"
        options={firmAndClientOpts}
        selected={value.firmIds}
        counts={counts?.firmIds}
        onChange={(v) => upd({ firmIds: v, projectIds: [] })}
      />
      <FacetedMultiChip
        icon={<FolderKanban className="h-3 w-3" />}
        label="Project"
        options={projOpts}
        selected={value.projectIds}
        counts={counts?.projectIds}
        onChange={(v) => upd({ projectIds: v })}
      />
      <FacetedMultiChip
        icon={<Users className="h-3 w-3" />}
        label="Assignee"
        options={peopleOpts}
        selected={value.assigneeIds}
        counts={counts?.assigneeIds}
        onChange={(v) => upd({ assigneeIds: v })}
        showAvatars
      />
      <FacetedSingleChip
        icon={<CalendarClock className="h-3 w-3" />}
        label="Due"
        emptyValue="any"
        value={value.due}
        onChange={(v) => upd({ due: v as TodosDuePreset })}
        counts={counts?.due}
        options={[
          { value: "any", label: "Any" },
          { value: "overdue", label: "Overdue" },
          { value: "today", label: "Today" },
          { value: "this_week", label: "This week" },
          { value: "no_date", label: "No date" },
        ]}
      />
    </div>
  );
}
