import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/shared/utils";

interface StatCardProps {
  label: string;
  value?: number | string;
  tone?: "ok" | "warn" | "err";
  icon?: ReactNode;
  accent?: boolean;
  loading?: boolean;
  className?: string;
}

export function StatCard({ label, value, tone, icon, accent, loading, className }: StatCardProps) {
  return (
    <Card className={cn(accent && "border-primary/40", className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          {icon}
        </div>
        {loading ? (
          <Skeleton className="h-8 w-16 mt-1" />
        ) : (
          <div
            className={cn(
              "mt-1 text-2xl font-semibold tabular-nums",
              tone === "ok" && "text-emerald-600 dark:text-emerald-400",
              tone === "warn" && "text-amber-600 dark:text-amber-400",
              tone === "err" && "text-destructive",
              !tone && accent && "text-primary",
            )}
          >
            {value ?? 0}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
