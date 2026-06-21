import { useEffect, useMemo, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import ResizableImage from "tiptap-extension-resize-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Italic,
  UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Image as ImageIcon,
  Highlighter,
  Quote,
  Undo,
  Redo,
  Type,
  CaseSensitive,
  Indent,
  Outdent,
  Link as LinkIcon,
  Unlink,
  Table as TableIcon,
  Rows3,
  Columns3,
  Trash2,
  ChevronDown,
  Heading as HeadingIcon,
  ALargeSmall,
  MoveVertical,
  AlignVerticalSpaceAround,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/shared/utils";
import { safeHref } from "@/lib/routing/safe-href";
import { toast } from "sonner";

// -- Fonts: Aptos first (Word default), then web-safe fallbacks ------------------
const FONT_FAMILIES = [
  { label: "Aptos (Body)", value: "Aptos, Inter, system-ui, sans-serif" },
  {
    label: "Aptos Display (Heading)",
    value: "'Aptos Display', Aptos, Inter, system-ui, sans-serif",
  },
  { label: "Inter", value: "Inter, sans-serif" },
  { label: "Sans", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif", value: "ui-serif, Georgia, serif" },
  { label: "Times", value: "'Times New Roman', Times, serif" },
  { label: "Calibri", value: "Calibri, 'Segoe UI', sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Mono", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
];

const FONT_SIZES = ["10", "11", "12", "14", "16", "18", "20", "24", "28", "32", "36", "48", "72"];

// Word-like 40-swatch palette (theme + standard rows).
const TEXT_COLORS = [
  "#000000",
  "#1F1F1F",
  "#3F3F3F",
  "#5F5F5F",
  "#7F7F7F",
  "#9F9F9F",
  "#BFBFBF",
  "#FFFFFF",
  "#7B1D1D",
  "#C53030",
  "#E53E3E",
  "#F6AD55",
  "#ECC94B",
  "#48BB78",
  "#38B2AC",
  "#3182CE",
  "#2C5282",
  "#1A365D",
  "#553C9A",
  "#805AD5",
  "#D53F8C",
  "#B83280",
  "#702459",
  "#9B2C2C",
  "#C05621",
  "#DD6B20",
  "#D69E2E",
  "#B7791F",
  "#2F855A",
  "#276749",
  "#234E52",
  "#2A4365",
  "#1E3A8A",
  "#3730A3",
  "#5B21B6",
  "#86198F",
  "#831843",
  "#7C2D12",
  "#374151",
  "#0F172A",
];
const HIGHLIGHT_COLORS = [
  "#FEF08A",
  "#FDE68A",
  "#FCA5A5",
  "#F9A8D4",
  "#C4B5FD",
  "#A5B4FC",
  "#93C5FD",
  "#67E8F9",
  "#6EE7B7",
  "#BBF7D0",
  "#D9F99D",
  "#FED7AA",
  "#E5E7EB",
  "#FECACA",
  "#DDD6FE",
  "#FBCFE8",
];

// -- Custom extension: per-block attributes (line-height, indent, spacing) ------
const BlockAttrs = Extension.create({
  name: "blockAttrs",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.lineHeight || null,
            renderHTML: (attrs) =>
              attrs.lineHeight ? { style: `line-height:${attrs.lineHeight}` } : {},
          },
          textIndent: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.marginLeft || null,
            renderHTML: (attrs) =>
              attrs.textIndent ? { style: `margin-left:${attrs.textIndent}` } : {},
          },
          spaceBefore: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.marginTop || null,
            renderHTML: (attrs) =>
              attrs.spaceBefore ? { style: `margin-top:${attrs.spaceBefore}` } : {},
          },
          spaceAfter: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.marginBottom || null,
            renderHTML: (attrs) =>
              attrs.spaceAfter ? { style: `margin-bottom:${attrs.spaceAfter}` } : {},
          },
        },
      },
    ];
  },
});

// -- Editor build -------------------------------------------------------------
/**
 * Toolbar-only formatting extensions (no StarterKit, no Table).
 * Exported so other editors (Daily Notes) can mount the same Toolbar
 * without duplicating StarterKit / Table they already configure.
 */

export function buildFormatExtras(opts: { withImage?: boolean } = {}): any[] {
  const extras: any[] = [
    TextStyle,
    Color,
    FontFamily,
    FontSize,
    BlockAttrs,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Link.configure({
      openOnClick: true,
      HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
    }),
  ];
  if (opts.withImage) extras.push(ResizableImage.configure({ inline: false, allowBase64: true }));
  return extras;
}

function buildExtensions(compact: boolean) {
  const base: any[] = [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
    ...buildFormatExtras({ withImage: !compact }),
  ];
  if (!compact) {
    base.push(Table.configure({ resizable: true }), TableRow, TableHeader, TableCell);
  }
  return base;
}

async function uploadImage(file: File): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to upload images");
  const ext = file.name.split(".").pop() || "png";
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("note-images").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("note-images").getPublicUrl(path);
  return data.publicUrl;
}

// -- Tiny building blocks ----------------------------------------------------
function ToolbarBtn({
  on,
  active,
  title,
  disabled,
  children,
}: {
  on: () => void;
  active?: boolean;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant={active ? "secondary" : "ghost"}
      className="h-7 w-7"
      onClick={on}
      title={title}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

function ColorPicker({
  swatches,
  value,
  onPick,
  onClear,
  title,
  icon,
  current,
}: {
  swatches: string[];
  value?: string;
  onPick: (c: string) => void;
  onClear: () => void;
  title: string;
  icon: React.ReactNode;
  current?: string;
}) {
  const [hex, setHex] = useState(value ?? "#000000");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-1.5 gap-0.5"
          title={title}
        >
          <div className="flex flex-col items-center">
            {icon}
            <span
              className="block h-1 w-4 rounded-sm"
              style={{
                background: current ?? "transparent",
                border: current ? "none" : "1px dashed currentColor",
              }}
            />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="grid grid-cols-8 gap-1">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onPick(c)}
              className="h-5 w-5 rounded-sm border border-border/60 hover:scale-110 transition-transform"
              style={{ background: c }}
              title={c}
              aria-label={c}
            />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <Input
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            className="h-7 w-9 p-0.5"
          />
          <Input
            type="text"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            placeholder="#RRGGBB"
            className="h-7 text-xs flex-1"
          />
          <Button type="button" size="sm" className="h-7" onClick={() => onPick(hex)}>
            Apply
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="mt-1 h-7 w-full text-xs"
          onClick={onClear}
        >
          Clear
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function TableGridPicker({ onInsert }: { onInsert: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [open, setOpen] = useState(false);
  const ROWS = 8,
    COLS = 10;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Insert table">
          <TableIcon className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="text-[11px] font-medium mb-1 text-center">
          {hover.r > 0 ? `${hover.r} × ${hover.c} table` : "Pick size"}
        </div>
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${COLS}, 16px)` }}>
          {Array.from({ length: ROWS }).flatMap((_, r) =>
            Array.from({ length: COLS }).map((_, c) => {
              const active = r < hover.r && c < hover.c;
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  className={cn(
                    "h-4 w-4 rounded-[2px] border transition-colors",
                    active
                      ? "bg-primary border-primary"
                      : "bg-muted border-border hover:bg-muted-foreground/20",
                  )}
                  onMouseEnter={() => setHover({ r: r + 1, c: c + 1 })}
                  onClick={() => {
                    onInsert(r + 1, c + 1);
                    setOpen(false);
                  }}
                />
              );
            }),
          )}
        </div>
        <div className="mt-2 flex justify-between gap-2">
          <CustomTableDialog
            onInsert={(r, c) => {
              onInsert(r, c);
              setOpen(false);
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CustomTableDialog({ onInsert }: { onInsert: (r: number, c: number) => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs">
          Insert Table…
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Insert table</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Rows</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={rows}
              onChange={(e) => setRows(Number(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Columns</Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={cols}
              onChange={(e) => setCols(Number(e.target.value) || 1)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onInsert(rows, cols);
              setOpen(false);
            }}
          >
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -- Bubble group chrome (used by bubbles variant) ----------------------------
function BubbleGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-border/60 bg-card pl-2 pr-1.5 shadow-sm ring-1 ring-foreground/5"
      title={label}
    >
      <span className="select-none text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </span>
      <span className="h-3 w-px bg-border" />
      <div className="flex items-center gap-0.5">{children}</div>
    </div>
  );
}

// -- Main toolbar ------------------------------------------------------------
export function Toolbar({
  editor,
  compact,
  bare = false,
  bubbles = false,
}: {
  editor: Editor | null;
  compact: boolean;
  bare?: boolean;
  bubbles?: boolean;
}) {
  if (!editor) return null;

  const inList = editor.isActive("bulletList") || editor.isActive("orderedList");
  const inTable = editor.isActive("table");
  const linkActive = editor.isActive("link");

  const setFontFam = (v: string) => {
    if (!v || v === "default") editor.chain().focus().unsetFontFamily().run();
    else editor.chain().focus().setFontFamily(v).run();
  };
  const setFontSize = (size: string) => editor.chain().focus().setFontSize(`${size}px`).run();

  const applyBlockAttr = (
    key: "lineHeight" | "textIndent" | "spaceBefore" | "spaceAfter",
    value: string | null,
  ) => {
    const { state, view } = editor;
    const { from, to } = state.selection;
    const tr = state.tr;
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type.name === "paragraph" || node.type.name === "heading") {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, [key]: value });
      }
      return true;
    });
    view.dispatch(tr);
    editor.chain().focus().run();
  };

  const indent = () => {
    if (inList) {
      editor.chain().focus().sinkListItem("listItem").run();
      return;
    }
    // Read current indent and increase by 24px
    const attrs = editor.getAttributes("paragraph") || editor.getAttributes("heading");
    const cur = parseInt(String(attrs.textIndent || "0"), 10) || 0;
    applyBlockAttr("textIndent", `${cur + 24}px`);
  };
  const outdent = () => {
    if (inList) {
      editor.chain().focus().liftListItem("listItem").run();
      return;
    }
    const attrs = editor.getAttributes("paragraph") || editor.getAttributes("heading");
    const cur = parseInt(String(attrs.textIndent || "0"), 10) || 0;
    const next = Math.max(0, cur - 24);
    applyBlockAttr("textIndent", next > 0 ? `${next}px` : null);
  };

  const styleValue = editor.isActive("heading", { level: 1 })
    ? "1"
    : editor.isActive("heading", { level: 2 })
      ? "2"
      : editor.isActive("heading", { level: 3 })
        ? "3"
        : editor.isActive("heading", { level: 4 })
          ? "4"
          : "p";

  // Reflect the current selection's formatting in the toolbar (MS-Word style).
  const currentFontFamily =
    (editor.getAttributes("textStyle").fontFamily as string | undefined) ?? undefined;
  const currentFontSize = (() => {
    const v = editor.getAttributes("textStyle").fontSize as string | undefined;
    if (!v) return undefined;
    const m = /(\d+)/.exec(v);
    return m ? m[1] : undefined;
  })();
  const currentBlockAttrs =
    editor.getAttributes("paragraph")?.lineHeight !== undefined
      ? editor.getAttributes("paragraph")
      : editor.getAttributes("heading");
  const currentLineHeight = currentBlockAttrs?.lineHeight
    ? String(currentBlockAttrs.lineHeight)
    : undefined;
  const currentSpacing = (() => {
    const before = parseInt(String(currentBlockAttrs?.spaceBefore || "0"), 10) || 0;
    const after = parseInt(String(currentBlockAttrs?.spaceAfter || "0"), 10) || 0;
    return `${before}:${after}`;
  })();

  const insertImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const url = await uploadImage(file);
        (editor.chain().focus() as any).setImage({ src: url }).run();
      } catch (e) {
        toast.error((e as Error).message);
      }
    };
    input.click();
  };

  const promptLink = () => {
    const current = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", current ?? "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const safe = safeHref(url);
    if (!safe) {
      toast.error("Invalid or unsupported URL");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: safe }).run();
  };

  const transformText = (t: string, mode: "upper" | "lower" | "title") => {
    if (mode === "upper") return t.toUpperCase();
    if (mode === "lower") return t.toLowerCase();
    return t.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  };
  const changeCase = (mode: "upper" | "lower" | "title") => {
    const { state, view } = editor;
    const { from, to } = state.selection;
    if (from === to) return;
    const tr = state.tr;
    const edits: {
      from: number;
      to: number;
      text: string;
      marks: ReturnType<typeof state.schema.text>["marks"];
    }[] = [];
    state.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText || !node.text) return;
      const start = Math.max(pos, from);
      const end = Math.min(pos + node.nodeSize, to);
      const slice = node.text.slice(start - pos, end - pos);
      if (!slice) return;
      edits.push({ from: start, to: end, text: transformText(slice, mode), marks: node.marks });
    });
    for (const e of edits.reverse()) {
      tr.replaceWith(e.from, e.to, state.schema.text(e.text, e.marks));
    }
    if (edits.length) {
      view.dispatch(tr);
      editor.chain().focus().run();
    }
  };

  const currentColor = (editor.getAttributes("textStyle").color as string | undefined) ?? undefined;
  const currentHl = (editor.getAttributes("highlight").color as string | undefined) ?? undefined;

  if (bubbles) {
    const Sep = () => <span className="mx-0.5 h-4 w-px bg-border/40" />;
    const IconTrigger = ({
      icon,
      title,
      width = 32,
    }: {
      icon: React.ReactNode;
      title: string;
      width?: number;
    }) => (
      <SelectTrigger
        title={title}
        className="h-7 border-0 bg-transparent px-1 text-xs shadow-none focus:ring-0 [&>svg.lucide-chevron-down]:hidden hover:bg-accent/40 rounded-md"
        style={{ width }}
      >
        <span className="flex items-center">{icon}</span>
      </SelectTrigger>
    );
    const alignActive: "left" | "center" | "right" | "justify" = editor.isActive({
      textAlign: "center",
    })
      ? "center"
      : editor.isActive({ textAlign: "right" })
        ? "right"
        : editor.isActive({ textAlign: "justify" })
          ? "justify"
          : "left";
    const AlignIcon =
      alignActive === "center"
        ? AlignCenter
        : alignActive === "right"
          ? AlignRight
          : alignActive === "justify"
            ? AlignJustify
            : AlignLeft;
    return (
      <div className="flex flex-wrap items-center gap-1 px-2 py-1">
        {/* ── Block ── style, font, size, line height — icon triggers only */}
        <BubbleGroup label="Block">
          <Select
            value={styleValue}
            onValueChange={(v) =>
              v === "p"
                ? editor.chain().focus().setParagraph().run()
                : editor
                    .chain()
                    .focus()
                    .setHeading({ level: Number(v) as 1 | 2 | 3 | 4 })
                    .run()
            }
          >
            <IconTrigger
              title={`Style: ${styleValue === "p" ? "Paragraph" : `Heading ${styleValue}`}`}
              icon={<HeadingIcon className="h-3.5 w-3.5" />}
            />
            <SelectContent>
              <SelectItem value="p">Paragraph</SelectItem>
              <SelectItem value="1">Heading 1</SelectItem>
              <SelectItem value="2">Heading 2</SelectItem>
              <SelectItem value="3">Heading 3</SelectItem>
              <SelectItem value="4">Heading 4</SelectItem>
            </SelectContent>
          </Select>
          <Sep />
          <Select value={currentFontFamily || undefined} onValueChange={setFontFam}>
            <IconTrigger
              title={`Font family${currentFontFamily ? `: ${currentFontFamily}` : ""}`}
              icon={<Type className="h-3.5 w-3.5" />}
            />
            <SelectContent>
              {FONT_FAMILIES.map((f) => (
                <SelectItem key={f.label} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Sep />
          <Select value={currentFontSize || undefined} onValueChange={setFontSize}>
            <IconTrigger
              title={`Font size${currentFontSize ? `: ${currentFontSize}px` : ""}`}
              icon={<ALargeSmall className="h-3.5 w-3.5" />}
            />
            <SelectContent>
              {FONT_SIZES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Sep />
          <Select
            value={currentLineHeight || undefined}
            onValueChange={(v) => applyBlockAttr("lineHeight", v === "__reset" ? null : v)}
          >
            <IconTrigger
              title={`Line spacing${currentLineHeight ? `: ${currentLineHeight}×` : ""}`}
              icon={<MoveVertical className="h-3.5 w-3.5" />}
            />
            <SelectContent>
              <SelectItem value="__reset">Reset</SelectItem>
              {["1", "1.15", "1.5", "1.75", "2", "2.5", "3"].map((h) => (
                <SelectItem key={h} value={h}>
                  {h}×
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={currentSpacing === "0:0" ? undefined : currentSpacing}
            onValueChange={(v) => {
              const [before, after] = v.split(":");
              applyBlockAttr("spaceBefore", before === "0" ? null : `${before}px`);
              applyBlockAttr("spaceAfter", after === "0" ? null : `${after}px`);
            }}
          >
            <IconTrigger
              title={`Paragraph spacing (${currentSpacing})`}
              icon={<AlignVerticalSpaceAround className="h-3.5 w-3.5" />}
            />
            <SelectContent>
              <SelectItem value="0:0">None (0 / 0)</SelectItem>
              <SelectItem value="6:6">Small (6 / 6)</SelectItem>
              <SelectItem value="12:12">Medium (12 / 12)</SelectItem>
              <SelectItem value="18:18">Large (18 / 18)</SelectItem>
              <SelectItem value="0:12">After only (0 / 12)</SelectItem>
              <SelectItem value="12:0">Before only (12 / 0)</SelectItem>
            </SelectContent>
          </Select>
        </BubbleGroup>

        {/* ── Outline ── undo/redo, lists, indent, blockquote */}
        <BubbleGroup label="Outline">
          <ToolbarBtn on={() => editor.chain().focus().undo().run()} title="Undo">
            <Undo className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn on={() => editor.chain().focus().redo().run()} title="Redo">
            <Redo className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <Sep />
          <ToolbarBtn
            on={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="Bullet list"
          >
            <List className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            on={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            title="Numbered list"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn on={indent} title="Increase indent">
            <Indent className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn on={outdent} title="Decrease indent">
            <Outdent className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            on={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive("blockquote")}
            title="Quote"
          >
            <Quote className="h-3.5 w-3.5" />
          </ToolbarBtn>
        </BubbleGroup>

        {/* ── Edit ── inline formatting, colors, alignment, links */}
        <BubbleGroup label="Edit">
          <ToolbarBtn
            on={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            on={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            on={() => editor.chain().focus().toggleUnderline().run()}
            active={editor.isActive("underline")}
            title="Underline"
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            on={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")}
            title="Strike"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <Sep />
          <ColorPicker
            title="Text color"
            icon={<Type className="h-3.5 w-3.5" />}
            swatches={TEXT_COLORS}
            value={currentColor}
            current={currentColor}
            onPick={(c) => editor.chain().focus().setColor(c).run()}
            onClear={() => editor.chain().focus().unsetColor().run()}
          />
          <ColorPicker
            title="Highlight"
            icon={<Highlighter className="h-3.5 w-3.5" />}
            swatches={HIGHLIGHT_COLORS}
            value={currentHl}
            current={currentHl}
            onPick={(c) => (editor.chain().focus() as any).toggleHighlight({ color: c }).run()}
            onClear={() => (editor.chain().focus() as any).unsetHighlight().run()}
          />
          <Select onValueChange={(v) => changeCase(v as "upper" | "lower" | "title")}>
            <SelectTrigger
              className="h-7 w-[34px] border-0 bg-transparent px-1 text-xs shadow-none focus:ring-0 [&>svg.lucide-chevron-down]:hidden hover:bg-accent/40 rounded-md"
              title="Change case"
            >
              <CaseSensitive className="h-3.5 w-3.5" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upper">UPPERCASE</SelectItem>
              <SelectItem value="lower">lowercase</SelectItem>
              <SelectItem value="title">Title Case</SelectItem>
            </SelectContent>
          </Select>
          <Sep />
          <Select
            value={alignActive}
            onValueChange={(v) => (editor.chain().focus() as any).setTextAlign(v).run()}
          >
            <SelectTrigger
              title={`Align: ${alignActive}`}
              className="h-7 w-[42px] border-0 bg-transparent px-1 text-xs shadow-none focus:ring-0 [&>svg.lucide-chevron-down]:hidden hover:bg-accent/40 rounded-md"
            >
              <span className="flex items-center">
                <AlignIcon className="h-3.5 w-3.5" />
              </span>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="left">
                <span className="inline-flex items-center gap-2">
                  <AlignLeft className="h-3.5 w-3.5" />
                  Left
                </span>
              </SelectItem>
              <SelectItem value="center">
                <span className="inline-flex items-center gap-2">
                  <AlignCenter className="h-3.5 w-3.5" />
                  Center
                </span>
              </SelectItem>
              <SelectItem value="right">
                <span className="inline-flex items-center gap-2">
                  <AlignRight className="h-3.5 w-3.5" />
                  Right
                </span>
              </SelectItem>
              <SelectItem value="justify">
                <span className="inline-flex items-center gap-2">
                  <AlignJustify className="h-3.5 w-3.5" />
                  Justify
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          <Sep />
          <ToolbarBtn on={promptLink} active={linkActive} title="Add / edit link">
            <LinkIcon className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            on={() => editor.chain().focus().unsetLink().run()}
            disabled={!linkActive}
            title="Remove link"
          >
            <Unlink className="h-3.5 w-3.5" />
          </ToolbarBtn>
          {!compact && (
            <>
              <ToolbarBtn on={insertImage} title="Insert image">
                <ImageIcon className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <TableGridPicker
                onInsert={(rows, cols) =>
                  editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
                }
              />
            </>
          )}
          {inTable && !compact && (
            <>
              <Sep />
              <span className="px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Table
              </span>
              <ToolbarBtn
                on={() => editor.chain().focus().addRowAfter().run()}
                title="Add row below"
              >
                <Rows3 className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn
                on={() => editor.chain().focus().addColumnAfter().run()}
                title="Add column right"
              >
                <Columns3 className="h-3.5 w-3.5" />
              </ToolbarBtn>
              <ToolbarBtn on={() => editor.chain().focus().deleteRow().run()} title="Delete row">
                <Rows3 className="h-3.5 w-3.5 text-destructive" />
              </ToolbarBtn>
              <ToolbarBtn
                on={() => editor.chain().focus().deleteColumn().run()}
                title="Delete column"
              >
                <Columns3 className="h-3.5 w-3.5 text-destructive" />
              </ToolbarBtn>
              <ToolbarBtn
                on={() => editor.chain().focus().mergeOrSplit().run()}
                title="Merge / split cells"
              >
                M↔S
              </ToolbarBtn>
              <ToolbarBtn
                on={() => editor.chain().focus().toggleHeaderRow().run()}
                title="Toggle header row"
              >
                H
              </ToolbarBtn>
              <ToolbarBtn
                on={() => editor.chain().focus().deleteTable().run()}
                title="Delete table"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </ToolbarBtn>
            </>
          )}
        </BubbleGroup>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-0.5 px-2 py-1.5",
        bare ? "border-0 bg-transparent" : "border-b border-border/60 bg-muted/30 rounded-t-md",
      )}
    >
      <ToolbarBtn on={() => editor.chain().focus().undo().run()} title="Undo">
        <Undo className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn on={() => editor.chain().focus().redo().run()} title="Redo">
        <Redo className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <span className="mx-1 h-5 w-px bg-border" />

      <Select
        value={styleValue}
        onValueChange={(v) =>
          v === "p"
            ? editor.chain().focus().setParagraph().run()
            : editor
                .chain()
                .focus()
                .setHeading({ level: Number(v) as 1 | 2 | 3 | 4 })
                .run()
        }
      >
        <SelectTrigger className="h-7 w-[105px] text-xs">
          <SelectValue placeholder="Style" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="p">Paragraph</SelectItem>
          <SelectItem value="1">Heading 1</SelectItem>
          <SelectItem value="2">Heading 2</SelectItem>
          <SelectItem value="3">Heading 3</SelectItem>
          <SelectItem value="4">Heading 4</SelectItem>
        </SelectContent>
      </Select>

      <Select onValueChange={setFontFam}>
        <SelectTrigger className="h-7 w-[140px] text-xs">
          <SelectValue placeholder="Font" />
        </SelectTrigger>
        <SelectContent>
          {FONT_FAMILIES.map((f) => (
            <SelectItem key={f.label} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select onValueChange={setFontSize}>
        <SelectTrigger className="h-7 w-[64px] text-xs">
          <SelectValue placeholder="Size" />
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZES.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="mx-1 h-5 w-px bg-border" />

      <ToolbarBtn
        on={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Bold"
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        on={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Italic"
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        on={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Underline"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        on={() => editor.chain().focus().toggleStrike().run()}
        active={editor.isActive("strike")}
        title="Strike"
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarBtn>

      <ColorPicker
        title="Text color"
        icon={<Type className="h-3.5 w-3.5" />}
        swatches={TEXT_COLORS}
        value={currentColor}
        current={currentColor}
        onPick={(c) => editor.chain().focus().setColor(c).run()}
        onClear={() => editor.chain().focus().unsetColor().run()}
      />
      <ColorPicker
        title="Highlight"
        icon={<Highlighter className="h-3.5 w-3.5" />}
        swatches={HIGHLIGHT_COLORS}
        value={currentHl}
        current={currentHl}
        onPick={(c) => (editor.chain().focus() as any).toggleHighlight({ color: c }).run()}
        onClear={() => (editor.chain().focus() as any).unsetHighlight().run()}
      />

      <span className="mx-1 h-5 w-px bg-border" />

      <ToolbarBtn
        on={() => (editor.chain().focus() as any).setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
        title="Left"
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        on={() => (editor.chain().focus() as any).setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
        title="Center"
      >
        <AlignCenter className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        on={() => (editor.chain().focus() as any).setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
        title="Right"
      >
        <AlignRight className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        on={() => (editor.chain().focus() as any).setTextAlign("justify").run()}
        active={editor.isActive({ textAlign: "justify" })}
        title="Justify"
      >
        <AlignJustify className="h-3.5 w-3.5" />
      </ToolbarBtn>

      <span className="mx-1 h-5 w-px bg-border" />

      <ToolbarBtn
        on={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Bullet list"
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        on={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Numbered list"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn on={indent} title="Increase indent / nest list">
        <Indent className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn on={outdent} title="Decrease indent / outdent list">
        <Outdent className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        on={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        title="Quote"
      >
        <Quote className="h-3.5 w-3.5" />
      </ToolbarBtn>

      <Select onValueChange={(v) => applyBlockAttr("lineHeight", v === "__reset" ? null : v)}>
        <SelectTrigger className="h-7 w-[78px] text-xs" title="Line spacing">
          <SelectValue placeholder="1.5×" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__reset">Reset</SelectItem>
          {["1", "1.15", "1.5", "1.75", "2", "2.5", "3"].map((h) => (
            <SelectItem key={h} value={h}>
              {h}×
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        onValueChange={(v) => {
          const [before, after] = v.split(":");
          applyBlockAttr("spaceBefore", before === "0" ? null : `${before}px`);
          applyBlockAttr("spaceAfter", after === "0" ? null : `${after}px`);
        }}
      >
        <SelectTrigger className="h-7 w-[120px] text-xs" title="Paragraph spacing">
          <SelectValue placeholder="Para spacing" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0:0">None (0 / 0)</SelectItem>
          <SelectItem value="6:6">Small (6 / 6)</SelectItem>
          <SelectItem value="12:12">Medium (12 / 12)</SelectItem>
          <SelectItem value="18:18">Large (18 / 18)</SelectItem>
          <SelectItem value="0:12">After only (0 / 12)</SelectItem>
          <SelectItem value="12:0">Before only (12 / 0)</SelectItem>
        </SelectContent>
      </Select>

      <Select onValueChange={(v) => changeCase(v as "upper" | "lower" | "title")}>
        <SelectTrigger className="h-7 w-[34px] text-xs px-1" title="Change case">
          <CaseSensitive className="h-3.5 w-3.5" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="upper">UPPERCASE</SelectItem>
          <SelectItem value="lower">lowercase</SelectItem>
          <SelectItem value="title">Title Case</SelectItem>
        </SelectContent>
      </Select>

      <span className="mx-1 h-5 w-px bg-border" />

      <ToolbarBtn on={promptLink} active={linkActive} title="Add / edit link">
        <LinkIcon className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn
        on={() => editor.chain().focus().unsetLink().run()}
        disabled={!linkActive}
        title="Remove link"
      >
        <Unlink className="h-3.5 w-3.5" />
      </ToolbarBtn>

      {!compact && (
        <>
          <ToolbarBtn on={insertImage} title="Insert image">
            <ImageIcon className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <TableGridPicker
            onInsert={(rows, cols) =>
              editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
            }
          />
        </>
      )}

      {inTable && !compact && (
        <div className="flex items-center gap-0.5 ml-1 pl-1 border-l border-border/60">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground px-1">
            Table
          </span>
          <ToolbarBtn on={() => editor.chain().focus().addRowAfter().run()} title="Add row below">
            <Rows3 className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            on={() => editor.chain().focus().addColumnAfter().run()}
            title="Add column right"
          >
            <Columns3 className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn on={() => editor.chain().focus().deleteRow().run()} title="Delete row">
            <Rows3 className="h-3.5 w-3.5 text-destructive" />
          </ToolbarBtn>
          <ToolbarBtn on={() => editor.chain().focus().deleteColumn().run()} title="Delete column">
            <Columns3 className="h-3.5 w-3.5 text-destructive" />
          </ToolbarBtn>
          <ToolbarBtn
            on={() => editor.chain().focus().mergeOrSplit().run()}
            title="Merge / split cells"
          >
            M↔S
          </ToolbarBtn>
          <ToolbarBtn
            on={() => editor.chain().focus().toggleHeaderRow().run()}
            title="Toggle header row"
          >
            H
          </ToolbarBtn>
          <ToolbarBtn on={() => editor.chain().focus().deleteTable().run()} title="Delete table">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </ToolbarBtn>
        </div>
      )}
    </div>
  );
}

// -- Public components --------------------------------------------------------
export function RichEditor({
  value,
  onChange,
  placeholder,
  minHeight = 160,
  className,
  compact = false,
  onReady,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  className?: string;
  compact?: boolean;
  /** Receives the Tiptap editor instance once mounted — for caret insertion, getJSON(), etc. */
  onReady?: (editor: Editor) => void;
}) {
  const editor = useEditor({
    extensions: buildExtensions(compact),
    content: value || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn("rich-content focus:outline-none px-3 py-2"),
        style: `min-height:${minHeight}px`,
      },
      handlePaste: (_view, event) => {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imgs = items.filter((i) => i.type.startsWith("image/"));
        if (imgs.length === 0 || compact) return false;
        event.preventDefault();
        (async () => {
          for (const it of imgs) {
            const f = it.getAsFile();
            if (!f) continue;
            try {
              const url = await uploadImage(f);
              (editor?.chain().focus() as any).setImage({ src: url }).run();
            } catch (e) {
              toast.error((e as Error).message);
            }
          }
        })();
        return true;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (editor && onReady) onReady(editor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return (
    <div className={cn("rounded-md border border-input bg-background", className)}>
      <Toolbar editor={editor} compact={compact} />
      <EditorContent editor={editor} />
      {placeholder && !value && (
        <div className="pointer-events-none -mt-[1px] px-3 pb-2 text-xs text-muted-foreground italic">
          {placeholder}
        </div>
      )}
    </div>
  );
}

export function RichViewer({ html, className }: { html: string; className?: string }) {
  const isHtml = useMemo(() => /<[a-z][\s\S]*>/i.test(html ?? ""), [html]);
  if (!html) return null;
  if (!isHtml) {
    return <div className={cn("rich-content whitespace-pre-wrap", className)}>{html}</div>;
  }
  return (
    <div
      className={cn("rich-content", className)}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function RichEditorInline({
  value,
  onChange,
  placeholder,
  minHeight = 80,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <RichEditor
      value={v}
      onChange={(html) => {
        setV(html);
        onChange(html);
      }}
      placeholder={placeholder}
      minHeight={minHeight}
      compact
    />
  );
}
