import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Minus,
  Table as TableIcon,
  Trello,
  Pencil,
  Calendar as CalendarIcon,
  ChevronRight,
  Info,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/shared/utils";

// ---------------------------------------------------------------------------
// Slash command items — the "/" block inserter, OneNote / Loop style.
// ---------------------------------------------------------------------------
export type SlashItem = {
  group: string;
  title: string;
  description: string;
  icon: LucideIcon;
  searchTerms: string;
  command: (props: { editor: Editor; range: Range }) => void;
};

const ITEMS: SlashItem[] = [
  {
    group: "Basic blocks",
    title: "Text",
    description: "Plain paragraph",
    icon: Type,
    searchTerms: "text paragraph plain body",
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    group: "Basic blocks",
    title: "Heading 1",
    description: "Large section heading",
    icon: Heading1,
    searchTerms: "h1 title big heading",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run(),
  },
  {
    group: "Basic blocks",
    title: "Heading 2",
    description: "Medium section heading",
    icon: Heading2,
    searchTerms: "h2 subtitle heading",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run(),
  },
  {
    group: "Basic blocks",
    title: "Heading 3",
    description: "Small heading",
    icon: Heading3,
    searchTerms: "h3 heading",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run(),
  },
  {
    group: "Basic blocks",
    title: "Bulleted list",
    description: "Simple bullet list",
    icon: List,
    searchTerms: "bullet unordered ul list point",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    group: "Basic blocks",
    title: "Numbered list",
    description: "Ordered, numbered list",
    icon: ListOrdered,
    searchTerms: "number ordered ol list",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    group: "Basic blocks",
    title: "Checklist",
    description: "Track tasks with checkboxes",
    icon: ListChecks,
    searchTerms: "todo task checkbox check tick list",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    group: "Basic blocks",
    title: "Quote",
    description: "Capture a quotation",
    icon: Quote,
    searchTerms: "quote blockquote citation",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    group: "Basic blocks",
    title: "Toggle",
    description: "Collapsible section with hidden content",
    icon: ChevronRight,
    searchTerms: "toggle collapsible expand fold details accordion",
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "toggleBlock",
          attrs: { open: true, summary: "Toggle" },
          content: [{ type: "paragraph" }],
        })
        .run(),
  },
  {
    group: "Insert",
    title: "Callout",
    description: "Info / warning / tip / success box",
    icon: Info,
    searchTerms: "callout alert info warning tip success note box",
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "calloutBlock",
          attrs: { variant: "info" },
          content: [{ type: "paragraph" }],
        })
        .run(),
  },
  {
    group: "Insert",
    title: "Divider",
    description: "Visual separator line",
    icon: Minus,
    searchTerms: "divider hr horizontal rule line separator",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    group: "Insert",
    title: "Table",
    description: "Insert a 3×3 table",
    icon: TableIcon,
    searchTerms: "table grid rows columns",
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    group: "Visual",
    title: "Kanban board",
    description: "Three-column drag board",
    icon: Trello,
    searchTerms: "kanban board column cards",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertContent({ type: "kanbanBlock" }).run(),
  },
  {
    group: "Visual",
    title: "Drawing",
    description: "Sketchpad canvas",
    icon: Pencil,
    searchTerms: "drawing sketch canvas paint draw",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertContent({ type: "drawingBlock" }).run(),
  },
  {
    group: "Visual",
    title: "Calendar",
    description: "Mini month calendar",
    icon: CalendarIcon,
    searchTerms: "calendar month date schedule",
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).insertContent({ type: "calendarBlock" }).run(),
  },
];

function getItems({ query }: { query: string }): SlashItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return ITEMS;
  return ITEMS.filter((it) => it.title.toLowerCase().includes(q) || it.searchTerms.includes(q));
}

// ---------------------------------------------------------------------------
// Floating menu (shadcn popover-styled command list)
// ---------------------------------------------------------------------------
type ListProps = {
  items: SlashItem[];
  command: (item: SlashItem) => void;
};

export type SlashListHandle = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

const SlashCommandList = forwardRef<SlashListHandle, ListProps>((props, ref) => {
  const [selected, setSelected] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelected(0), [props.items]);

  const select = (i: number) => {
    const item = props.items[i];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % Math.max(props.items.length, 1));
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((s) => (s - 1 + props.items.length) % Math.max(props.items.length, 1));
        return true;
      }
      if (event.key === "Enter") {
        select(selected);
        return true;
      }
      return false;
    },
  }));

  // Keep the highlighted row in view while navigating with the keyboard.
  useEffect(() => {
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (props.items.length === 0) {
    return (
      <div className="rounded-lg border bg-popover px-3 py-2.5 text-xs italic text-muted-foreground shadow-xl">
        No matching blocks
      </div>
    );
  }

  // Group items for rendering, preserving each item's absolute index.
  const groups: { name: string; items: { it: SlashItem; idx: number }[] }[] = [];
  props.items.forEach((it, idx) => {
    let g = groups.find((x) => x.name === it.group);
    if (!g) {
      g = { name: it.group, items: [] };
      groups.push(g);
    }
    g.items.push({ it, idx });
  });

  return (
    <div
      ref={containerRef}
      className="max-h-80 w-72 overflow-y-auto overflow-x-hidden rounded-lg border bg-popover p-1 text-sm shadow-xl"
    >
      {groups.map((g) => (
        <div key={g.name}>
          <p className="px-2 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            {g.name}
          </p>
          {g.items.map(({ it, idx }) => (
            <button
              key={it.title}
              type="button"
              data-index={idx}
              onMouseEnter={() => setSelected(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                select(idx);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                idx === selected ? "bg-accent" : "hover:bg-accent/50",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground",
                  idx === selected && "border-primary/40 text-primary",
                )}
              >
                <it.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {it.title}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {it.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
});
SlashCommandList.displayName = "SlashCommandList";

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------
const suggestion: Omit<SuggestionOptions<SlashItem>, "editor"> = {
  char: "/",
  startOfLine: false,
  allowSpaces: false,
  items: getItems,
  command: ({ editor, range, props }) => props.command({ editor, range }),
  render: () => {
    let component: ReactRenderer<SlashListHandle, ListProps> | null = null;
    let popup: TippyInstance[] | null = null;
    return {
      onStart: (props) => {
        component = new ReactRenderer(SlashCommandList, {
          props: {
            items: props.items as SlashItem[],
            command: (item: SlashItem) => props.command(item),
          },
          editor: props.editor,
        });
        const rect = props.clientRect?.();
        if (!rect) return;
        popup = tippy("body", {
          getReferenceClientRect: () => rect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
        });
      },
      onUpdate: (props) => {
        component?.updateProps({
          items: props.items as SlashItem[],
          command: (item: SlashItem) => props.command(item),
        });
        const rect = props.clientRect?.();
        if (rect) popup?.[0]?.setProps({ getReferenceClientRect: () => rect });
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") {
          popup?.[0]?.hide();
          return true;
        }
        return (
          component?.ref?.onKeyDown({ event: props.event as unknown as KeyboardEvent }) ?? false
        );
      },
      onExit: () => {
        popup?.[0]?.destroy();
        component?.destroy();
      },
    };
  },
};

export const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        ...suggestion,
      }),
    ];
  },
});
