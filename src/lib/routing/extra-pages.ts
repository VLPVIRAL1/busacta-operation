import type { ModuleKey } from "@/lib/routing/use-nav";

/**
 * Pages that exist as routes but are NOT first-class nav entries
 * (drill-down / detail pages, alt landings). Used by:
 * - /guide/sitemap to honestly show the full surface area of the app
 * - /dashboard hub search to let users jump to deep pages directly
 */
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
    { title: "Attendance Import (CSV)", url: "/hr/attendance/import" },
    { title: "Tardiness Tracker", url: "/hr/tardiness" },
  ],
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
    { title: "Team Access Matrix", url: "/clients/firm/matrix" },
    { title: "Projects by Firm", url: "/clients/firm/projects" },
    { title: "Folder Library", url: "/clients/firm/folder-library" },
  ],
  admin: [
    { title: "Team", url: "/admin/team" },
    { title: "Hub Permissions", url: "/admin/access-control?tab=roles" },
    { title: "Activity Audit · Event log", url: "/admin/activity-audit?tab=log" },
    { title: "Compliance · Incident Response", url: "/admin/compliance?tab=incident" },
    { title: "Pre-launch · Restore Drill", url: "/admin/verify?tab=restore" },
    { title: "Auto-Categorisation", url: "/admin/categorisation" },
  ],
  general: [
    { title: "Help", url: "/guide/manual" },
    { title: "Download desktop app", url: "/download" },
  ],
};
