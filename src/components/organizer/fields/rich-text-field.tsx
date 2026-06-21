import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { useCallback, useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Table as TableIcon,
  Palette,
  Link as LinkIcon,
  Undo2,
  Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { sanitizeRichHtml } from "@/lib/organizer/rich-text";
import type { RichTextAnswer, JsonObject } from "@/lib/organizer/schemas";

const PRESET_COLORS = [
  "#000000",
  "#374151",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0284c7",
  "#7c3aed",
  "#db2777",
];

interface Props {
  value: unknown;
  disabled?: boolean;
  onChange: (v: RichTextAnswer) => void;
  placeholder?: string;
}

function readInitial(value: unknown): { html: string; json: JsonObject | null } {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (v.kind === "rich") {
      return {
        html: typeof v.html === "string" ? v.html : "",
        json: (v.json as JsonObject) ?? null,
      };
    }
    if (v.kind === "plain" && typeof v.text === "string") {
      return { html: `<p>${v.text.replace(/</g, "&lt;")}</p>`, json: null };
    }
  }
  if (typeof value === "string") {
    return { html: `<p>${value.replace(/</g, "&lt;")}</p>`, json: null };
  }
  return { html: "", json: null };
}

export function RichTextField({ value, disabled, onChange, placeholder }: Props) {
  const initial = useRef(readInitial(value));
  const lastEmit = useRef<string>("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: initial.current.json ?? initial.current.html,
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-[140px] focus:outline-none px-3 py-2",
      },
    },
    onUpdate: ({ editor }) => {
      const html = sanitizeRichHtml(editor.getHTML());
      if (html === lastEmit.current) return;
      lastEmit.current = html;
      onChange({ kind: "rich", html, json: editor.getJSON() as JsonObject });
    },
  });

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [editor, disabled]);

  const setColor = useCallback((c: string) => editor?.chain().focus().setColor(c).run(), [editor]);

  const promptLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (!url) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (!/^https?:\/\//i.test(url)) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return <div className="rounded-md border border-input bg-background min-h-[180px]" />;
  }

  const btn = "h-8 w-8 p-0";
  return (
    <div className="rounded-md border border-input bg-background">
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <Button
          type="button"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
          size="sm"
          className={btn}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
          size="sm"
          className={btn}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
          title="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("underline") ? "secondary" : "ghost"}
          size="sm"
          className={btn}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-label="Underline"
          title="Underline"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          type="button"
          variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
          size="sm"
          className={btn}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Bulleted list"
          title="Bulleted list"
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("orderedList") ? "secondary" : "ghost"}
          size="sm"
          className={btn}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Numbered list"
          title="Numbered list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={btn}
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          aria-label="Insert table"
          title="Insert table"
        >
          <TableIcon className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("link") ? "secondary" : "ghost"}
          size="sm"
          className={btn}
          onClick={promptLink}
          aria-label="Link"
          title="Link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <div className="flex items-center gap-1">
          <Palette className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={`Text color ${c}`}
              title={`Text color ${c}`}
              className="h-4 w-4 rounded border border-border"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={btn}
            onClick={() => editor.chain().focus().undo().run()}
            aria-label="Undo"
            title="Undo"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={btn}
            onClick={() => editor.chain().focus().redo().run()}
            aria-label="Redo"
            title="Redo"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <EditorContent editor={editor} />
      {!editor.getText().trim() && placeholder ? (
        <div className="pointer-events-none -mt-[140px] px-3 py-2 text-sm text-muted-foreground">
          {placeholder}
        </div>
      ) : null}
    </div>
  );
}
