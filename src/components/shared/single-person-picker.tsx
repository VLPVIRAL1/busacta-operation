import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/shared/user-avatar";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/shared/utils";

interface PersonRow {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  position: string | null;
  specialty: string | null;
}

const POSITION_LABEL: Record<string, string> = {
  partner: "Partner",
  manager: "Manager",
  senior: "Senior",
  staff: "Staff",
  reviewer: "Reviewer",
  preparer: "Preparer",
  client_contact: "Client contact",
  other: "Member",
};

/** Single-select user picker. Default scope = internal users (admin+employee). */
export function SinglePersonPicker({
  value,
  onChange,
  placeholder = "Unassigned",
  className,
  size = "sm",
  disabled,
  scope = "internal",
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  className?: string;
  size?: "sm" | "xs";
  disabled?: boolean;
  /** "internal" filters to admin+employee (good for assignee/reviewer); "all" shows everyone. */
  scope?: "internal" | "all";
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [includeAll, setIncludeAll] = useState(false);
  const effScope = includeAll ? "all" : scope;

  const { data: people } = useQuery({
    queryKey: ["people-picker", effScope],
    queryFn: async () => {
      if (effScope === "internal") {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url, position, specialty")
          .eq("provisioned_via" as never, "hr_hub" as never)
          .eq("status", "active")
          .order("full_name", { ascending: true });
        return (data ?? []) as PersonRow[];
      }
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, position, specialty")
        .eq("status", "active")
        .order("full_name", { ascending: true })
        .limit(500);
      return (data ?? []) as PersonRow[];
    },
    staleTime: 60_000,
  });
  const map = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (people ?? []).filter((p) =>
      t === ""
        ? true
        : (p.full_name ?? "").toLowerCase().includes(t) ||
          (p.email ?? "").toLowerCase().includes(t),
    );
  }, [q, people]);
  const current = value ? map.get(value) : null;
  const triggerCls = size === "xs" ? "h-7 text-xs" : "h-8 text-xs";
  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("w-full justify-between font-normal gap-1", triggerCls)}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              {current ? (
                <UserAvatar
                  profile={{
                    id: current.id,
                    full_name: current.full_name,
                    email: current.email,
                    avatar_url: current.avatar_url,
                  }}
                  size="xs"
                />
              ) : null}
              <span className="truncate">
                {current ? (
                  current.full_name || current.email
                ) : (
                  <span className="text-muted-foreground">{placeholder}</span>
                )}
              </span>
            </span>
            <span className="flex items-center gap-1 shrink-0">
              {value && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(null);
                  }}
                  className="hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </span>
              )}
              <ChevronsUpDown className="h-3 w-3 opacity-50" />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <Input
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 mb-2"
          />
          {scope === "internal" && (
            <label className="flex items-center gap-2 px-1 pb-2 text-[11px] text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={includeAll}
                onChange={(e) => setIncludeAll(e.target.checked)}
              />
              Include clients & external users
            </label>
          )}
          <ScrollArea className="max-h-56">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">No matches</div>
            ) : (
              filtered.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left",
                    value === p.id && "bg-accent/60",
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
                  <span className="truncate">
                    <span className="block">{p.full_name || "Unnamed"}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {POSITION_LABEL[p.position ?? "other"] ?? "Member"}
                      {p.specialty ? ` · ${p.specialty}` : p.email ? ` · ${p.email}` : ""}
                    </span>
                  </span>
                </button>
              ))
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
