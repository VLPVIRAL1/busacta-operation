import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter as FilterIcon, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/shared/user-avatar";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/shared/utils";

export type PeopleFilterValue = {
  ids: string[];
  me: boolean;
  none: boolean; // unassigned / no reviewer
};

export const emptyPeopleFilter = (): PeopleFilterValue => ({ ids: [], me: false, none: false });

export function isPeopleFilterActive(v: PeopleFilterValue | undefined): boolean {
  if (!v) return false;
  return v.ids.length > 0 || v.me || v.none;
}

interface Props {
  label: string; // "Assignees" or "Reviewers"
  value: PeopleFilterValue;
  onChange: (v: PeopleFilterValue) => void;
  meLabel: string; // "Assigned to me" | "Reviewed by me"
  noneLabel: string; // "Unassigned" | "No reviewer"
}

export function PeopleFilterPopover({ label, value, onChange, meLabel, noneLabel }: Props) {
  const [q, setQ] = useState("");
  const { data: people = [] } = useQuery({
    queryKey: ["people-picker", "internal"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .eq("provisioned_via" as never, "hr_hub" as never)
        .eq("status", "active")
        .order("full_name", { ascending: true });
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return people;
    return people.filter(
      (p) =>
        (p.full_name ?? "").toLowerCase().includes(t) || (p.email ?? "").toLowerCase().includes(t),
    );
  }, [people, q]);

  const active = isPeopleFilterActive(value);

  function toggleId(id: string) {
    onChange({
      ...value,
      ids: value.ids.includes(id) ? value.ids.filter((x) => x !== id) : [...value.ids, id],
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "rounded p-0.5",
            active ? "text-primary" : "text-muted-foreground opacity-60 hover:opacity-100",
          )}
          title={`Filter ${label.toLowerCase()}`}
        >
          <FilterIcon className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 space-y-2" align="end">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1">
          {label}
        </div>
        <div className="flex flex-wrap gap-1">
          <ShortcutChip active={value.me} onClick={() => onChange({ ...value, me: !value.me })}>
            {meLabel}
          </ShortcutChip>
          <ShortcutChip
            active={value.none}
            onClick={() => onChange({ ...value, none: !value.none })}
          >
            {noneLabel}
          </ShortcutChip>
        </div>
        <Input
          placeholder="Search people…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-8 text-xs"
        />
        <ScrollArea className="max-h-56">
          {filtered.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">No matches</div>
          ) : (
            filtered.map((p) => {
              const selected = value.ids.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleId(p.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent text-left",
                    selected && "bg-accent/60",
                  )}
                >
                  <UserAvatar
                    profile={{
                      id: p.id,
                      full_name: p.full_name,
                      email: p.email,
                      avatar_url: p.avatar_url,
                    }}
                    size="sm"
                  />
                  <span className="truncate flex-1">
                    <span className="block">{p.full_name || "Unnamed"}</span>
                    {p.email && (
                      <span className="block text-[10px] text-muted-foreground">{p.email}</span>
                    )}
                  </span>
                  {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              );
            })
          )}
        </ScrollArea>
        {active && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-full text-xs"
            onClick={() => onChange(emptyPeopleFilter())}
          >
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ShortcutChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-0.5 rounded-full border text-[11px]",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground hover:bg-accent/40",
      )}
    >
      {children}
    </button>
  );
}

export function PeopleFilterChips({
  label,
  value,
  onChange,
  meLabel,
  noneLabel,
  nameById,
}: {
  label: string;
  value: PeopleFilterValue;
  onChange: (v: PeopleFilterValue) => void;
  meLabel: string;
  noneLabel: string;
  nameById: Map<string, string>;
}) {
  if (!isPeopleFilterActive(value)) return null;
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[10px] uppercase text-muted-foreground">{label}:</span>
      {value.me && <ChipX label={meLabel} onRemove={() => onChange({ ...value, me: false })} />}
      {value.none && (
        <ChipX label={noneLabel} onRemove={() => onChange({ ...value, none: false })} />
      )}
      {value.ids.map((id) => (
        <ChipX
          key={id}
          label={nameById.get(id) ?? id.slice(0, 6)}
          onRemove={() => onChange({ ...value, ids: value.ids.filter((x) => x !== id) })}
        />
      ))}
    </div>
  );
}

function ChipX({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Badge variant="secondary" className="gap-1 text-[10px]">
      {label}
      <button type="button" onClick={onRemove} className="hover:text-destructive">
        <X className="h-2.5 w-2.5" />
      </button>
    </Badge>
  );
}
