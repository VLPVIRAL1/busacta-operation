import {
  KeyboardShortcutsDialog,
  type Shortcut,
} from "@/components/shared/keyboard-shortcuts-dialog";

const SHORTCUTS: Shortcut[] = [
  { keys: "/", action: "Focus the search box" },
  { keys: "n", action: "New chat" },
  { keys: "r", action: "Refresh inbox" },
  { keys: "a", action: "Switch to Active view" },
  { keys: "e", action: "Switch to Archived view" },
  { keys: "4 / 5 / 6", action: "Filter Direct / Group / Tasks (single)" },
  { keys: "Click", action: "Select one type only" },
  { keys: "Ctrl/⌘ + Click", action: "Toggle type in selection" },
  { keys: "Shift + Click", action: "Select all types" },
  { keys: "0", action: "Reset type filter to All" },
  { keys: "↑ / ↓", action: "Move selection up / down" },
  { keys: "1 / 7", action: "Open next / previous conversation (wraps)" },
  { keys: "2 / 8", action: "Decrease / Increase list pane width" },
  { keys: "9 / 3", action: "Scroll conversation up / down" },
  { keys: "Enter", action: "Open focused conversation" },
  { keys: "g  then  m", action: "Switch to My chats" },
  { keys: "g  then  a", action: "Switch to All chats" },
  { keys: "?", action: "Show this cheat sheet" },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return <KeyboardShortcutsDialog open={open} onOpenChange={onOpenChange} shortcuts={SHORTCUTS} />;
}
