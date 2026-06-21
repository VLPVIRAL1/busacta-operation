import { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Globe,
  User,
  Keyboard,
  Star,
  X,
  Filter,
  Inbox,
  Building2,
  Layers,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/shared/utils";
import {
  useInboxData,
  useInboxAggregates,
  useRestoreAllArchives,
} from "@/lib/ops/communication.queries";
import { formatDistanceToNowStrict } from "date-fns";
import {
  useInboxFilters,
  STAGE_HEADS,
  stageHeadOf,
  type PeopleFilter,
} from "./inbox-filter-context";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { InboxZeroWidget } from "./inbox-zero-widget";
import { SavedViewsMenu } from "./saved-views-menu";
import { FacetedMultiChip } from "@/components/shared/faceted-multi-chip";

/** Encode/decode a PeopleFilter as a single string so it fits FacetedMultiChip. */
const peopleKey = (p: PeopleFilter) => `${p.kind}:${p.id}`;
const peopleDecode = (k: string): PeopleFilter | null => {
  const [kind, id] = k.split(":", 2);
  if ((kind === "assignee" || kind === "reviewer") && id) return { kind, id };
  return null;
};

export function InboxToolbar() {
  const {
    firmIds,
    setFirmIds,
    stages,
    setStages,
    people,
    setPeople,
    view,
    setView,
    scope,
    setScope,
    isDirty,
    clearAll,
  } = useInboxFilters();
  const { rows, profilesById } = useInboxData(scope);
  const restoreAll = useRestoreAllArchives();
  const [helpOpen, setHelpOpen] = useState(false);

  // ── Facet options + counts ──────────────────────────────────────
  const firmOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.firmId && r.firmName) map.set(r.firmId, r.firmName);
    return Array.from(map, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  }, [rows]);
  const firmCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.firmId) m.set(r.firmId, (m.get(r.firmId) ?? 0) + 1);
    return m;
  }, [rows]);

  const stageOptions = useMemo(
    () => STAGE_HEADS.map((s) => ({ value: s.key, label: s.label })),
    [],
  );
  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = stageHeadOf((r as { pipelineStage?: string | null }).pipelineStage);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const peopleOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const seen = new Set<string>();
    const push = (kind: "assignee" | "reviewer", id: string, prefix: string) => {
      const k = `${kind}:${id}`;
      if (seen.has(k)) return;
      seen.add(k);
      const name = profilesById[id]?.full_name || profilesById[id]?.email || id.slice(0, 8);
      out.push({ value: k, label: `${prefix} ${name}` });
    };
    for (const r of rows) {
      if (r.assigneeId) push("assignee", r.assigneeId, "A:");
      if (r.reviewerId) push("reviewer", r.reviewerId, "R:");
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, profilesById]);
  const peopleCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.assigneeId) {
        const k = `assignee:${r.assigneeId}`;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      if (r.reviewerId) {
        const k = `reviewer:${r.reviewerId}`;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    return m;
  }, [rows]);

  const peopleSelected = people.map(peopleKey);
  const onPeopleChange = (next: string[]) => {
    // Reconcile the encoded list back into PeopleFilter shape, preserving order.
    const decoded = next.map(peopleDecode).filter((v): v is PeopleFilter => !!v);
    setPeople(decoded);
  };

  const archivedCount = useMemo(() => rows.filter((r) => r.archived).length, [rows]);
  const agg = useInboxAggregates(rows);
  const lastActivityLabel = agg.lastActivityAt
    ? `${formatDistanceToNowStrict(new Date(agg.lastActivityAt))} ago`
    : "No activity";

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Active / Archived — icon-only segmented */}
        <div
          className="flex gap-0.5 rounded-md bg-muted p-0.5 shrink-0"
          role="group"
          aria-label="Inbox view"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setView("active")}
                aria-label="Active"
                aria-pressed={view === "active"}
                className={cn(
                  "h-6 w-7 grid place-items-center rounded transition-colors",
                  view === "active" ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
              >
                <Inbox className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Active</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setView("archived")}
                aria-label="Archived"
                aria-pressed={view === "archived"}
                className={cn(
                  "h-6 px-1.5 grid place-items-center rounded transition-colors flex items-center gap-1",
                  view === "archived" ? "bg-background shadow-sm" : "text-muted-foreground",
                )}
              >
                <Archive className="h-3.5 w-3.5" />
                {archivedCount > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                    {archivedCount}
                  </Badge>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Archived</TooltipContent>
          </Tooltip>
        </div>

        <FacetedMultiChip
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Firms"
          options={firmOptions}
          selected={firmIds}
          onChange={setFirmIds}
          counts={firmCounts}
        />
        <FacetedMultiChip
          icon={<Layers className="h-3.5 w-3.5" />}
          label="Stages"
          options={stageOptions}
          selected={stages}
          onChange={setStages}
          counts={stageCounts}
        />
        <FacetedMultiChip
          icon={<Users className="h-3.5 w-3.5" />}
          label="People"
          options={peopleOptions}
          selected={peopleSelected}
          onChange={onPeopleChange}
          counts={peopleCounts}
        />

        {isDirty && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearAll}
                className="h-7 px-2 text-[11px] gap-1 text-destructive hover:bg-destructive/10 shrink-0"
              >
                <X className="h-3 w-3" /> Clear
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Clear all filters</TooltipContent>
          </Tooltip>
        )}
        {!isDirty && (
          <span className="hidden xl:inline-flex items-center gap-1 text-[10px] text-muted-foreground px-1 shrink-0">
            <Filter className="h-3 w-3" /> No filters
          </span>
        )}

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => window.dispatchEvent(new CustomEvent("comm:open-starred"))}
                aria-label="Starred messages"
              >
                <Star className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Starred messages</TooltipContent>
          </Tooltip>
          <SavedViewsMenu />
          <InboxZeroWidget rows={rows} />
          {agg.totalUnread > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="default" className="h-5 px-1.5 text-[10px] tabular-nums">
                  {agg.totalUnread} unread
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {`Direct: ${agg.dmUnread} · Group: ${agg.groupUnread} · Tasks: ${agg.taskUnread}`}
              </TooltipContent>
            </Tooltip>
          )}
          <span className="text-[10px] text-muted-foreground tabular-nums hidden md:inline">
            {lastActivityLabel}
          </span>
          {view === "archived" && archivedCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  disabled={restoreAll.isPending}
                  onClick={() => restoreAll.mutate()}
                  aria-label="Restore all archived chats"
                >
                  <ArchiveRestore className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Restore all archived chats</TooltipContent>
            </Tooltip>
          )}

          {/* Scope toggle (My chats / All chats) — icon-only */}
          <div
            className="flex gap-0.5 rounded-md bg-muted p-0.5"
            role="group"
            aria-label="Inbox scope"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setScope("mine")}
                  aria-label="My chats"
                  aria-pressed={scope === "mine"}
                  className={cn(
                    "h-6 w-7 grid place-items-center rounded transition-colors",
                    scope === "mine" ? "bg-background shadow-sm" : "text-muted-foreground",
                  )}
                >
                  <User className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                My chats — tasks where you are assignee, reviewer, creator, or watcher.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  aria-label="All chats"
                  aria-pressed={scope === "all"}
                  className={cn(
                    "h-6 w-7 grid place-items-center rounded transition-colors",
                    scope === "all" ? "bg-background shadow-sm" : "text-muted-foreground",
                  )}
                >
                  <Globe className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                All chats you have access to (subject to permissions).
              </TooltipContent>
            </Tooltip>
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setHelpOpen(true)}
                aria-label="Keyboard shortcuts"
              >
                <Keyboard className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Keyboard shortcuts (press ?)</TooltipContent>
          </Tooltip>
        </div>

        <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      </div>
    </TooltipProvider>
  );
}
