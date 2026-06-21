import type { ReactNode } from "react";

import { cn } from "@/lib/shared/utils";

/**
 * Pill-style tab switcher used across the consolidated Admin pages.
 * Lifted from the original inline `ViewTab` in `admin/access-control.tsx`
 * so every container route shares one implementation.
 */
export function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** Thin horizontal container for a row of {@link ViewTab} pills. */
export function AdminTabBar({ children }: { children: ReactNode }) {
  return <div className="flex shrink-0 items-center gap-1">{children}</div>;
}
