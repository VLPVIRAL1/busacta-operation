import { Inbox, Send, FileText, Archive, Trash2, AlertOctagon, Layers } from "lucide-react";
import { cn } from "@/lib/shared/utils";

export type EmailFolder = "inbox" | "sent" | "drafts" | "archive" | "trash" | "spam" | "all";

const FOLDERS: {
  key: EmailFolder;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "sent", label: "Sent", icon: Send },
  { key: "drafts", label: "Drafts", icon: FileText },
  { key: "archive", label: "Archive", icon: Archive },
  { key: "spam", label: "Spam", icon: AlertOctagon },
  { key: "trash", label: "Trash", icon: Trash2 },
  { key: "all", label: "All Mail", icon: Layers },
];

export function FolderRail({
  active,
  onChange,
}: {
  active: EmailFolder;
  onChange: (f: EmailFolder) => void;
}) {
  return (
    <nav aria-label="Mail folders" className="p-2 space-y-0.5">
      {FOLDERS.map((f) => {
        const Icon = f.icon;
        const isActive = active === f.key;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onChange(f.key)}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left",
              isActive
                ? "bg-primary/10 text-primary font-medium"
                : "text-foreground/80 hover:bg-muted",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{f.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
