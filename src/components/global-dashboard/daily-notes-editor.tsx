import "./blocks/tiptap-dedupe-check";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Mention from "@tiptap/extension-mention";
import GlobalDragHandle from "tiptap-extension-global-drag-handle";
import type { AnyExtension } from "@tiptap/core";
import { useNavigate } from "@tanstack/react-router";
import { Toolbar, buildFormatExtras } from "@/components/shared/rich-editor";
import { profileMentionSuggestion, taskMentionSuggestion } from "./mention-suggestion";
import { SlashCommand } from "./slash-command";
import { ProgressBlock } from "./blocks/progress-block";
import { KanbanBlock } from "./blocks/kanban-block";
import { DrawingBlock } from "./blocks/drawing-block";
import { CalendarBlock } from "./blocks/calendar-block";
import { ToggleBlock } from "./blocks/toggle-block";
import { CalloutBlock } from "./blocks/callout-block";
import { cn } from "@/lib/shared/utils";

type Props = {
  initialContent: unknown;
  onSave: (json: unknown) => void;
  resetKey: string;
  readOnly?: boolean;
};

/**
 * Daily Notes editor — a borderless, full-page "infinite canvas" surface
 * styled after Microsoft Loop / OneNote:
 *  - "/" slash menu (see slash-command.tsx) for headings, lists, checklists,
 *    tables, dividers and visual blocks
 *  - hover drag handles to reorder blocks (tiptap-extension-global-drag-handle)
 *  - OneNote-style checklists that strike through when ticked (styles.css)
 *  - "@" people mentions and "#" task links
 */
export function DailyNotesEditor({ initialContent, onSave, resetKey, readOnly }: Props) {
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        ...buildFormatExtras({ withImage: true }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        ProgressBlock,
        KanbanBlock,
        DrawingBlock,
        CalendarBlock,
        ToggleBlock,
        CalloutBlock,
        Placeholder.configure({
          includeChildren: false,
          placeholder: ({ node }) =>
            node.type.name === "heading"
              ? "Heading"
              : "Write something, or press '/' for commands…",
        }),
        SlashCommand,
        // Hover drag handles only make sense while editing.
        ...(readOnly
          ? []
          : [
              GlobalDragHandle.configure({
                dragHandleWidth: 20,
                scrollTreshold: 100,
              }) as AnyExtension,
            ]),
        Mention.configure({
          HTMLAttributes: { class: "mention-user" },
          renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
          suggestion: profileMentionSuggestion,
        }),
        Mention.extend({
          name: "taskMention",
          renderHTML({ node, HTMLAttributes }) {
            const id = node.attrs.id as string;
            const label = (node.attrs.label as string) ?? id;
            return [
              "a",
              {
                ...HTMLAttributes,
                class: "mention-task",
                "data-mention-task": "true",
                "data-id": id,
                href: `/ops/tasks/${id}`,
              },
              `#${label}`,
            ];
          },
        }).configure({
          HTMLAttributes: { class: "mention-task" },
          renderText: ({ node }) => `#${node.attrs.label ?? node.attrs.id}`,
          suggestion: taskMentionSuggestion,
        }),
      ],
      content: (initialContent as object | null) ?? {
        type: "doc",
        content: [{ type: "paragraph" }],
      },
      editable: !readOnly,
      editorProps: {
        attributes: {
          class: cn(
            "rich-content daily-notes-prose focus:outline-none",
            "mx-auto w-full max-w-none px-6 py-6 sm:px-10 lg:px-14",
          ),
        },
        handleDrop: (_view, event, _slice, moved) => {
          if (moved || readOnly) return false;
          const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
            f.type.startsWith("image/"),
          );
          if (files.length === 0) return false;
          event.preventDefault();
          void (async () => {
            for (const f of files) {
              try {
                const url = await uploadDailyNoteImage(f);
                editor?.chain().focus().setImage({ src: url }).run();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }
          })();
          return true;
        },
        handlePaste: (_view, event) => {
          if (readOnly) return false;
          const imgs = Array.from(event.clipboardData?.items ?? []).filter((i) =>
            i.type.startsWith("image/"),
          );
          if (imgs.length === 0) return false;
          event.preventDefault();
          void (async () => {
            for (const it of imgs) {
              const f = it.getAsFile();
              if (!f) continue;
              try {
                const url = await uploadDailyNoteImage(f);
                editor?.chain().focus().setImage({ src: url }).run();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }
          })();
          return true;
        },
        handleClickOn: (_view, _pos, node, _nodePos, event) => {
          if (node.type.name !== "taskMention") return false;
          const id = node.attrs.id as string;
          if (!id) return false;
          if (event.metaKey || event.ctrlKey) {
            window.open(`/ops/tasks/${id}`, "_blank");
          } else {
            navigate({ to: "/ops/tasks/$taskId", params: { taskId: id } });
          }
          return true;
        },
      },
      onUpdate: ({ editor: ed }) => {
        if (readOnly) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onSave(ed.getJSON()), 2000);
      },
    },
    [resetKey],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!editor) return null;

  return (
    <div className="flex h-full flex-col bg-card">
      {!readOnly && (
        <div className="sticky top-0 z-20 border-b border-border/20 bg-card shadow-[0_1px_3px_0_rgb(0,0,0,0.06)]">
          <Toolbar editor={editor} compact={false} bare bubbles />
        </div>
      )}
      <div className="daily-notes-canvas min-h-0 flex-1 overflow-y-auto bg-card">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

async function uploadDailyNoteImage(file: File): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to upload images");
  const ext = file.name.split(".").pop() || "png";
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("note-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("note-images").getPublicUrl(path);
  return data.publicUrl;
}
