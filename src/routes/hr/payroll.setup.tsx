import { createFileRoute, redirect } from "@tanstack/react-router";

// Payroll Setup has been folded into the unified /hr/payroll page as tabs.
// Keep this route alive as a redirect for existing bookmarks/links, mapping
// the old `?tab=` values to the new `?view=` values.
type LegacyTab = "employees" | "attendance" | "holidays" | "policies";

const TAB_TO_VIEW: Record<LegacyTab, "employees" | "attendance" | "holidays"> = {
  employees: "employees",
  attendance: "attendance",
  holidays: "holidays",
  policies: "attendance", // older alias
};

export const Route = createFileRoute("/hr/payroll/setup")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search.tab === "string" ? (search.tab as LegacyTab) : undefined,
  }),
  beforeLoad: ({ search }) => {
    const view = search.tab ? (TAB_TO_VIEW[search.tab] ?? "employees") : "employees";
    throw redirect({ to: "/hr/payroll", search: { view } });
  },
});
