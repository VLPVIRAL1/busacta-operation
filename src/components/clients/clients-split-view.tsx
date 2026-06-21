import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Search, Building2, User, Users, UserCheck, UserX, X } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { ResizableTwoPane } from "@/components/shared/resizable-two-pane";
import {
  unifiedClientsListQuery,
  type UnifiedClient,
  type UnifiedStream,
} from "@/lib/queries/unified-clients.queries";
import { reorderClients } from "@/lib/clients/user-client-prefs.functions";
import { useDebouncedSearch } from "@/lib/url-state/use-debounced-search";
import { ClientRow } from "./client-row";
import { ClientDetailPane } from "./client-detail-pane";

const SELECTED_LS_KEY = "clientsHub.split.selected";

type StreamFilter = "all" | "cpa" | "direct";
type StatusFilter = "active" | "deactivated" | "all";

function parseSelection(
  value: string | null | undefined,
): { stream: UnifiedStream; id: string } | null {
  if (!value) return null;
  const [stream, id] = value.split(":");
  if ((stream === "cpa" || stream === "direct") && id) return { stream, id };
  return null;
}

export function ClientsSplitView({
  toolbarAction,
}: {
  /** @deprecated use URL `selected` param */
  initialSelected?: string;
  toolbarAction?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // URL-backed filter/search/selection
  const search = useSearch({ from: "/clients/" });
  const streamFilter: StreamFilter = search.stream;
  const statusTab: StatusFilter = search.status;
  const urlQ = search.q;
  const selectedFromUrl = search.selected;

  const setSearchParam = (
    patch: Partial<{
      stream: StreamFilter;
      status: StatusFilter;
      q: string;
      selected: string | undefined;
    }>,
  ) =>
    navigate({
      to: "/clients",
      search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }),
      replace: true,
    });

  const [localSearch, setLocalSearch] = useDebouncedSearch(urlQ, (v) => setSearchParam({ q: v }));

  const { data: clients = [], isLoading } = useQuery(unifiedClientsListQuery());
  const [localOrder, setLocalOrder] = useState<UnifiedClient[] | null>(null);

  // Reset local optimistic order whenever the server list changes
  useEffect(() => {
    setLocalOrder(null);
  }, [clients]);

  const baseList = localOrder ?? clients;

  const filtered = useMemo(
    () =>
      baseList.filter((c) => {
        if (streamFilter !== "all" && c.stream !== streamFilter) return false;
        const isOff =
          c.status === "deactivated" || c.status === "inactive" || c.status === "archived";
        if (statusTab === "active" && isOff) return false;
        if (statusTab === "deactivated" && !isOff) return false;
        if (localSearch) {
          const q = localSearch.toLowerCase();
          const hay = `${c.name} ${c.code ?? ""} ${c.contact ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [baseList, streamFilter, statusTab, localSearch],
  );

  // Selection: prefer URL, then localStorage, then auto-pick first.
  const selectedKey =
    selectedFromUrl ??
    (typeof window !== "undefined" ? window.localStorage.getItem(SELECTED_LS_KEY) : null);

  useEffect(() => {
    if (filtered.length === 0) return;
    const parsed = parseSelection(selectedKey);
    if (parsed && filtered.some((r) => r.id === parsed.id && r.stream === parsed.stream)) return;
    const first = filtered[0];
    setSearchParam({ selected: `${first.stream}:${first.id}` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, selectedKey]);

  useEffect(() => {
    try {
      if (selectedKey) localStorage.setItem(SELECTED_LS_KEY, selectedKey);
    } catch {
      /* ignore */
    }
  }, [selectedKey]);

  const handleSelect = (c: UnifiedClient) => {
    setSearchParam({ selected: `${c.stream}:${c.id}` });
  };

  const counts = useMemo(() => {
    const cpa = clients.filter((c) => c.stream === "cpa").length;
    const direct = clients.filter((c) => c.stream === "direct").length;
    return { cpa, direct, all: cpa + direct };
  }, [clients]);

  const selection = parseSelection(selectedKey);

  const reorderMut = useMutation({
    mutationFn: (items: Array<{ stream: UnifiedStream; clientId: string; sortIndex: number }>) =>
      reorderClients({ data: { items } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unified-clients", "list"] }),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const sourceList = baseList;
    const ids = sourceList.map((c) => `${c.stream}:${c.id}`);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(sourceList, from, to);
    setLocalOrder(next);
    const items = next.map((c, i) => ({
      stream: c.stream,
      clientId: c.id,
      sortIndex: (i + 1) * 10,
    }));
    reorderMut.mutate(items);
  };

  const left = (
    <div className="h-full min-h-0 flex flex-col border rounded-lg overflow-hidden bg-background">
      <div className="border-b bg-background/95 backdrop-blur px-3 py-2 space-y-2 shrink-0">
        <div className="flex items-center gap-1.5">
          {toolbarAction}
          <Tabs
            value={statusTab}
            onValueChange={(v) => setSearchParam({ status: v as StatusFilter })}
          >
            <TabsList className="h-8 grid grid-cols-3">
              <TabsTrigger
                value="active"
                className="h-6 px-2"
                title="Active clients"
                aria-label="Active clients"
              >
                <UserCheck className="h-3.5 w-3.5" />
              </TabsTrigger>
              <TabsTrigger
                value="deactivated"
                className="h-6 px-2"
                title="Deactivated clients"
                aria-label="Deactivated clients"
              >
                <UserX className="h-3.5 w-3.5" />
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className="h-6 px-2"
                title="All clients"
                aria-label="All clients"
              >
                <Users className="h-3.5 w-3.5" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="ml-auto">
            <SearchToggle value={localSearch} onChange={setLocalSearch} />
          </div>
        </div>

        <Tabs
          value={streamFilter}
          onValueChange={(v) => setSearchParam({ stream: v as StreamFilter })}
        >
          <TabsList className="h-7 w-full grid grid-cols-3">
            <TabsTrigger value="all" className="text-xs h-6 gap-1">
              <Users className="h-3 w-3" />
              All <span className="text-muted-foreground">({counts.all})</span>
            </TabsTrigger>
            <TabsTrigger value="cpa" className="text-xs h-6 gap-1">
              <Building2 className="h-3 w-3" />
              Firms <span className="text-muted-foreground">({counts.cpa})</span>
            </TabsTrigger>
            <TabsTrigger value="direct" className="text-xs h-6 gap-1">
              <User className="h-3 w-3" />
              Direct <span className="text-muted-foreground">({counts.direct})</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-1">
        {isLoading ? (
          <div className="p-6 text-xs text-muted-foreground text-center">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No clients"
              description="Adjust filters or use + New Client to add one."
            />
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={filtered.map((c) => `${c.stream}:${c.id}`)}
              strategy={verticalListSortingStrategy}
            >
              {filtered.map((c) => {
                const key = `${c.stream}:${c.id}`;
                return (
                  <ClientRow
                    key={key}
                    client={c}
                    active={selectedKey === key}
                    onSelect={() => handleSelect(c)}
                  />
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );

  const right = (
    <div className="h-full min-h-0 border rounded-lg overflow-hidden bg-background">
      {selection ? (
        <ClientDetailPane stream={selection.stream} id={selection.id} />
      ) : (
        <div className="h-full grid place-items-center p-6">
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="No client selected"
            description="Pick a client from the list to see details."
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      <ResizableTwoPane
        storageKey="clients-split"
        defaultLeft={28}
        minLeft={18}
        maxLeft={60}
        hideToolbar
        left={left}
        right={right}
      />
    </div>
  );
}

function SearchToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(Boolean(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        title="Search clients"
        aria-label="Search clients"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="relative flex-1 min-w-0">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!value) setOpen(false);
        }}
        placeholder="Search…"
        className="h-8 pl-8 pr-7 text-xs"
      />
      <button
        type="button"
        onClick={() => {
          onChange("");
          setOpen(false);
        }}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        aria-label="Close search"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
