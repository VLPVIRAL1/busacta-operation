/**
 * Left-rail Block Palette for the Organizer Builder. Click a tile to insert
 * a new block of that type. Insertion target follows the current selection:
 *   - If a section is selected → insert as child of that section
 *   - Else → insert at top level
 */
import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Type,
  AlignLeft,
  FileText,
  Hash,
  DollarSign,
  ToggleLeft,
  CircleDot,
  CheckSquare,
  Calendar,
  CalendarRange,
  Upload,
  Files,
  Paperclip,
  PenSquare,
  Home,
  Star,
  Grid3x3,
  Calculator,
  Heading,
  Info,
  Minus,
  Layers,
  Phone,
  Mail,
  Link,
  Clock,
  type LucideIcon,
} from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/shared/utils";
import { upsertBlock } from "@/lib/organizer/templates.functions";
import { type BlockType, blockTypeLabel, type OrganizerBlock } from "@/lib/organizer/schemas";

interface PaletteItem {
  type: BlockType;
  icon: LucideIcon;
  group: string;
}

const GROUP_STYLE: Record<string, { dot: string; label: string }> = {
  Structure: { dot: "bg-violet-400", label: "text-violet-600 dark:text-violet-400" },
  Text: { dot: "bg-blue-400", label: "text-blue-600 dark:text-blue-400" },
  Numbers: { dot: "bg-emerald-400", label: "text-emerald-600 dark:text-emerald-400" },
  Choices: { dot: "bg-amber-400", label: "text-amber-600 dark:text-amber-400" },
  Date: { dot: "bg-cyan-400", label: "text-cyan-600 dark:text-cyan-400" },
  Files: { dot: "bg-rose-400", label: "text-rose-600 dark:text-rose-400" },
};

const PALETTE: PaletteItem[] = [
  // Structure
  { type: "section", icon: Heading, group: "Structure" },
  { type: "subsection", icon: Layers, group: "Structure" },
  { type: "info", icon: Info, group: "Structure" },
  { type: "divider", icon: Minus, group: "Structure" },
  // Text
  { type: "short_text", icon: Type, group: "Text" },
  { type: "long_text", icon: AlignLeft, group: "Text" },
  { type: "rich_text", icon: FileText, group: "Text" },
  { type: "phone", icon: Phone, group: "Text" },
  { type: "email", icon: Mail, group: "Text" },
  { type: "url", icon: Link, group: "Text" },
  { type: "time", icon: Clock, group: "Text" },
  // Numbers
  { type: "number", icon: Hash, group: "Numbers" },
  { type: "currency", icon: DollarSign, group: "Numbers" },
  { type: "calculated", icon: Calculator, group: "Numbers" },
  // Choices
  { type: "yes_no", icon: ToggleLeft, group: "Choices" },
  { type: "single_choice", icon: CircleDot, group: "Choices" },
  { type: "multi_choice", icon: CheckSquare, group: "Choices" },
  { type: "rating", icon: Star, group: "Choices" },
  { type: "matrix", icon: Grid3x3, group: "Choices" },
  // Date
  { type: "date", icon: Calendar, group: "Date" },
  { type: "date_range", icon: CalendarRange, group: "Date" },
  // Files & advanced
  { type: "file_upload", icon: Upload, group: "Files" },
  { type: "multi_file", icon: Files, group: "Files" },
  { type: "attachment_request", icon: Paperclip, group: "Files" },
  { type: "signature", icon: PenSquare, group: "Files" },
  { type: "address", icon: Home, group: "Files" },
];

const DEFAULT_QUESTION_TEXT: Partial<Record<BlockType, string>> = {
  section: "New section",
  subsection: "New subsection",
  info: "",
  divider: "",
};

function defaultConfig(type: BlockType): Record<string, unknown> {
  switch (type) {
    case "single_choice":
    case "multi_choice":
      return {
        options: [
          { id: "opt1", label: "Option 1", value: "opt1" },
          { id: "opt2", label: "Option 2", value: "opt2" },
        ],
      };
    case "rating":
      return { max: 5 };
    case "matrix":
      return {
        selection: "single",
        rows: [
          { id: "r1", label: "Row 1" },
          { id: "r2", label: "Row 2" },
        ],
        columns: [
          { id: "c1", label: "Poor", value: "poor" },
          { id: "c2", label: "Good", value: "good" },
          { id: "c3", label: "Great", value: "great" },
        ],
      };
    case "signature":
      return { allowDrawn: true, allowTyped: true, requireFullName: false };
    case "multi_file":
      return { minFiles: 0, maxFiles: 10, maxSizeMb: 25, acceptedMime: [] };
    case "calculated":
      return { formula: "", precision: 2, displayAs: "number" };
    default:
      return {};
  }
}

interface Props {
  templateId: string;
  selectedBlock: OrganizerBlock | null;
  allBlocks: OrganizerBlock[];
  onAdded: (blockId: string) => void;
  onChanged: () => void;
}

export function BlockPalette({ templateId, selectedBlock, allBlocks, onAdded, onChanged }: Props) {
  const upsert = useServerFn(upsertBlock);
  const groups = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const item of PALETTE) {
      const arr = map.get(item.group) ?? [];
      arr.push(item);
      map.set(item.group, arr);
    }
    return Array.from(map.entries());
  }, []);

  const add = useMutation({
    mutationFn: async (type: BlockType) => {
      // Determine parent_id: drop into selected section, else top level.
      let parentId: string | null = null;
      if (type !== "section" && selectedBlock) {
        if (selectedBlock.block_type === "section") {
          parentId = selectedBlock.id;
        } else if (selectedBlock.parent_id) {
          parentId = selectedBlock.parent_id;
        }
      }
      const siblings = allBlocks.filter((b) => b.parent_id === parentId);
      const order_index = siblings.length;
      return upsert({
        data: {
          template_id: templateId,
          parent_id: parentId,
          block_type: type,
          order_index,
          question_text:
            DEFAULT_QUESTION_TEXT[type] !== undefined
              ? (DEFAULT_QUESTION_TEXT[type] ?? null)
              : "New question",
          config_json: defaultConfig(type),
        },
      });
    },
    onSuccess: (res) => {
      onChanged();
      onAdded(res.block.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="h-10 border-b border-border/50 px-3 flex items-center shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Blocks
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="py-2 px-2 space-y-3">
          {groups.map(([group, items]) => {
            const style = GROUP_STYLE[group] ?? {
              dot: "bg-muted-foreground",
              label: "text-muted-foreground",
            };
            return (
              <div key={group}>
                <div className="flex items-center gap-1.5 px-1.5 pb-1.5">
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", style.dot)} />
                  <span
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wider",
                      style.label,
                    )}
                  >
                    {group}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <button
                      key={item.type}
                      type="button"
                      draggable
                      disabled={add.isPending}
                      onClick={() => add.mutate(item.type)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/x-block-type", item.type);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-lg px-2.5 h-8 text-left text-xs font-medium transition-colors cursor-grab active:cursor-grabbing",
                        "text-muted-foreground hover:text-foreground hover:bg-muted/60 disabled:opacity-40",
                      )}
                      title={`Insert ${blockTypeLabel[item.type]}`}
                      aria-label={`Insert ${blockTypeLabel[item.type]}`}
                    >
                      <item.icon className={cn("h-3.5 w-3.5 shrink-0", style.label)} />
                      <span className="truncate">{blockTypeLabel[item.type]}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
