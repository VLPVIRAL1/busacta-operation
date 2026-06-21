import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TOGGLEABLE_MODULES, MODULE_LABEL, type ModuleKey } from "@/lib/routing/use-nav";
import { readEmployeePermissions } from "@/lib/hr/employees.functions";
import type { PermissionMap, PermissionOverride } from "@/lib/hr/employees.server";

type Props = {
  /** Pass userId for existing employees to load saved overrides. Omit for new employees. */
  userId?: string;
  value: PermissionMap;
  onChange: (next: PermissionMap) => void;
};

export function PermissionMatrixEditor({ userId, value, onChange }: Props) {
  const readFn = useServerFn(readEmployeePermissions);
  const [loaded, setLoaded] = useState(false);

  const q = useQuery({
    queryKey: ["hr", "employee", userId, "permissions"],
    queryFn: async () => readFn({ data: { userId: userId! } }),
    enabled: !!userId && !loaded,
  });

  // Merge fetched rows once.
  useMemo(() => {
    if (q.data && !loaded) {
      const next: PermissionMap = { ...value };
      for (const r of q.data.rows) {
        if (next[r.module_key] === undefined) next[r.module_key] = r.allowed;
      }
      onChange(next);
      setLoaded(true);
    }
  }, [q.data, loaded, value, onChange]);

  const cycle = (mk: ModuleKey) => {
    const cur = value[mk] ?? "inherit";
    const nxt: PermissionOverride = cur === "inherit" ? true : cur === true ? false : "inherit";
    onChange({ ...value, [mk]: nxt });
  };

  const reset = () => onChange({});

  if (userId && q.isLoading && !loaded) {
    return (
      <div className="space-y-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Click a chip to cycle <span className="font-medium">Inherit → Show → Hide</span>.
            Inherit uses the global setting from Admin → System Preferences.
          </p>
          <Button variant="ghost" size="sm" onClick={reset} className="h-7 text-xs">
            Reset all
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {TOGGLEABLE_MODULES.map((mk) => {
            const v = value[mk] ?? "inherit";
            const tone = v === true ? "default" : v === false ? "destructive" : "outline";
            const label = v === true ? "Show" : v === false ? "Hide" : "Inherit";
            return (
              <button
                key={mk}
                type="button"
                onClick={() => cycle(mk)}
                className="flex items-center justify-between gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs hover:bg-accent transition-colors"
                title={`${MODULE_LABEL[mk]} — ${label}`}
              >
                <span className="truncate">{MODULE_LABEL[mk]}</span>
                <Badge variant={tone} className="text-[10px] min-w-[52px] justify-center">
                  {label}
                </Badge>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
