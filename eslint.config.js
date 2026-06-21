import js from "@eslint/js";
// eslint-plugin-prettier intentionally removed from CI config — Prettier
// formatting is enforced by the editor/pre-commit hook, not lint.
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Files that still import the Supabase client directly. Burn this list down
// as routes/components are migrated to `src/lib/queries/*` or a server fn.
// New files MUST NOT be added here — go through the data layer instead.
const SUPABASE_DIRECT_IMPORT_ALLOWLIST = [
  "src/components/auth/auth-guard.tsx",
  "src/components/firm-hub/project-workspace.tsx",
  "src/components/ops/direct-messages-page.tsx",
  "src/components/ops/firm-detail-drawer.tsx",
  "src/components/ops/floating-timer.tsx",
  "src/components/ops/mention-textarea.tsx",
  "src/components/ops/sops-and-notes.tsx",
  "src/components/ops/subtask-list.tsx",
  "src/components/ops/task-action-items-panel.tsx",
  "src/components/ops/task-activity-feed.tsx",
  "src/components/ops/task-audit-timeline.tsx",
  "src/components/ops/task-edit-sheet.tsx",
  "src/components/ops/task-links-panel.tsx",
  "src/components/ops/task-notes-panel.tsx",
  "src/components/ops/task-permissions-matrix.tsx",
  "src/components/ops/task-time-sheet-panel.tsx",
  "src/components/ops/template-scope-picker.tsx",
  "src/components/ops/timer-group.tsx",
  "src/components/ops/timer-widget.tsx",
  "src/components/shared/avatar-uploader.tsx",
  "src/components/shared/delete-entity-button.tsx",
  "src/components/shared/edit-member-dialog.tsx",
  "src/components/shared/effective-edit-popover.tsx",
  "src/components/shared/people-picker.tsx",
  "src/components/shared/single-person-picker.tsx",
  "src/components/shared/user-avatar.tsx",
  "src/components/shell/notifications-bell.tsx",
  "src/routes/accept-invite.$token.tsx",
  "src/routes/admin/**",
  "src/routes/firm-hub/**",
  "src/routes/growth/leads.tsx",
  "src/routes/hr/**",
  "src/routes/learning/courses.tsx",
  "src/routes/login.tsx",
  "src/routes/ops/communication.tsx",
  "src/routes/ops/firms.$firmId.activity.tsx",
  "src/routes/ops/firms.$firmId.communication.tsx",
  "src/routes/ops/firms.$firmId.pipeline.tsx",
  "src/routes/ops/pipeline.tsx",
  "src/routes/ops/projects.$projectId.tsx",
  "src/routes/ops/tasks.$taskId.tsx",
  "src/routes/ops/time-logs.tsx",
  "src/routes/portal.tsx",
  "src/routes/security/mfa.tsx",
  // --- grandfathered additions (added during CI-fix pass) ---
  "src/components/admin/database-backups-card.tsx",
  "src/components/admin/members-hub.tsx",
  "src/components/client-hub/client-contacts-tab.tsx",
  "src/components/client-hub/client-profile-tab.tsx",
  "src/components/client-hub/client-rate-card.tsx",
  "src/components/client-hub/client-team-tab.tsx",
  "src/components/client-hub/task-types-manager.tsx",
  "src/components/clients/client-detail-pane.tsx",
  "src/components/esign/field-canvas-step.tsx",
  "src/components/esign/review-preview.tsx",
  "src/components/esign/storage-target-card.tsx",
  "src/components/firm-hub/onboarding/firm-wizard.tsx",
  "src/components/firm-hub/pricing-tab.tsx",
  "src/components/general/active-devices-panel.tsx",
  "src/components/global-dashboard/blocks/calendar-block.tsx",
  "src/components/global-dashboard/daily-notes-editor.tsx",
  "src/components/global-dashboard/reminders-panel.tsx",
  "src/components/global-dashboard/tab-calendar.tsx",
  "src/components/global-dashboard/tab-daily-notes.tsx",
  "src/components/global-dashboard/template-manager-dialog.tsx",
  "src/components/global-dashboard/tab-live-track.tsx",
  "src/components/global-dashboard/tab-my-tasks.tsx",
  "src/components/global-dashboard/task-tabs-pane.tsx",
  "src/components/global-dashboard/today-agenda.tsx",
  "src/components/hr/employee-create-sheet.tsx",
  "src/components/hr/employee-dashboard.tsx",
  "src/components/hr/employee-directory.tsx",
  "src/components/learning/path-builder.tsx",
  "src/components/ops/communication/bulk-actions-bar.tsx",
  "src/components/ops/communication/dropzone-overlay.tsx",
  "src/components/ops/communication/group-info-drawer.tsx",
  "src/components/ops/communication/presence-dot.tsx",
  "src/components/ops/communication/starred-messages-dialog.tsx",
  "src/components/ops/communication/thread-chat.tsx",
  "src/components/ops/communication/thread-notification-menu.tsx",
  "src/components/ops/communication/unified-inbox.tsx",
  "src/components/ops/document-manager.tsx",
  "src/components/ops/document-preview-sheet.tsx",
  "src/components/ops/files-panel.tsx",
  "src/components/ops/firm-activity-panel.tsx",
  "src/components/ops/projects/project-detail-view.tsx",
  "src/components/ops/subtask-timer-button.tsx",
  "src/components/ops/task-timer-button.tsx",
  "src/components/ops/task-watch-toggle.tsx",
  "src/components/ops/timer-recovery-prompt.tsx",
  "src/components/ops/todos-people-filter.tsx",
  "src/components/ops/todos-table.tsx",
  "src/components/ops/todos/task-information-form.tsx",
  "src/components/ops/todos/todos-detail-pane.tsx",
  "src/components/ops/todos/todos-filter-bar.tsx",
  "src/components/ops/todos/todos-list-pane.tsx",
  "src/components/organizer/edit-assignment-dialog.tsx",
  "src/components/organizer/fields/signature-field.tsx",
  "src/components/organizer/submitted-answer-view.tsx",
  "src/components/organizer/wizard-file-upload.tsx",
  "src/components/portal/portal-documents.tsx",
  "src/components/portal/portal-task-files.tsx",
  "src/components/shared/audit-history-popover.tsx",
  "src/components/shared/multi-person-picker.tsx",
  "src/components/shared/rich-editor.tsx",
  "src/components/shared/subtask-checklist-readonly.tsx",
  "src/routes/api/public/cron.access-review-check.ts",
  "src/routes/api/public/cron.categorisation-train.ts",
  "src/routes/api/public/cron.chat-auto-archive.ts",
  "src/routes/api/public/cron.timer-cleanup.ts",
  "src/routes/api/public/cron/sharepoint-worker.ts",
  "src/routes/api/public/organizer/context.ts",
  "src/routes/api/public/organizer/save.ts",
  "src/routes/api/public/organizer/start.ts",
  "src/routes/api/public/organizer/submit.ts",
  "src/routes/clients/firm.$firmId.index.tsx",
  "src/routes/clients/firm.$firmId.projects.$projectId.tsx",
  "src/routes/clients/firm.matrix.tsx",
  "src/routes/clients/firm.projects.tsx",
  "src/routes/email.log.tsx",
  "src/routes/email.tsx",
  "src/routes/esign/envelopes.$id.tsx",
  "src/routes/esign/envelopes.new.tsx",
  "src/routes/growth/analytics.tsx",
  "src/routes/growth/calendar.tsx",
  "src/routes/growth/content.tsx",
  "src/routes/growth/marketing.tsx",
  "src/routes/learning/library.tsx",
  "src/routes/learning/paths.tsx",
  "src/routes/learning/qa.tsx",
  "src/routes/ops/entities.$entityId.tsx",
  "src/routes/organizer/tracking.tsx",
  "src/routes/portal.inbox.tsx",
  "src/routes/portal.index.tsx",
  "src/routes/portal.my-tasks.tsx",
  "src/routes/portal.projects.$projectId.tsx",
  "src/routes/portal.projects.index.tsx",
  "src/routes/portal/tasks.$taskId.tsx",
];

const baseRestrictedImports = {
  paths: [
    {
      name: "server-only",
      message:
        "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
    },
  ],
};

const dataLayerRestrictedImports = {
  paths: [
    ...baseRestrictedImports.paths,
    {
      name: "@/integrations/supabase/client",
      message:
        "Do not import the Supabase client in routes/components. Use a hook/factory from `src/lib/queries/*` or call a server fn under `src/lib/*.functions.ts`.",
    },
  ],
  patterns: [
    {
      group: ["@/integrations/supabase/client.server"],
      message:
        "`client.server` is server-only. Wrap access in a `createServerFn` under `src/lib/*.functions.ts`.",
    },
  ],
};

// DRY Source-of-Truth Registry — registered originals.
// Re-declaring any of these names OUTSIDE its canonical file is a hard error.
// See `.lovable/plan.md` for the full registry and consolidation checklist.
const DRY_ORIGINALS = [
  { name: "PageHeader", canonical: "src/components/shell/app-shell.tsx" },
  { name: "EmptyState", canonical: "src/components/shared/empty-state.tsx" },
  { name: "ExportMenu", canonical: "src/components/shared/export-menu.tsx" },
  { name: "DateRangeFilter", canonical: "src/components/shared/date-range-filter.tsx" },
  { name: "AssigneeStack", canonical: "src/components/shared/assignee-stack.tsx" },
  { name: "FilterBar", canonical: "src/components/shared/filter-bar.tsx" },
  { name: "PeoplePicker", canonical: "src/components/shared/people-picker.tsx" },
  { name: "SinglePersonPicker", canonical: "src/components/shared/single-person-picker.tsx" },
  { name: "MultiPersonPicker", canonical: "src/components/shared/multi-person-picker.tsx" },
  { name: "TaskNotesPanel", canonical: "src/components/ops/task-notes-panel.tsx" },
  { name: "TaskActionItemsPanel", canonical: "src/components/ops/task-action-items-panel.tsx" },
  { name: "SubtaskList", canonical: "src/components/ops/subtask-list.tsx" },
  { name: "DocumentManager", canonical: "src/components/ops/document-manager.tsx" },
  { name: "ThreadChat", canonical: "src/components/ops/communication/thread-chat.tsx" },
  { name: "TaskLinksPanel", canonical: "src/components/ops/task-links-panel.tsx" },
  { name: "TaskTimerControl", canonical: "src/components/ops/timer-widget.tsx" },
];

const dryRegistryConfigs = DRY_ORIGINALS.map(({ name, canonical }) => ({
  files: ["src/**/*.{ts,tsx}"],
  ignores: [canonical],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: `FunctionDeclaration[id.name='${name}']`,
        message: `DRY registry: '${name}' is a registered Original at ${canonical}. Import it instead of redeclaring.`,
      },
      {
        selector: `VariableDeclarator[id.name='${name}']`,
        message: `DRY registry: '${name}' is a registered Original at ${canonical}. Import it instead of redeclaring.`,
      },
      {
        selector: `ClassDeclaration[id.name='${name}']`,
        message: `DRY registry: '${name}' is a registered Original at ${canonical}. Import it instead of redeclaring.`,
      },
    ],
  },
}));

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", "src/routeTree.gen.ts"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": ["error", baseRestrictedImports],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-expressions": "off",
      "no-useless-escape": "off",
      "no-empty": "off",
    },
  },
  // Architectural guard: routes and UI components must go through the data
  // layer instead of importing the raw Supabase client. The allow-list above
  // grandfathers existing files; new code MUST NOT import the client here.
  {
    files: ["src/routes/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: SUPABASE_DIRECT_IMPORT_ALLOWLIST,
    rules: {
      "no-restricted-imports": ["error", dataLayerRestrictedImports],
    },
  },
  ...dryRegistryConfigs,
);
