import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, X, Check } from "lucide-react";
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
}

/**
 * Multi-select user picker. Default scope = internal users (admin+employee).
 * Selected ids render as chips with an inline remove button.
 */
export function MultiPersonPicker({
  values,
  onChange,
  placeholder = "Select people…",
  className,
  disabled,
  scope = "internal",
}: {
  values: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  scope?: "internal" | "all";
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data: people } = useQuery({
    queryKey: ["people-picker", scope],
    queryFn: async () => {
      if (scope === "internal") {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .eq("provisioned_via" as never, "hr_hub" as never)
          .eq("status", "active")
          .order("full_name", { ascending: true });
        return (data ?? []) as PersonRow[];
      }
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
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

  function toggle(id: string) {
    if (values.includes(id)) onChange(values.filter((v) => v !== id));
    else onChange([...values, id]);
  }
  function remove(id: string) {
    onChange(values.filter((v) => v !== id));
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-between font-normal h-8 text-xs"
          >
            <span className="truncate text-muted-foreground">
              {values.length === 0 ? placeholder : `${values.length} selected`}
            </span>
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <Input
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 mb-2"
          />
          <ScrollArea className="max-h-56">
            {filtered.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">No matches</div>
            ) : (
              filtered.map((p) => {
                const selected = values.includes(p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-left",
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
                        <span className="block text-[11px] text-muted-foreground">{p.email}</span>
                      )}
                    </span>
                    {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((id) => {
            const p = map.get(id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-accent/60 px-2 py-0.5 text-[11px]"
              >
                {p ? (
                  <UserAvatar
                    profile={{
                      id: p.id,
                      full_name: p.full_name,
                      email: p.email,
                      avatar_url: p.avatar_url,
                    }}
                    size="xs"
                  />
                ) : null}
                <span className="truncate max-w-[140px]">{p?.full_name || p?.email || "…"}</span>
                <button
                  type="button"
                  onClick={() => remove(id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
