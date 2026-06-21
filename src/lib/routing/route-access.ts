// Centralised route-access matrix.
//
// Enforcement is ON by default: the matrix below is authoritative everywhere —
// AuthGuard, nav, and the matrix test. To opt back into the old "everyone sees
// everything" validation mode during local dev, set VITE_BYPASS_ACCESS=true.
import type { AppRole } from "@/lib/routing/use-nav";

export const BYPASS_ACCESS: boolean = (import.meta.env?.VITE_BYPASS_ACCESS ?? "false") === "true";

export const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  hr_manager: "HR Manager",
  employee: "Employee",
  client: "Client",
};

/** Roles required to access a given path prefix. First match wins. */
type Rule = { prefix: string; roles: AppRole[]; label?: string };

const RULES: Rule[] = [
  // HR
  {
    prefix: "/hr/attendance/import",
    roles: ["super_admin", "admin", "hr_manager"],
    label: "Attendance import",
  },
  {
    prefix: "/hr/payroll",
    roles: ["super_admin", "hr_manager"],
    label: "Payroll",
  },

  // Ops sub-areas
  { prefix: "/ops/time-logs", roles: ["super_admin", "admin", "employee"], label: "Time logs" },
  {
    prefix: "/ops/reports",
    roles: ["super_admin", "admin", "employee"],
    label: "Operations reports",
  },
  {
    prefix: "/ops/templates",
    roles: ["super_admin", "admin", "employee"],
    label: "Workflow templates",
  },
  {
    prefix: "/ops/tem-cai",
    roles: ["super_admin", "admin", "employee"],
    label: "Clarification & Action templates",
  },
  {
    prefix: "/ops/email-templates",
    roles: ["super_admin", "admin", "employee"],
    label: "Email templates",
  },
  {
    prefix: "/ops/productivity",
    roles: ["super_admin", "admin", "hr_manager", "employee"],
    label: "Productivity",
  },

  // Admin / Firm-Hub / Growth
  { prefix: "/admin", roles: ["super_admin"], label: "Admin" },
  { prefix: "/clients", roles: ["super_admin", "admin"], label: "Firm Profile Master Hub" },
  { prefix: "/growth", roles: ["super_admin"], label: "Growth" },

  // Audit log — super_admin only (explicit; /admin rule already covers it)
  {
    prefix: "/admin/activity-audit",
    roles: ["super_admin"],
    label: "Audit log",
  },

  // Login activity (HR + admin)
  {
    prefix: "/admin/user-activity",
    roles: ["super_admin", "admin", "hr_manager"],
    label: "Login activity",
  },

  // Client portal is for clients + super_admin
  { prefix: "/portal", roles: ["client", "super_admin"], label: "Client portal" },
];

export function requiredRolesFor(path: string): AppRole[] | null {
  // Most-specific (longest) prefix wins.
  const match = RULES.filter(
    (r) => path === r.prefix || path.startsWith(r.prefix + "/") || path.startsWith(r.prefix),
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match ? match.roles : null;
}

export function labelFor(path: string): string | null {
  const match = RULES.filter((r) => path.startsWith(r.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0];
  return match?.label ?? null;
}

export function canAccess(roles: AppRole[] | null | undefined, path: string): boolean {
  if (BYPASS_ACCESS) return true;
  if ((roles ?? []).includes("super_admin")) return true;
  const need = requiredRolesFor(path);
  if (!need || need.length === 0) return true;
  const have = roles ?? [];
  return have.some((r) => need.includes(r));
}

export function formatRoles(roles: AppRole[]): string {
  if (!roles.length) return "Any signed-in user";
  return roles.map((r) => ROLE_LABEL[r]).join(", ");
}

export const ALL_RULES = RULES;
