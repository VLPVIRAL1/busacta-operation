// Single source of truth for every URL the app advertises (Tier-1 modules,
// Tier-2 nav links, drill-down detail pages, and standalone system pages).
// Consumed by the Site Map and the Route Health pages so they never drift.

import {
  ALL_TIER1,
  ALL_TIER2,
  MODULE_LABEL,
  type ModuleKey,
  type AppRole,
} from "@/lib/routing/use-nav";
import { requiredRolesFor } from "@/lib/routing/route-access";

export type RouteSource = "tier1" | "tier2" | "extra" | "standalone";

export interface RouteEntry {
  hub: ModuleKey | "system";
  hubLabel: string;
  group?: string;
  title: string;
  url: string;
  source: RouteSource;
  requiredRoles: AppRole[];
  isDynamic: boolean;
  note?: string;
}

/** Detail / drill-down pages that exist as routes but are not first-class nav entries. */
export const EXTRA_PAGES: Partial<
  Record<ModuleKey, { title: string; url: string; note?: string }[]>
> = {
  ops: [
    { title: "Firm detail", url: "/ops/workspace/firms/$firmId", note: "deep-link" },
    { title: "Firm · Communication", url: "/ops/firms/$firmId/communication", note: "deep-link" },
    { title: "Project detail", url: "/projects/$projectSlug", note: "deep-link" },
    { title: "Task detail", url: "/ops/tasks/$taskId", note: "deep-link" },
    { title: "Entity detail", url: "/ops/entities/$entityId", note: "deep-link" },
  ],
  communication: [
    { title: "Direct Message thread", url: "/ops/communication/dm", note: "in-page" },
  ],
  hr: [
    {
      title: "Attendance Import (CSV)",
      url: "/hr/attendance/import",
      note: "feeds biometric punch data",
    },
    { title: "Tardiness Tracker", url: "/hr/tardiness" },
  ],
  learning: [{ title: "Courses & Certifications", url: "/learning/courses" }],
  clients: [
    { title: "Firm detail", url: "/clients/firm/$firmId", note: "deep-link" },
    {
      title: "Firm · Project dashboard",
      url: "/clients/firm/$firmId/projects/$projectId",
      note: "deep-link",
    },
    { title: "Firm · Return types", url: "/clients/firm/$firmId/return-types", note: "deep-link" },
    { title: "B2C client detail", url: "/clients/direct/$clientId", note: "deep-link" },
    { title: "Onboard new B2C client", url: "/clients?new=direct" },
  ],
  admin: [
    { title: "Team", url: "/admin/team" },
    { title: "Hub Permissions", url: "/admin/access-control?tab=roles" },
    { title: "Activity Audit · Event log", url: "/admin/activity-audit?tab=log" },
    { title: "Compliance · Incident Response", url: "/admin/compliance?tab=incident" },
    { title: "Pre-launch · Restore Drill", url: "/admin/verify?tab=restore" },
    { title: "Auto-Categorisation", url: "/admin/categorisation" },
  ],
  general: [{ title: "Help", url: "/general/help" }],
};

export const STANDALONE_PAGES: { title: string; url: string; note?: string }[] = [
  { title: "Login", url: "/login" },
  { title: "Forgot Password", url: "/forgot-password" },
  { title: "Reset Password", url: "/reset-password" },
  { title: "Accept Invite", url: "/accept-invite/$token", note: "token link" },
  { title: "MFA Setup", url: "/security/mfa" },
  { title: "Session Expired", url: "/session-expired" },
  { title: "Unauthorized", url: "/unauthorized" },
  { title: "Forbidden", url: "/forbidden" },
  { title: "Access Denied", url: "/access-denied" },
  { title: "Legal · Privacy", url: "/legal/privacy" },
  { title: "Legal · Terms", url: "/legal/terms" },
  { title: "Legal · Security", url: "/legal/security" },
  { title: "Legal · DPA", url: "/legal/dpa" },
];

const isDyn = (u: string) => u.includes("$");

export const ALL_ROUTE_ENTRIES: RouteEntry[] = (() => {
  const out: RouteEntry[] = [];

  for (const t of ALL_TIER1) {
    out.push({
      hub: t.key,
      hubLabel: MODULE_LABEL[t.key],
      title: t.title,
      url: t.url,
      source: "tier1",
      requiredRoles: requiredRolesFor(t.url) ?? [],
      isDynamic: isDyn(t.url),
    });
  }

  for (const key of Object.keys(ALL_TIER2) as ModuleKey[]) {
    for (const g of ALL_TIER2[key]) {
      for (const l of g.links) {
        out.push({
          hub: key,
          hubLabel: MODULE_LABEL[key],
          group: g.label,
          title: l.title,
          url: l.url,
          source: "tier2",
          requiredRoles: requiredRolesFor(l.url) ?? l.roles ?? [],
          isDynamic: isDyn(l.url),
        });
      }
    }
  }

  for (const [k, list] of Object.entries(EXTRA_PAGES) as [
    ModuleKey,
    { title: string; url: string; note?: string }[],
  ][]) {
    for (const p of list) {
      out.push({
        hub: k,
        hubLabel: MODULE_LABEL[k],
        group: "Detail / drill-down",
        title: p.title,
        url: p.url,
        source: "extra",
        requiredRoles: requiredRolesFor(p.url) ?? [],
        isDynamic: isDyn(p.url),
        note: p.note,
      });
    }
  }

  for (const p of STANDALONE_PAGES) {
    out.push({
      hub: "system",
      hubLabel: "Standalone & system",
      title: p.title,
      url: p.url,
      source: "standalone",
      requiredRoles: [],
      isDynamic: isDyn(p.url),
      note: p.note,
    });
  }

  // Deduplicate by (hub|url|source) — Tier-1 dashboards and Tier-2 dashboards
  // can legitimately overlap; we keep both since they're distinct nav entries.
  const seen = new Set<string>();
  return out.filter((e) => {
    const k = `${e.hub}|${e.url}|${e.source}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
})();
