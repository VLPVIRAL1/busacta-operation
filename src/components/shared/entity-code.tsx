import * as React from "react";
import { cn } from "@/lib/shared/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Compact entity code badge with hover tooltip showing the full name.
 *
 * Used everywhere a firm or project name appears as a grid cell, chip,
 * or badge to maximize horizontal density. Selection menus (pickers /
 * dropdowns) should NOT use this — use `formatPickerLabel()` instead.
 */
function fallbackCode(name: string | null | undefined): string {
  const cleaned = (name ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return cleaned.slice(0, 3) || "—";
}

interface EntityCodeProps {
  code?: string | null;
  name?: string | null;
  variant?: "firm" | "project" | "direct";
  className?: string;
  /** Optional click handler (used by table rows that were previously clickable). */
  onClick?: () => void;
  /** Optional id for downstream click handlers. */
  id?: string;
}

function EntityCode({ code, name, variant = "firm", className, onClick }: EntityCodeProps) {
  const label = (code && code.trim()) || fallbackCode(name);
  const full = name?.trim() || label;
  const Comp: "button" | "span" = onClick ? "button" : "span";
  const palette =
    variant === "firm"
      ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
      : variant === "project"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
        : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200";
  const testId =
    variant === "firm"
      ? "firm-code"
      : variant === "project"
        ? "project-code"
        : "direct-client-code";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Comp
          type={onClick ? "button" : undefined}
          onClick={onClick}
          title={full}
          aria-label={full}
          data-testid={testId}
          className={cn(
            "inline-flex items-center rounded border px-1.5 py-0 font-mono text-[10px] uppercase tracking-wide leading-5 max-w-[8rem] truncate",
            palette,
            onClick && "cursor-pointer hover:brightness-95",
            className,
          )}
        >
          {label}
        </Comp>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs break-words text-xs">
        {full}
      </TooltipContent>
    </Tooltip>
  );
}

export function FirmCode(props: Omit<EntityCodeProps, "variant">) {
  return <EntityCode {...props} variant="firm" />;
}

export function ProjectCode(props: Omit<EntityCodeProps, "variant">) {
  return <EntityCode {...props} variant="project" />;
}

export function DirectClientCode(props: Omit<EntityCodeProps, "variant">) {
  return <EntityCode {...props} variant="direct" />;
}

/**
 * Label format for selection UIs (pickers, dropdowns, comboboxes).
 * Always shows the full name with a leading code so users know what
 * they're selecting. Example: "[VPC] Viral Patel & Co".
 */
export function formatPickerLabel(
  code: string | null | undefined,
  name: string | null | undefined,
): string {
  const c = (code || "").trim().toUpperCase();
  const n = (name || "").trim();
  if (!c && !n) return "—";
  if (!c) return n;
  if (!n) return `[${c}]`;
  return `[${c}] ${n}`;
}
