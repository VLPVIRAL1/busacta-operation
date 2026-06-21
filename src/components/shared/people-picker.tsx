import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/shared/utils";

interface PersonRow {
  id: string;
  full_name: string | null;
  email: string | null;
}

/** Multi-select picker for users in the profiles table. */
export function PeoplePicker({
  value,
  onChange,
  placeholder = "Pick people…",
  className,
  disabled,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [q, setQ] = useState("");
  const { data: people, isLoading } = useQuery({
    queryKey: ["people-picker"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("status", "active")
        .order("full_name", { ascending: true })
        .limit(500);
      return (data ?? []) as PersonRow[];
    },
    staleTime: 60_000,
  });

  const map = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (people ?? []).filter((p) =>
      term === ""
        ? true
        : (p.full_name ?? "").toLowerCase().includes(term) ||
          (p.email ?? "").toLowerCase().includes(term),
    );
  }, [q, people]);

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className={className}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-between font-normal min-h-9 h-auto py-1.5"
          >
            <span className="flex flex-wrap items-center gap-1">
              {value.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : (
                value.map((id) => {
                  const p = map.get(id);
                  return (
                    <Badge key={id} variant="secondary" className="gap-1 text-xs">
                      {p?.full_name || p?.email || "User"}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(id);
                        }}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </Badge>
                  );
                })
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-2" align="start">
          <Input
            placeholder="Search people…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 mb-2"
          />
          <ScrollArea className="max-h-64">
            {isLoading ? (
              <div className="space-y-1.5 p-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-full" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">No matches</div>
            ) : (
              filtered.map((p) => {
                const checked = value.includes(p.id);
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                      checked && "bg-accent/50",
                    )}
                  >
                    <span className="truncate text-left">
                      <span className="block">{p.full_name || "Unnamed"}</span>
                      {p.email && (
                        <span className="block text-[11px] text-muted-foreground">{p.email}</span>
                      )}
                    </span>
                    {checked && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
