import { useEffect, useMemo } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { generateHTML } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mention from "@tiptap/extension-mention";
import Link from "@tiptap/extension-link";
import { useNavigate } from "@tanstack/react-router";
import { profileMentionSuggestion, taskMentionSuggestion } from "./mention-suggestion";
import { cn } from "@/lib/shared/utils";

/**
 * Reminder rich body — inline-only Tiptap surface used in both the Workspace
 * Reminders panel and the Calendar day pane.
 *
 * Inline-only means: bold/italic, links, and `@profile` / `#task` mentions.
 * No headings, lists, images, or tables — reminder rows stay compact.
 *
 * The `taskMention` extension is omitted entirely from the public submission
 * form (see `ReminderRichEditor`'s `allowTaskMention` flag), so external
 * senders cannot link tasks even by typing `#`.
 */

const InlineStarterKit = StarterKit.configure({
  heading: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  blockquote: false,
  codeBlock: false,
  horizontalRule: false,
  hardBreak: { keepMarks: false },
});

function buildExtensions(opts: { placeholder: string; allowTaskMention: boolean }) {
  const exts: any[] = [
    InlineStarterKit,
    Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: "underline" } }),
    Placeholder.configure({ placeholder: opts.placeholder }),
    Mention.configure({
      HTMLAttributes: { class: "mention-user" },
      renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
      suggestion: profileMentionSuggestion,
    }),
  ];
  if (opts.allowTaskMention) {
    exts.push(
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
    );
  }
  return exts;
}

export type ReminderRichEditorHandle = {
  getJSON: () => unknown;
  getText: () => string;
  clear: () => void;
  focus: () => void;
};

export function ReminderRichEditor({
  initialJSON,
  placeholder = "Remind me to…",
  allowTaskMention = true,
  onEditorReady,
  onEnter,
  className,
  autoFocus,
}: {
  initialJSON?: unknown;
  placeholder?: string;
  allowTaskMention?: boolean;
  onEditorReady: (editor: Editor) => void;
  onEnter?: () => void;
  className?: string;
  autoFocus?: boolean;
}) {
  const editor = useEditor({
    extensions: buildExtensions({ placeholder, allowTaskMention }),
    content: (initialJSON as object | null) ?? {
      type: "doc",
      content: [{ type: "paragraph" }],
    },
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: cn(
          "rich-content reminder-rich focus:outline-none text-sm leading-snug",
          "min-h-[28px] px-2 py-1.5",
          className,
        ),
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey && onEnter) {
          // Don't fire while a mention/suggestion popup is open — Enter selects.
          const open = document.querySelector(".tippy-box[data-state='visible']");
          if (open) return false;
          event.preventDefault();
          onEnter();
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    if (editor) onEditorReady(editor);
  }, [editor, onEditorReady]);

  if (!editor) return null;
  return <EditorContent editor={editor} />;
}

/**
 * Read-only renderer for a reminder body. Falls back to plain text if no
 * rich JSON is stored (legacy reminders inserted before this migration).
 *
 * `#task` chips navigate to the linked task on click; everything else is
 * non-interactive.
 */
export function ReminderRichBody({
  bodyRich,
  bodyText,
  done,
  className,
}: {
  bodyRich: unknown;
  bodyText: string;
  done?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();

  const html = useMemo(() => {
    if (!bodyRich || typeof bodyRich !== "object") return null;
    try {
      return generateHTML(
        bodyRich as never,
        buildExtensions({ placeholder: "", allowTaskMention: true }),
      );
    } catch {
      return null;
    }
  }, [bodyRich]);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[data-mention-task="true"]');
    if (a) {
      e.preventDefault();
      const id = a.getAttribute("data-id");
      if (!id) return;
      if (e.metaKey || e.ctrlKey) {
        window.open(`/ops/tasks/${id}`, "_blank");
      } else {
        navigate({ to: "/ops/tasks/$taskId", params: { taskId: id } });
      }
    }
  };

  if (!html) {
    return (
      <p className={cn("text-sm leading-snug", done && "line-through", className)}>{bodyText}</p>
    );
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "rich-content reminder-rich text-sm leading-snug",
        done && "line-through opacity-90",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Extract a plain-text representation of a Tiptap document for search/notifications. */
export function tiptapToPlainText(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const out: string[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (node.type === "text" && typeof node.text === "string") {
      out.push(node.text);
      return;
    }
    if (node.type === "mention") {
      out.push(`@${node.attrs?.label ?? ""}`);
      return;
    }
    if (node.type === "taskMention") {
      out.push(`#${node.attrs?.label ?? ""}`);
      return;
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(json);
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** True when the document only contains whitespace. */
export function isTiptapEmpty(json: unknown): boolean {
  return tiptapToPlainText(json).length === 0;
}
