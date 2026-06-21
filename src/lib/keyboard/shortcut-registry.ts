/**
 * Single source of truth for keyboard shortcuts.
 * Both the runtime handlers (useKeyboardShortcuts) and the cheatsheet UI
 * read from this registry, so docs never drift from behavior.
 */
export type ShortcutScope = "global" | "list" | "modal";

export type ShortcutDef = {
  id: string;
  /** Display string, e.g. "?", "Ctrl/Cmd+K", "g d", "↑ / ↓". */
  keys: string;
  scope: ShortcutScope;
  label: string;
  group: string;
};

export const SHORTCUTS: ShortcutDef[] = [
  // Global
  { id: "help", keys: "?", scope: "global", group: "Global", label: "Show keyboard shortcuts" },
  {
    id: "palette",
    keys: "Ctrl/⌘+K",
    scope: "global",
    group: "Global",
    label: "Open command palette",
  },
  {
    id: "escape",
    keys: "Esc",
    scope: "global",
    group: "Global",
    label: "Close dialog / clear selection",
  },
  { id: "search", keys: "/", scope: "global", group: "Global", label: "Focus page search" },
  { id: "refresh", keys: "r", scope: "global", group: "Global", label: "Refresh current view" },
  { id: "new", keys: "n", scope: "global", group: "Global", label: "Create new (context-aware)" },

  // Go-to navigation
  { id: "go-dash", keys: "g then d", scope: "global", group: "Go to", label: "Dashboard" },
  { id: "go-ops", keys: "g then o", scope: "global", group: "Go to", label: "Operations" },
  { id: "go-fin", keys: "g then f", scope: "global", group: "Go to", label: "Finance" },
  { id: "go-pc", keys: "g then p", scope: "global", group: "Go to", label: "Petty Cash" },
  { id: "go-hr", keys: "g then h", scope: "global", group: "Go to", label: "HR" },
  { id: "go-int", keys: "g then i", scope: "global", group: "Go to", label: "Internal" },
  { id: "go-grw", keys: "g then w", scope: "global", group: "Go to", label: "Growth" },
  { id: "go-adm", keys: "g then a", scope: "global", group: "Go to", label: "Admin" },
  { id: "go-gd", keys: "g then u", scope: "global", group: "Go to", label: "Guide" },
  {
    id: "go-alt",
    keys: "Alt+1…9",
    scope: "global",
    group: "Go to",
    label: "Jump to hub by number",
  },

  // List / row
  {
    id: "row-move",
    keys: "↑ / ↓",
    scope: "list",
    group: "Lists",
    label: "Move focus between rows",
  },
  { id: "row-jk", keys: "j / k", scope: "list", group: "Lists", label: "Vim-style down / up" },
  {
    id: "row-ends",
    keys: "Home / End",
    scope: "list",
    group: "Lists",
    label: "Jump to first / last row",
  },
  { id: "row-page", keys: "PgUp / PgDn", scope: "list", group: "Lists", label: "Page up / down" },
  { id: "row-open", keys: "Enter", scope: "list", group: "Lists", label: "Open focused row" },
  { id: "row-sel", keys: "Space", scope: "list", group: "Lists", label: "Toggle selection" },
  {
    id: "row-sel-ext",
    keys: "Shift+↑/↓",
    scope: "list",
    group: "Lists",
    label: "Extend selection",
  },
  { id: "row-sel-all", keys: "Ctrl/⌘+A", scope: "list", group: "Lists", label: "Select all" },
  { id: "row-edit", keys: "e", scope: "list", group: "Row actions", label: "Edit" },
  {
    id: "row-complete",
    keys: "c",
    scope: "list",
    group: "Row actions",
    label: "Complete / toggle done",
  },
  { id: "row-pin", keys: "p", scope: "list", group: "Row actions", label: "Pin / unpin" },
  { id: "row-mark", keys: "m", scope: "list", group: "Row actions", label: "Mark read / unread" },
  { id: "row-snooze", keys: "s", scope: "list", group: "Row actions", label: "Snooze" },
  {
    id: "row-del",
    keys: "Del / #",
    scope: "list",
    group: "Row actions",
    label: "Delete (confirms)",
  },

  // Modal
  { id: "modal-close", keys: "Esc", scope: "modal", group: "Dialogs", label: "Close" },
  {
    id: "modal-submit",
    keys: "Enter",
    scope: "modal",
    group: "Dialogs",
    label: "Submit primary action",
  },
  {
    id: "modal-submit-ta",
    keys: "Ctrl/⌘+Enter",
    scope: "modal",
    group: "Dialogs",
    label: "Submit from inside textarea",
  },
  {
    id: "modal-tab",
    keys: "Tab / Shift+Tab",
    scope: "modal",
    group: "Dialogs",
    label: "Move between fields",
  },
];

export const SHORTCUT_GROUPS = Array.from(new Set(SHORTCUTS.map((s) => s.group)));
