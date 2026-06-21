// Single source of truth for which hubs are visible BY DEFAULT for a given
// set of roles. The Hub Visibility matrix uses this to render the implicit
// "Inherit" cell value; the role-switcher uses the same map to compute
// per-role landing pages. Per-user overrides in `user_hub_permissions` win
// over these defaults.
import type { ModuleKey } from "@/lib/routing/use-nav";

export type SystemRole = "super_admin" | "admin" | "hr_manager" | "employee" | "client";

// Default hub access per base role. Keys are roles, values are the set of
// ModuleKeys visible without an explicit override.
const ROLE_DEFAULTS: Record<SystemRole, ReadonlyArray<ModuleKey>> = {
  super_admin: [
    "dashboard",
    "ops",
    "hr",
    "learning",
    "organizer",
    "esign",
    "email",
    "growth",
    "clients",
    "admin",
    "portal",
    "guide",
    "gallery",
  ],
  admin: [
    "dashboard",
    "ops",
    "hr",
    "learning",
    "organizer",
    "esign",
    "email",
    "clients",
    "guide",
    "gallery",
  ],
  hr_manager: ["dashboard", "hr", "learning", "organizer", "email", "guide", "gallery"],
  employee: [
    "dashboard",
    "ops",
    "clients",
    "organizer",
    "esign",
    "email",
    "learning",
    "guide",
    "gallery",
  ],
  client: ["portal"],
};

export function defaultHubsForRoles(roles: ReadonlyArray<string>): Set<ModuleKey> {
  const out = new Set<ModuleKey>();
  for (const r of roles) {
    const list = ROLE_DEFAULTS[r as SystemRole];
    if (!list) continue;
    for (const m of list) out.add(m);
  }
  return out;
}

export function isHubDefaultForRoles(roles: ReadonlyArray<string>, module: ModuleKey): boolean {
  return defaultHubsForRoles(roles).has(module);
}

// Modules that are NOT subject to hub-visibility gating — they are reachable
// whenever the user's role/route rules allow, regardless of the matrix. Mirrors
// the exclusions in TOGGLEABLE_MODULES (full ModuleKey set minus TOGGLEABLE).
const NON_GATED_HUBS: ReadonlySet<ModuleKey> = new Set<ModuleKey>(["communication", "general"]);

export interface HubVisibilityInputs {
  /** Per-user overrides from `user_hub_permissions` (true=show, false=hide). */
  overrides: Partial<Record<ModuleKey, boolean>>;
  /** Every role granted to the user. */
  roles: ReadonlyArray<string>;
  /** Global master switches from `app_settings.value.module_hubs`. */
  moduleHubs: Partial<Record<ModuleKey, boolean>>;
}

/**
 * Single source of truth for whether a user may see/enter a hub. Precedence:
 *   1. Explicit per-user override (Show / Hide in the matrix) always wins.
 *   2. Otherwise (Inherit): visible only if a role default grants the hub AND
 *      the global master switch hasn't disabled it.
 * Non-gated hubs (general, communication) are always visible. `admin` and
 * `portal` are now role-gated (super_admin for admin; client + super_admin for
 * portal) via ROLE_DEFAULTS above.
 */
export function isHubVisibleFor(module: ModuleKey, inp: HubVisibilityInputs): boolean {
  if (NON_GATED_HUBS.has(module)) return true;
  // HR Manager always retains full access to the HR hub: a per-employee
  // Hub-Permissions "Hide" override (and the global master switch) cannot take
  // it away. Targeted rule — only the hr_manager role + the hr hub.
  if (module === "hr" && inp.roles.includes("hr_manager")) return true;
  const override = inp.overrides[module];
  if (typeof override === "boolean") return override;
  const roleAllows = isHubDefaultForRoles(inp.roles, module);
  const globalEnabled = inp.moduleHubs[module] !== false;
  return roleAllows && globalEnabled;
}
