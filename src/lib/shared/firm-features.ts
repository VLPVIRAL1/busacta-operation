/**
 * Single source of truth for the per-firm feature matrix.
 *
 * Both the Firm Hub detail page (FeatureSurfaceCard + per-employee ContactAccessDialog)
 * and the Firm Onboarding Wizard read this list. Never duplicate.
 */
export type FirmFeatureKey =
  | "tasks"
  | "documents"
  | "messaging"
  | "sops"
  | "open_points"
  | "timesheet"
  | "internal_notes"
  | "audit_trail"
  | "pipeline";

export interface FirmFeature {
  key: FirmFeatureKey;
  label: string;
  description?: string;
  portalDefault: boolean;
  internalDefault: boolean;
}

export const FEATURE_MATRIX: FirmFeature[] = [
  {
    key: "tasks",
    label: "Tasks",
    description: "Task lists & assignments",
    portalDefault: true,
    internalDefault: true,
  },
  {
    key: "documents",
    label: "Documents",
    description: "File uploads & sharing",
    portalDefault: true,
    internalDefault: true,
  },
  {
    key: "messaging",
    label: "Messaging",
    description: "Conversations & threads",
    portalDefault: true,
    internalDefault: true,
  },
  {
    key: "sops",
    label: "SOPs",
    description: "Standard procedures",
    portalDefault: false,
    internalDefault: true,
  },
  {
    key: "open_points",
    label: "Open Points",
    description: "Blockers & follow-ups",
    portalDefault: false,
    internalDefault: true,
  },
  {
    key: "timesheet",
    label: "Time Sheet",
    description: "Time tracking",
    portalDefault: false,
    internalDefault: true,
  },
  {
    key: "internal_notes",
    label: "Internal Notes",
    description: "Notes hidden from clients",
    portalDefault: false,
    internalDefault: true,
  },
  {
    key: "audit_trail",
    label: "Audit Trail",
    description: "Activity history log",
    portalDefault: false,
    internalDefault: true,
  },
  {
    key: "pipeline",
    label: "Pipeline",
    description: "Workflow stage board",
    portalDefault: false,
    internalDefault: true,
  },
];

/**
 * Build the default `feature_flags` JSON for a new firm — `{feature}.{surface}` keys
 * mapped to their per-surface defaults. Matches what FeatureSurfaceCard reads.
 */
export function buildDefaultFeatureFlags(): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const f of FEATURE_MATRIX) {
    flags[`${f.key}.portal`] = f.portalDefault;
    flags[`${f.key}.internal`] = f.internalDefault;
  }
  return flags;
}
