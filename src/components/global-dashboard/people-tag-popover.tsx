import { useEffect, useState } from "react";
import { Check, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
// eslint-disable-next-line no-restricted-imports
import { supabase } from "@/integrations/supabase/client";
import {
  searchProfilesForMention,
  type MentionProfile,
} from "@/lib/queries/global-dashboard.queries";
import { cn } from "@/lib/shared/utils";

/**
 * Inline people picker used by both the reminders panel and calendar
 * composer. Shows a popover that searches profiles for an `@` mention and
 * returns the selected user-ids back to the host.
 */
export function PeopleTagPopover({
  value,
  onChange,
  variant,
  align = "start",
  hint,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  variant: "button" | "icon";
  align?: "start" | "center" | "end";
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MentionProfile[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let active = true;
    const t = setTimeout(async () => {
      const rows = await searchProfilesForMention(q);
      if (active) setResults(rows);
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q, open]);

  useEffect(() => {
    const missing = value.filter((id) => !names[id]);
    if (!missing.length) return;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", missing);
      setNames((prev) => {
        const next = { ...prev };
        for (const p of data ?? [])
          next[p.id as string] = (p.full_name as string) ?? (p.email as string) ?? "Unknown";
        return next;
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const toggle = (p: MentionProfile) => {
    setNames((prev) => ({ ...prev, [p.id]: p.full_name ?? p.email ?? "Unknown" }));
    onChange(value.includes(p.id) ? value.filter((v) => v !== p.id) : [...value, p.id]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === "button" ? (
          <Button variant="outline" size="sm" className="h-7 gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            {value.length ? `${value.length} tagged` : "Tag"}
          </Button>
        ) : (
          <button
            type="button"
            title="Share"
            className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <UserPlus className="h-3.5 w-3.5" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align={align}>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">
          Share with people{hint ? ` — ${hint}` : ""}
        </p>
        {value.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {value.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary"
              >
                {names[id] ?? "…"}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== id))}
                  aria-label="Remove"
                  className="hover:text-rose-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people…"
          className="h-8"
        />
        <ScrollArea className="mt-2 h-40">
          <ul className="space-y-0.5">
            {results.length === 0 ? (
              <li className="px-2 py-2 text-xs text-muted-foreground">Type to search</li>
            ) : (
              results.map((p) => {
                const sel = value.includes(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => toggle(p)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5",
                          sel ? "text-primary opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{p.full_name ?? p.email ?? "Unknown"}</p>
                        {p.email && (
                          <p className="truncate text-[11px] text-muted-foreground">{p.email}</p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
