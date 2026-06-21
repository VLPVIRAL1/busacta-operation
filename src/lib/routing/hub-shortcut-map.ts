// Single source of truth for global Alt+<key> hub shortcuts.
// Consumed by `useHubShortcuts` and by the /guide/shortcuts legend.
export type HubShortcut = {
  key: string;
  to: string;
  label: string;
};

export const HUB_SHORTCUTS: HubShortcut[] = [
  { key: "1", to: "/global-dashboard", label: "Dashboard" },
  { key: "2", to: "/ops", label: "Operations" },
  { key: "3", to: "/hr", label: "HR" },
  { key: "4", to: "/growth", label: "Growth" },
  { key: "5", to: "/admin", label: "Admin" },
  { key: "6", to: "/guide", label: "Guide" },
];

export const HUB_SHORTCUT_MAP: Record<string, string> = Object.fromEntries(
  HUB_SHORTCUTS.map((s) => [s.key, s.to]),
);
