import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import {
  CalendarDays,
  Plus,
  Tag as TagIcon,
  Trash2,
  Trello,
  User as UserIcon,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { searchProfilesForMention } from "@/lib/queries/global-dashboard.queries";
import { cn } from "@/lib/shared/utils";
import { BlockShell } from "./block-shell";

type Assignee = { id: string; name: string };
type Card = {
  id: string;
  text: string;
  assignee?: Assignee | null;
  due?: string | null; // YYYY-MM-DD
  labels?: string[];
};
type Column = { id: string; title: string; cards: Card[] };

const LABEL_COLORS: Record<string, string> = {
  red: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  blue: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20",
  gray: "bg-muted text-muted-foreground border-border",
};

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function emptyBoard(): Column[] {
  return [
    { id: uid("col"), title: "To do", cards: [] },
    { id: uid("col"), title: "In progress", cards: [] },
    { id: uid("col"), title: "Done", cards: [] },
  ];
}

/** Loop-style Kanban: full column + card CRUD, drag-between-columns, per-card assignee / due date / labels. */
export const KanbanBlock = Node.create({
  name: "kanbanBlock",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { columns: { default: emptyBoard() } };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="kanban-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "kanban-block" })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(KanbanView) as any;
  },
});

type DragRef = { colIdx: number; cardId: string } | null;

function KanbanView({ node, updateAttributes, editor, deleteNode }: NodeViewProps) {
  const editable = editor.isEditable;
  const columns: Column[] = Array.isArray(node.attrs.columns) ? node.attrs.columns : emptyBoard();
  const [drag, setDrag] = useState<DragRef>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [openCardKey, setOpenCardKey] = useState<string | null>(null);

  const patch = (cols: Column[]) => updateAttributes({ columns: cols });

  function moveCard(fromCol: number, cardId: string, toCol: number) {
    if (fromCol === toCol) return;
    const card = columns[fromCol]?.cards.find((c) => c.id === cardId);
    if (!card) return;
    patch(
      columns.map((c, i) => {
        if (i === fromCol) return { ...c, cards: c.cards.filter((k) => k.id !== cardId) };
        if (i === toCol) return { ...c, cards: [...c.cards, card] };
        return c;
      }),
    );
  }

  function updateCard(colIdx: number, cardId: string, patch2: Partial<Card>) {
    patch(
      columns.map((c, i) =>
        i === colIdx
          ? {
              ...c,
              cards: c.cards.map((k) => (k.id === cardId ? { ...k, ...patch2 } : k)),
            }
          : c,
      ),
    );
  }

  function addColumn() {
    patch([...columns, { id: uid("col"), title: "New column", cards: [] }]);
  }

  function removeColumn(idx: number) {
    if (columns.length <= 1) return;
    patch(columns.filter((_, i) => i !== idx));
  }

  return (
    <BlockShell
      icon={Trello}
      label="Kanban board"
      editable={editable}
      onDelete={() => deleteNode()}
      dataType="kanban-block"
      headerExtra={
        editable && (
          <button
            type="button"
            onClick={addColumn}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/30 px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:bg-background hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> Column
          </button>
        )
      }
    >
      <div
        className={cn(
          "grid gap-2",
          columns.length <= 3 && "grid-cols-3",
          columns.length === 4 && "grid-cols-4",
          columns.length >= 5 && "grid-cols-5",
        )}
      >
        {columns.map((col, ci) => (
          <ColumnView
            key={col.id}
            col={col}
            colIdx={ci}
            editable={editable}
            canRemove={columns.length > 1}
            isDropTarget={hoverCol === ci && drag !== null && drag.colIdx !== ci}
            openCardKey={openCardKey}
            setOpenCardKey={setOpenCardKey}
            onTitleChange={(v) => patch(columns.map((c, i) => (i === ci ? { ...c, title: v } : c)))}
            onAddCard={(text) =>
              patch(
                columns.map((c, i) =>
                  i === ci ? { ...c, cards: [...c.cards, { id: uid("card"), text }] } : c,
                ),
              )
            }
            onRemoveCard={(cardId) =>
              patch(
                columns.map((c, i) =>
                  i === ci ? { ...c, cards: c.cards.filter((k) => k.id !== cardId) } : c,
                ),
              )
            }
            onUpdateCard={(cardId, p) => updateCard(ci, cardId, p)}
            onRemoveColumn={() => removeColumn(ci)}
            onDragStartCard={(cardId) => setDrag({ colIdx: ci, cardId })}
            onDragEndCard={() => {
              setDrag(null);
              setHoverCol(null);
            }}
            onDragOverCol={(e) => {
              if (!drag) return;
              e.preventDefault();
              setHoverCol(ci);
            }}
            onDropCol={(e) => {
              if (!drag) return;
              e.preventDefault();
              moveCard(drag.colIdx, drag.cardId, ci);
              setDrag(null);
              setHoverCol(null);
            }}
          />
        ))}
      </div>
    </BlockShell>
  );
}

function ColumnView({
  col,
  colIdx,
  editable,
  canRemove,
  isDropTarget,
  openCardKey,
  setOpenCardKey,
  onTitleChange,
  onAddCard,
  onRemoveCard,
  onUpdateCard,
  onRemoveColumn,
  onDragStartCard,
  onDragEndCard,
  onDragOverCol,
  onDropCol,
}: {
  col: Column;
  colIdx: number;
  editable: boolean;
  canRemove: boolean;
  isDropTarget: boolean;
  openCardKey: string | null;
  setOpenCardKey: (k: string | null) => void;
  onTitleChange: (v: string) => void;
  onAddCard: (text: string) => void;
  onRemoveCard: (id: string) => void;
  onUpdateCard: (id: string, p: Partial<Card>) => void;
  onRemoveColumn: () => void;
  onDragStartCard: (cardId: string) => void;
  onDragEndCard: () => void;
  onDragOverCol: (e: React.DragEvent) => void;
  onDropCol: (e: React.DragEvent) => void;
}) {
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  return (
    <div
      className={cn(
        "rounded-lg bg-muted/40 p-2 transition-colors",
        isDropTarget && "bg-primary/10 ring-2 ring-dashed ring-primary/50",
      )}
      onDragOver={editable ? onDragOverCol : undefined}
      onDrop={editable ? onDropCol : undefined}
    >
      <div className="mb-2 flex items-center gap-1">
        {editable ? (
          <Input
            value={col.title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="h-6 flex-1 border-0 bg-transparent px-1 text-xs font-semibold uppercase tracking-wide shadow-none focus-visible:ring-0"
          />
        ) : (
          <p className="flex-1 px-1 text-xs font-semibold uppercase tracking-wide">{col.title}</p>
        )}
        {editable && canRemove && (
          <button
            type="button"
            onClick={onRemoveColumn}
            title="Delete column"
            aria-label="Delete column"
            className="rounded p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:bg-accent hover:text-rose-600 group-hover:opacity-100"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      <ul className="space-y-1.5 min-h-[40px]">
        {col.cards.length === 0 && (
          <li className="flex items-center justify-center rounded border border-dashed border-muted-foreground/20 px-2 py-3 text-[11px] italic text-muted-foreground/60">
            Drop cards here
          </li>
        )}
        {col.cards.map((c) => {
          const cardKey = `${colIdx}:${c.id}`;
          const isOpen = openCardKey === cardKey;
          return (
            <li
              key={c.id}
              draggable={editable && !isOpen}
              onDragStart={(e) => {
                if (!editable) return;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", c.id);
                onDragStartCard(c.id);
              }}
              onDragEnd={onDragEndCard}
              className={cn(
                "group/card rounded-md border bg-background shadow-sm transition-shadow hover:shadow-md",
                editable && !isOpen && "cursor-grab active:cursor-grabbing",
              )}
            >
              <CardView
                card={c}
                editable={editable}
                isOpen={isOpen}
                onOpen={() => setOpenCardKey(isOpen ? null : cardKey)}
                onChange={(p) => onUpdateCard(c.id, p)}
                onDelete={() => {
                  onRemoveCard(c.id);
                  setOpenCardKey(null);
                }}
              />
            </li>
          );
        })}
      </ul>
      {editable &&
        (adding ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = draft.trim();
              if (!t) {
                setAdding(false);
                return;
              }
              onAddCard(t);
              setDraft("");
              setAdding(false);
            }}
            className="mt-1.5"
          >
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                if (!draft.trim()) setAdding(false);
              }}
              placeholder="Card text…"
              className="h-7 text-xs"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-full border border-dashed border-muted-foreground/30 px-2 py-1 text-[11px] text-muted-foreground hover:border-primary/50 hover:bg-background hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> Add card
          </button>
        ))}
    </div>
  );
}

function CardView({
  card,
  editable,
  isOpen,
  onOpen,
  onChange,
  onDelete,
}: {
  card: Card;
  editable: boolean;
  isOpen: boolean;
  onOpen: () => void;
  onChange: (p: Partial<Card>) => void;
  onDelete: () => void;
}) {
  const labels = card.labels ?? [];
  return (
    <div className="px-2 py-1.5 text-xs">
      {labels.length > 0 && (
        <div className="mb-1 flex flex-wrap gap-1">
          {labels.map((l) => (
            <span
              key={l}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium",
                LABEL_COLORS[l] ?? LABEL_COLORS.gray,
              )}
            >
              {l}
              {editable && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({ labels: labels.filter((x) => x !== l) });
                  }}
                  className="opacity-70 hover:opacity-100"
                  aria-label={`Remove label ${l}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-start gap-1">
        {editable && isOpen ? (
          <textarea
            value={card.text}
            onChange={(e) => onChange({ text: e.target.value })}
            rows={2}
            className="flex-1 resize-none rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
        ) : (
          <button
            type="button"
            onClick={editable ? onOpen : undefined}
            className="flex-1 whitespace-pre-wrap text-left"
          >
            {card.text || <span className="italic text-muted-foreground/60">Empty card</span>}
          </button>
        )}
        {editable && (
          <button
            type="button"
            onClick={onDelete}
            className="opacity-0 transition-opacity group-hover/card:opacity-100"
            aria-label="Remove card"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]">
        {card.assignee && (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0 text-primary">
            <UserIcon className="h-2.5 w-2.5" />
            {card.assignee.name}
          </span>
        )}
        {card.due && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0 text-muted-foreground">
            <CalendarDays className="h-2.5 w-2.5" />
            {format(parseISO(card.due), "MMM d")}
          </span>
        )}
        {editable && (
          <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100">
            <AssigneePicker card={card} onChange={onChange} />
            <DuePicker card={card} onChange={onChange} />
            <LabelPicker card={card} onChange={onChange} />
          </div>
        )}
      </div>
    </div>
  );
}

function AssigneePicker({ card, onChange }: { card: Card; onChange: (p: Partial<Card>) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const rows = await searchProfilesForMention(q);
      setResults(rows.map((r) => ({ id: r.id, name: r.full_name ?? r.email ?? "Unknown" })));
    }, 150);
    return () => clearTimeout(t);
  }, [q, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Assign"
        >
          <UserIcon className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search people…"
          className="h-7 text-xs"
        />
        <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
          {results.length === 0 ? (
            <li className="px-1 py-2 text-[11px] italic text-muted-foreground">No matches</li>
          ) : (
            results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange({ assignee: { id: r.id, name: r.name } });
                    setOpen(false);
                  }}
                  className="w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  {r.name}
                </button>
              </li>
            ))
          )}
        </ul>
        {card.assignee && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 w-full text-[11px] text-muted-foreground"
            onClick={() => {
              onChange({ assignee: null });
              setOpen(false);
            }}
          >
            Clear assignee
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DuePicker({ card, onChange }: { card: Card; onChange: (p: Partial<Card>) => void }) {
  const [open, setOpen] = useState(false);
  const date = card.due ? parseISO(card.due) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Due date"
        >
          <CalendarDays className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d) => {
            onChange({ due: d ? format(d, "yyyy-MM-dd") : null });
            setOpen(false);
          }}
          initialFocus
        />
        {card.due && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-[11px] text-muted-foreground"
              onClick={() => {
                onChange({ due: null });
                setOpen(false);
              }}
            >
              Clear due date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function LabelPicker({ card, onChange }: { card: Card; onChange: (p: Partial<Card>) => void }) {
  const [open, setOpen] = useState(false);
  const current = new Set(card.labels ?? []);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Labels"
        >
          <TagIcon className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-2" align="end">
        <ul className="space-y-0.5">
          {Object.keys(LABEL_COLORS).map((l) => {
            const on = current.has(l);
            return (
              <li key={l}>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(current);
                    if (on) next.delete(l);
                    else next.add(l);
                    onChange({ labels: Array.from(next) });
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded border px-2 py-1 text-[11px]",
                    LABEL_COLORS[l],
                  )}
                >
                  <span className="capitalize">{l}</span>
                  {on && <span>✓</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
