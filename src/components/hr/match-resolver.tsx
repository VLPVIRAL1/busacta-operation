import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown, UserCheck, UserX, Save } from "lucide-react";
import { toast } from "sonner";
import { type EmployeeProfile, type MatchConfidence } from "@/lib/hr/match-employees";
import { upsertEmployeeAlias } from "@/lib/hr/match-employees";

export type UnresolvedGroup = {
  key: string; // aliasKey
  employee_code: string;
  employee_name: string;
  rowCount: number;
  confidence: MatchConfidence;
  candidates?: Array<{ id: string; full_name: string; distance: number }>;
};

export function MatchResolver({
  groups,
  profiles,
  overrides,
  onChange,
}: {
  groups: UnresolvedGroup[];
  profiles: EmployeeProfile[];
  overrides: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const [remember, setRemember] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return groups;
    return groups.filter(
      (g) => g.employee_name.toLowerCase().includes(q) || g.employee_code.toLowerCase().includes(q),
    );
  }, [groups, search]);

  if (groups.length === 0) return null;

  const unresolvedCount = groups.filter(
    (g) => !overrides[g.key] && g.confidence === "unmatched",
  ).length;
  const fuzzyCount = groups.filter((g) => g.confidence === "fuzzy_name").length;

  return (
    <Card className="border-amber-500/40">
      <CardContent className="p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <UserX className="h-4 w-4 text-amber-600" />
          <span className="font-medium">Resolve employee matches</span>
          {unresolvedCount > 0 && (
            <Badge
              variant="outline"
              className="border-amber-400 text-amber-700 dark:text-amber-300"
            >
              {unresolvedCount} unmatched
            </Badge>
          )}
          {fuzzyCount > 0 && (
            <Badge variant="outline" className="border-blue-400 text-blue-700 dark:text-blue-300">
              {fuzzyCount} low confidence
            </Badge>
          )}
          <div className="ml-auto w-full sm:w-64">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Pick a real employee for any unmatched or low-confidence row below. Tick "Remember" to
          auto-resolve next time.
        </div>

        <div className="max-h-80 overflow-auto rounded-md border border-border-subtle">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr className="text-left">
                <th className="p-2">From file</th>
                <th className="p-2">Rows</th>
                <th className="p-2">Confidence</th>
                <th className="p-2">Match to employee</th>
                <th className="p-2 w-24">Remember</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => {
                const chosen = overrides[g.key];
                return (
                  <tr key={g.key} className="border-t border-border-subtle align-top">
                    <td className="p-2">
                      <div className="font-medium">{g.employee_name || "—"}</div>
                      {g.employee_code && (
                        <div className="text-[11px] text-muted-foreground">{g.employee_code}</div>
                      )}
                    </td>
                    <td className="p-2 tabular-nums">{g.rowCount}</td>
                    <td className="p-2">
                      <ConfidenceBadge confidence={g.confidence} />
                    </td>
                    <td className="p-2 min-w-[240px]">
                      <EmployeeCombobox
                        profiles={profiles}
                        value={chosen ?? null}
                        suggestions={g.candidates?.map((c) => c.id) ?? []}
                        onPick={(id) => {
                          const next = { ...overrides };
                          if (id) next[g.key] = id;
                          else delete next[g.key];
                          onChange(next);
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <Checkbox
                          id={`remember-${g.key}`}
                          checked={!!remember[g.key]}
                          disabled={!chosen}
                          onCheckedChange={(v) =>
                            setRemember((prev) => ({ ...prev, [g.key]: !!v }))
                          }
                        />
                        {remember[g.key] && chosen && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2"
                            onClick={async () => {
                              try {
                                await upsertEmployeeAlias({
                                  raw_code: g.employee_code,
                                  raw_name: g.employee_name,
                                  employee_id: chosen,
                                });
                                toast.success("Alias saved");
                              } catch (e) {
                                toast.error((e as Error).message);
                              }
                            }}
                          >
                            <Save className="h-3 w-3" /> Save
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfidenceBadge({ confidence }: { confidence: MatchConfidence }) {
  if (confidence === "unmatched") {
    return (
      <Badge variant="outline" className="border-destructive/50 text-destructive">
        <UserX className="h-3 w-3" /> unmatched
      </Badge>
    );
  }
  if (confidence === "fuzzy_name") {
    return (
      <Badge variant="outline" className="border-blue-400 text-blue-700 dark:text-blue-300">
        fuzzy
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-green-500/40 text-green-700 dark:text-green-300">
      <UserCheck className="h-3 w-3" /> {confidence.replace("_", " ")}
    </Badge>
  );
}

function EmployeeCombobox({
  profiles,
  value,
  suggestions,
  onPick,
}: {
  profiles: EmployeeProfile[];
  value: string | null;
  suggestions: string[];
  onPick: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => profiles.find((p) => p.id === value) ?? null, [profiles, value]);
  const ordered = useMemo(() => {
    if (suggestions.length === 0) return profiles;
    const ids = new Set(suggestions);
    const top = profiles.filter((p) => ids.has(p.id));
    const rest = profiles.filter((p) => !ids.has(p.id));
    return [...top, ...rest];
  }, [profiles, suggestions]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full justify-between text-xs font-normal"
        >
          <span className="truncate">
            {selected ? selected.full_name || selected.email || "Selected" : "Select employee…"}
          </span>
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-72" align="start">
        <Command>
          <CommandInput placeholder="Search employees…" className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            {value && (
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    onPick(null);
                    setOpen(false);
                  }}
                  className="text-destructive"
                >
                  Clear selection
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading={suggestions.length ? "Suggested" : "Employees"}>
              {ordered.slice(0, 200).map((p) => {
                const isSuggested = suggestions.includes(p.id);
                return (
                  <CommandItem
                    key={p.id}
                    value={`${p.full_name ?? ""} ${p.email ?? ""}`}
                    onSelect={() => {
                      onPick(p.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={`h-3 w-3 mr-1 ${value === p.id ? "opacity-100" : "opacity-0"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-xs">{p.full_name || "—"}</div>
                      {p.email && (
                        <div className="text-[10px] text-muted-foreground truncate">{p.email}</div>
                      )}
                    </div>
                    {isSuggested && (
                      <Badge variant="outline" className="text-[9px] ml-auto">
                        suggested
                      </Badge>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
