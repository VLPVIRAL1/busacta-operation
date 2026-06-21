import {
  KeyboardShortcutsDialog,
  type Shortcut,
} from "@/components/shared/keyboard-shortcuts-dialog";

const SHORTCUTS: Shortcut[] = [
  { keys: "/", action: "Focus the task search" },
  { keys: "r", action: "Refresh tasks" },
  { keys: "a", action: "Scope: All Tasks" },
  { keys: "m", action: "Scope: Mine" },
  { keys: "u", action: "Scope: Unassigned" },
  { keys: "d", action: "Toggle My Day filter" },
  { keys: "g  then  a", action: "Scope: All (combo)" },
  { keys: "g  then  m", action: "Scope: Mine (combo)" },
  { keys: "1 / 7", action: "Next / previous task in list (wraps)" },
  { keys: "2 / 8", action: "Decrease / Increase left pane width" },
  { keys: "?", action: "Show this cheat sheet" },
];

export function TodosShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return <KeyboardShortcutsDialog open={open} onOpenChange={onOpenChange} shortcuts={SHORTCUTS} />;
}
