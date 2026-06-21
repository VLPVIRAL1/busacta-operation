import {
  KeyboardShortcutsDialog,
  type Shortcut,
} from "@/components/shared/keyboard-shortcuts-dialog";

const SHORTCUTS: Shortcut[] = [
  { keys: "/", action: "Focus first search / input" },
  { keys: "r", action: "Refresh task, sub-tasks, items, audit" },
  { keys: "d", action: "Toggle Discussion panel" },
  { keys: "1 / 7", action: "Previous / next tab" },
  { keys: "2 / 8", action: "Decrease / Increase left pane width" },
  { keys: "0", action: "Reset pane width" },
  { keys: "?", action: "Show this cheat sheet" },
];

export function TaskViewShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return <KeyboardShortcutsDialog open={open} onOpenChange={onOpenChange} shortcuts={SHORTCUTS} />;
}
