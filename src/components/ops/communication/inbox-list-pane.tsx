import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  AtSign,
  Bell,
  BellOff,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  MailMinus,
  MailPlus,
  MessagesSquare,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  Square,
  Users,
  ListChecks,
  User as UserIcon,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CursorContextMenu, type CursorMenuItem } from "@/components/ui/cursor-context-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/shared/utils";
import { fmtIST, formatInboxTimestamp } from "@/lib/format/time";
import {
  useInboxData,
  useMarkUnread,
  useSetNotificationPref,
  useSnoozeThread,
  useToggleArchive,
  type InboxKind,
  type InboxRow,
  type SnoozePreset,
} from "@/lib/ops/communication.queries";
import { stageHeadOf, useInboxFilters } from "./inbox-filter-context";
import { useInboxSelection } from "./inbox-selection-context";
import { BulkActionsBar } from "./bulk-actions-bar";
import { RowActionsMenu } from "./row-actions-menu";
import { ShortcutsDialog } from "./shortcuts-dialog";

const PIN_LS_KEY = "comm-inbox:pins";
const NEW_CAP = 10;
const VIRTUALIZE_THRESHOLD = 50;
const ROW_HEIGHT = 60;

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function loadPins(): Set<string> {
  return new Set(loadJSON<string[]>(PIN_LS_KEY, []));
}
function savePins(pins: Set<string>) {
  saveJSON(PIN_LS_KEY, Array.from(pins));
}

export interface InboxSelection {
  kind: InboxKind;
  id: string;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
}

export function InboxListPane({
  selected,
  onSelect,
  onNewConversation,
  onRefresh,
  refreshing,
}: {
  selected: InboxSelection | null;
  onSelect: (sel: InboxSelection) => void;
  onNewConversation: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const {
    search,
    setSearch,
    types,
    setTypes,
    firmIds,
    stages,
    people,
    view,
    setView,
    scope,
    setScope,
  } = useInboxFilters();
  const { rows, loading } = useInboxData(scope);
  const archive = useToggleArchive();
  const selection = useInboxSelection();
  const [pins, setPins] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : loadPins(),
  );
  const [showAllNew, setShowAllNew] = useState(false);
  const [activeOpen, setActiveOpen] = useState(true);
  const [newOpen, setNewOpen] = useState(true);
  const [focusIndex, setFocusIndex] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Tracks "g" prefix for two-key sequences (g+m, g+a).
  const gKeyAt = useRef<number>(0);

  const togglePin = (key: string) => {
    setPins((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      savePins(next);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (view === "active" && r.archived) return false;
      if (view === "archived" && !r.archived) return false;
      if (!types.includes(r.kind)) return false;
      if (firmIds.length > 0) {
        if (r.kind !== "task") return false;
        if (!r.firmId || !firmIds.includes(r.firmId)) return false;
      }
      if (stages.length > 0) {
        if (r.kind !== "task") return false;
        const head = stageHeadOf(r.pipelineStage);
        if (!head || !stages.includes(head)) return false;
      }
      if (people.length > 0) {
        if (r.kind !== "task") return false;
        const matchesPeople = people.some((p) =>
          p.kind === "assignee" ? r.assigneeId === p.id : r.reviewerId === p.id,
        );
        if (!matchesPeople) return false;
      }
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.subtitle.toLowerCase().includes(q) ||
        (r.lastMessagePreview ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, types, firmIds, stages, people, view]);

  const active = useMemo(() => {
    const list =
      view === "archived"
        ? filtered.slice().sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""))
        : filtered.filter((r) => r.lastMessageAt != null);
    if (view !== "archived") {
      list.sort((a, b) => {
        const ap = pins.has(a.key) ? 1 : 0;
        const bp = pins.has(b.key) ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");
      });
    }
    return list;
  }, [filtered, pins, view]);

  const newList = useMemo(() => {
    if (view === "archived") return [] as InboxRow[];
    const list = filtered.filter((r) => r.lastMessageAt == null);
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list;
  }, [filtered, view]);

  const newVisible = showAllNew ? newList : newList.slice(0, NEW_CAP);

  // Flat list used for j/k navigation + Enter open. Cap at 500 rows so
  // shortcut nav stays cheap even with 200k+ messages → 1k+ task threads.
  const NAV_CAP = 500;
  const flatNav = useMemo<InboxRow[]>(
    () => [...active.slice(0, NAV_CAP), ...newVisible],
    [active, newVisible],
  );

  useEffect(() => {
    if (focusIndex >= flatNav.length) setFocusIndex(Math.max(0, flatNav.length - 1));
  }, [flatNav.length, focusIndex]);

  // Type-toggle click handler with Ctrl/Cmd + Shift semantics.
  const handleTypeClick = (e: React.MouseEvent, kind: InboxKind) => {
    e.preventDefault();
    if (e.shiftKey) {
      setTypes(["dm", "group", "task"]);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const next = types.includes(kind) ? types.filter((t) => t !== kind) : [...types, kind];
      setTypes(next.length ? next : [kind]);
      return;
    }
    setTypes([kind]);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) {
        // Allow Escape to blur for convenience
        if (e.key === "Escape" && document.activeElement === searchRef.current) {
          searchRef.current?.blur();
        }
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const now = Date.now();
      const inGSeq = now - gKeyAt.current < 1000;

      if (inGSeq) {
        if (e.key === "m") {
          e.preventDefault();
          setScope("mine");
          gKeyAt.current = 0;
          return;
        }
        if (e.key === "a") {
          e.preventDefault();
          setScope("all");
          gKeyAt.current = 0;
          return;
        }
        gKeyAt.current = 0;
      }

      switch (e.key) {
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "?":
          e.preventDefault();
          setHelpOpen(true);
          break;
        case "n":
          e.preventDefault();
          onNewConversation();
          break;
        case "r":
          e.preventDefault();
          onRefresh?.();
          break;
        case "a":
          e.preventDefault();
          setView("active");
          break;
        case "e":
          e.preventDefault();
          setView("archived");
          break;
        case "0":
          e.preventDefault();
          setTypes(["dm", "group", "task"]);
          break;
        case "4":
          e.preventDefault();
          setTypes(["dm"]);
          break;
        case "5":
          e.preventDefault();
          setTypes(["group"]);
          break;
        case "6":
          e.preventDefault();
          setTypes(["task"]);
          break;
        case "2":
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("wi-pane:nudge", {
              detail: { storageKey: "comm-unified-inbox", delta: -4 },
            }),
          );
          break;
        case "8":
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("wi-pane:nudge", {
              detail: { storageKey: "comm-unified-inbox", delta: 4 },
            }),
          );
          break;
        case "1": {
          e.preventDefault();
          const len = flatNav.length;
          if (len === 0) break;
          const next = (focusIndex + 1) % len;
          setFocusIndex(next);
          const row = flatNav[next];
          if (row) onSelect({ kind: row.kind, id: row.id });
          break;
        }
        case "7": {
          e.preventDefault();
          const len = flatNav.length;
          if (len === 0) break;
          const prev = (focusIndex - 1 + len) % len;
          setFocusIndex(prev);
          const row = flatNav[prev];
          if (row) onSelect({ kind: row.kind, id: row.id });
          break;
        }
        case "Enter": {
          const row = flatNav[focusIndex];
          if (row) {
            e.preventDefault();
            onSelect({ kind: row.kind, id: row.id });
          }
          break;
        }
        case "g":
          gKeyAt.current = now;
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flatNav, focusIndex, onNewConversation, onRefresh, setScope, setTypes, setView, onSelect]);

  // Virtualizer: active list only (most common large list)
  const useVirtual = active.length > VIRTUALIZE_THRESHOLD;
  const virtualizer = useVirtualizer({
    count: active.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    enabled: useVirtual,
  });

  const renderItem = (r: InboxRow, idx: number) => (
    <InboxItem
      key={r.key}
      row={r}
      pinned={pins.has(r.key)}
      focused={idx === focusIndex}
      onTogglePin={() => togglePin(r.key)}
      onToggleArchive={() => archive.mutate({ kind: r.kind, targetId: r.id })}
      selected={selected != null && selected.kind === r.kind && selected.id === r.id}
      selectionEnabled={selection.enabled}
      checked={selection.isSelected({ kind: r.kind, id: r.id })}
      onToggleCheck={() => selection.toggle({ kind: r.kind, id: r.id })}
      onClick={() => {
        if (selection.enabled) {
          selection.toggle({ kind: r.kind, id: r.id });
          return;
        }
        setFocusIndex(idx);
        onSelect({ kind: r.kind, id: r.id });
      }}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <MessagesSquare className="h-4 w-4 text-primary" />
            Inbox
            <span className="text-[10px] font-normal text-muted-foreground">
              ({scope === "mine" ? "my chats" : "all chats"})
            </span>
          </h2>
          <div className="flex items-center gap-1">
            {onRefresh && (
              <Button
                size="icon"
                variant="ghost"
                onClick={onRefresh}
                disabled={refreshing}
                className="h-7 w-7"
                title="Refresh communication (r)"
                aria-label="Refresh"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              </Button>
            )}
            <Button
              size="icon"
              variant={selection.enabled ? "secondary" : "ghost"}
              onClick={() => selection.setEnabled(!selection.enabled)}
              className="h-7 w-7"
              title={selection.enabled ? "Exit select mode" : "Select multiple"}
              aria-label="Select multiple"
            >
              <CheckSquare className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onNewConversation}
              className="h-7 text-xs"
              title="New chat (n)"
            >
              New chat
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats…  (press / to focus)"
            className="h-9 pl-8"
          />
        </div>
        <div className="flex items-center gap-1">
          <div className="flex-1 grid grid-cols-3 gap-0.5 rounded-md bg-muted p-0.5">
            <TypeButton
              kind="dm"
              label="Direct"
              icon={<UserIcon className="h-3.5 w-3.5" />}
              active={types.includes("dm")}
              onClick={handleTypeClick}
            />
            <TypeButton
              kind="group"
              label="Group"
              icon={<Users className="h-3.5 w-3.5" />}
              active={types.includes("group")}
              onClick={handleTypeClick}
            />
            <TypeButton
              kind="task"
              label="Tasks"
              icon={<ListChecks className="h-3.5 w-3.5" />}
              active={types.includes("task")}
              onClick={handleTypeClick}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[10px] px-2"
            onClick={() => setTypes(["dm", "group", "task"])}
            title="Show all types (0 or Shift+Click)"
          >
            All
          </Button>
        </div>
      </div>

      <BulkActionsBar />

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
        {loading ? (
          <div className="space-y-2 px-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-2">
            <EmptyState
              icon={<MessagesSquare className="h-6 w-6" />}
              title="Nothing matches"
              description="Try a different search or toggle a type."
            />
          </div>
        ) : (
          <>
            <SectionHeader
              open={activeOpen}
              onOpenChange={setActiveOpen}
              label={view === "archived" ? "Archived" : "Active conversations"}
              count={active.length}
            />
            {activeOpen &&
              (active.length === 0 ? (
                <EmptyHint text="No active chats." />
              ) : useVirtual ? (
                <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                  {virtualizer.getVirtualItems().map((vi) => {
                    const r = active[vi.index];
                    return (
                      <div
                        key={vi.key}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          transform: `translateY(${vi.start}px)`,
                        }}
                      >
                        {renderItem(r, vi.index)}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <ul className="space-y-0.5">{active.map((r, idx) => renderItem(r, idx))}</ul>
              ))}

            <SectionHeader
              open={newOpen}
              onOpenChange={setNewOpen}
              label="New / Uninitiated"
              count={newList.length}
            />
            {newOpen &&
              (newList.length === 0 ? (
                <EmptyHint text="No empty chats." />
              ) : (
                <>
                  <ul className="space-y-0.5">
                    {newVisible.map((r, idx) => renderItem(r, active.length + idx))}
                  </ul>
                  {newList.length > NEW_CAP && (
                    <button
                      type="button"
                      onClick={() => setShowAllNew((v) => !v)}
                      className="mx-2 mt-1 text-xs text-primary hover:underline"
                    >
                      {showAllNew ? "Show fewer" : `See all ${newList.length} uninitiated`}
                    </button>
                  )}
                </>
              ))}
          </>
        )}
      </div>

      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

function TypeButton({
  kind,
  label,
  icon,
  active,
  onClick,
}: {
  kind: InboxKind;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: (e: React.MouseEvent, kind: InboxKind) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => onClick(e, kind)}
      className={cn(
        "flex items-center justify-center gap-1 rounded px-2 py-1 text-xs transition-colors",
        active
          ? "bg-background shadow-sm font-medium"
          : "text-muted-foreground hover:text-foreground",
      )}
      title={`${label} — click to select only, Ctrl/⌘+Click to toggle, Shift+Click for all`}
    >
      {icon} {label}
    </button>
  );
}

function SectionHeader({
  open,
  onOpenChange,
  label,
  count,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  label: string;
  count: number;
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span>{label}</span>
          <Badge variant="secondary" className="ml-auto h-4 px-1.5 text-[10px]">
            {count}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent />
    </Collapsible>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <div className="px-3 py-2 text-xs text-muted-foreground">{text}</div>;
}

function InboxItem({
  row,
  pinned,
  focused,
  onTogglePin,
  onToggleArchive,
  selected,
  selectionEnabled,
  checked,
  onToggleCheck,
  onClick,
}: {
  row: InboxRow;
  pinned: boolean;
  focused: boolean;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  selected: boolean;
  selectionEnabled: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  onClick: () => void;
}) {
  const markUnread = useMarkUnread();
  const snooze = useSnoozeThread();
  const setPref = useSetNotificationPref();

  const initials = row.title.slice(0, 2).toUpperCase();
  const unreadLabel = row.unread > 99 ? "99+" : String(row.unread);
  const hasUnread = row.unread > 0 && row.notificationLevel !== "muted";

  const buildMenuItems = (): CursorMenuItem[] => {
    const snoozed = !!row.snoozedUntil;
    const items: CursorMenuItem[] = [
      {
        label: pinned ? "Unpin" : "Pin to top",
        icon: pinned ? <PinOff /> : <Pin />,
        onSelect: onTogglePin,
      },
      {
        label: hasUnread ? "Mark as read" : "Mark as unread",
        icon: hasUnread ? <MailMinus /> : <MailPlus />,
        onSelect: () => markUnread.mutate({ kind: row.kind, targetId: row.id, unread: !hasUnread }),
      },
    ];
    if (snoozed) {
      items.push({
        label: "Unsnooze",
        icon: <Clock />,
        onSelect: () => snooze.mutate({ kind: row.kind, targetId: row.id, until: null }),
        separatorBefore: true,
      });
    } else {
      const presets: Array<{ id: SnoozePreset; label: string }> = [
        { id: "1h", label: "Snooze 1 hour" },
        { id: "3h", label: "Snooze 3 hours" },
        { id: "tomorrow", label: "Snooze until tomorrow 9 AM" },
        { id: "next_week", label: "Snooze until next Monday" },
      ];
      presets.forEach((p, i) =>
        items.push({
          label: p.label,
          icon: <Clock />,
          onSelect: () => snooze.mutate({ kind: row.kind, targetId: row.id, preset: p.id }),
          separatorBefore: i === 0,
        }),
      );
    }
    items.push(
      {
        label: "All notifications",
        icon: <Bell />,
        onSelect: () => setPref.mutate({ kind: row.kind, targetId: row.id, level: "all" }),
        separatorBefore: true,
        disabled: row.notificationLevel === "all",
      },
      {
        label: "Mentions only",
        icon: <AtSign />,
        onSelect: () => setPref.mutate({ kind: row.kind, targetId: row.id, level: "mentions" }),
        disabled: row.notificationLevel === "mentions",
      },
      {
        label: "Mute",
        icon: <BellOff />,
        onSelect: () => setPref.mutate({ kind: row.kind, targetId: row.id, level: "muted" }),
        disabled: row.notificationLevel === "muted",
      },
      {
        label: row.archived ? "Restore" : "Archive",
        icon: row.archived ? <ArchiveRestore /> : <Archive />,
        onSelect: onToggleArchive,
        separatorBefore: true,
        destructive: !row.archived,
      },
    );
    return items;
  };

  return (
    <CursorContextMenu items={buildMenuItems}>
      {({ onContextMenu }) => (
        <div
          className={cn(
            "group relative flex items-start gap-3 rounded-lg px-3 py-2 cursor-pointer transition-colors",
            "hover:bg-muted/60",
            selected && "bg-muted",
            focused && !selected && "bg-muted/40",
            checked && "bg-primary/10",
          )}
          onClick={onClick}
          onContextMenu={onContextMenu}
        >
          {selectionEnabled && (
            <button
              type="button"
              aria-label={checked ? "Deselect" : "Select"}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCheck();
              }}
              className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border bg-background hover:bg-muted"
            >
              {checked ? (
                <CheckSquare className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Square className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          )}
          <Avatar className="h-10 w-10 shrink-0">
            {row.avatarUrl ? <AvatarImage src={row.avatarUrl} alt="" /> : null}
            <AvatarFallback
              className={cn(
                "text-[11px]",
                row.kind === "task" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                row.kind === "group" && "bg-primary/15 text-primary",
                row.kind === "dm" && "bg-secondary text-secondary-foreground",
              )}
            >
              {row.kind === "group" ? (
                <Users className="h-4 w-4" />
              ) : row.kind === "task" ? (
                <ListChecks className="h-4 w-4" />
              ) : (
                initials
              )}
            </AvatarFallback>
          </Avatar>

          {/* Middle: title + snippet */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={cn(
                  "text-sm truncate",
                  hasUnread ? "font-bold text-foreground" : "font-medium text-foreground/90",
                  row.snoozedUntil && "text-muted-foreground",
                )}
                title={row.title}
              >
                {row.title}
              </span>
              {pinned && <Pin className="h-3 w-3 text-amber-500 shrink-0" />}
              {row.notificationLevel === "muted" && (
                <BellOff className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              {row.snoozedUntil && <Clock className="h-3 w-3 text-sky-500 shrink-0" />}
            </div>
            <p
              className={cn(
                "text-xs truncate mt-0.5",
                hasUnread ? "text-foreground/80" : "text-muted-foreground",
              )}
            >
              {row.snoozedUntil
                ? `Snoozed until ${fmtIST(row.snoozedUntil)}`
                : (row.lastMessagePreview ?? row.subtitle)}
            </p>
          </div>

          {/* Right rail: timestamp top, unread counter or 3-dot menu bottom */}
          <div className="flex w-14 shrink-0 flex-col items-end justify-between self-stretch py-0.5">
            <span className="text-[11px] text-muted-foreground/80 tabular-nums whitespace-nowrap">
              {row.lastMessageAt ? formatInboxTimestamp(row.lastMessageAt) : ""}
            </span>
            <div className="flex h-5 items-center justify-end">
              {/* Default: unread counter or archived badge */}
              <div className="group-hover:hidden">
                {hasUnread ? (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                    {unreadLabel}
                  </span>
                ) : row.archived && row.archivedAuto ? (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                    Auto
                  </Badge>
                ) : row.archived ? (
                  <Archive className="h-3 w-3 text-muted-foreground" />
                ) : null}
              </div>
              {/* Hover: 3-dot actions menu (Pin / Archive live here) */}
              <div
                className="hidden group-hover:flex focus-within:flex"
                onClick={(e) => e.stopPropagation()}
              >
                <RowActionsMenu row={row} />
              </div>
            </div>
          </div>
        </div>
      )}
    </CursorContextMenu>
  );
}
