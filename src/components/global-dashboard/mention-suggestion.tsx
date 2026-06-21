import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import tippy, { type Instance as TippyInstance } from "tippy.js";
import { forwardRef, useEffect, useImperativeHandle, useState, type KeyboardEvent } from "react";
import {
  searchProfilesForMention,
  searchTasksForMention,
  type MentionProfile,
  type MentionTask,
} from "@/lib/queries/global-dashboard.queries";
import { cn } from "@/lib/shared/utils";
import { UserAvatar } from "@/components/shared/user-avatar";

type Item = { id: string; label: string; sub?: string; avatar_url?: string | null };

type MentionListProps = {
  items: Item[];
  command: (props: { id: string; label: string }) => void;
};

export type MentionListHandle = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

const MentionList = forwardRef<MentionListHandle, MentionListProps>((props, ref) => {
  const [selected, setSelected] = useState(0);

  useEffect(() => setSelected(0), [props.items]);

  const select = (i: number) => {
    const item = props.items[i];
    if (item) props.command({ id: item.id, label: item.label });
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

  if (props.items.length === 0) {
    return (
      <div className="rounded-md border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
        No matches
      </div>
    );
  }

  return (
    <div className="max-h-72 w-max min-w-[16rem] max-w-[34rem] overflow-y-auto rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md">
      {props.items.map((item, i) => (
        <button
          type="button"
          key={item.id}
          onMouseDown={(e) => {
            e.preventDefault();
            select(i);
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left",
            i === selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
          )}
        >
          {item.avatar_url !== undefined && (
            <UserAvatar
              profile={{
                id: item.id,
                full_name: item.label,
                email: item.sub ?? null,
                avatar_url: item.avatar_url ?? null,
              }}
              size="xs"
              className="shrink-0"
            />
          )}
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block w-full truncate whitespace-nowrap text-sm font-semibold leading-tight",
                i === selected ? "text-accent-foreground" : "text-popover-foreground",
              )}
            >
              {item.label}
            </span>
            {item.sub && (
              <span className="block w-full truncate whitespace-nowrap text-[11px] text-muted-foreground leading-tight">
                {item.sub}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
});
MentionList.displayName = "MentionList";

function makeSuggestion(
  fetcher: (q: string) => Promise<Item[]>,
  char: string,
  allowSpaces = false,
): Omit<SuggestionOptions, "editor"> {
  return {
    char,
    allowSpaces,
    items: async ({ query }) => fetcher(query),
    render: () => {
      let component: ReactRenderer<MentionListHandle, MentionListProps> | null = null;
      let popup: TippyInstance[] | null = null;
      return {
        onStart: (props) => {
          component = new ReactRenderer(MentionList, {
            props: { items: props.items as Item[], command: props.command },
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
            theme: "mention",
            arrow: false,
          });
        },
        onUpdate: (props) => {
          component?.updateProps({ items: props.items as Item[], command: props.command });
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
}

export const profileMentionSuggestion = makeSuggestion(async (q): Promise<Item[]> => {
  const rows = await searchProfilesForMention(q);
  return rows.map((p: MentionProfile) => ({
    id: p.id,
    label: p.full_name ?? p.email ?? "Unknown",
    sub: p.email ?? undefined,
    avatar_url: p.avatar_url,
  }));
}, "@");

export const taskMentionSuggestion = makeSuggestion(
  async (q): Promise<Item[]> => {
    const rows = await searchTasksForMention(q);
    return rows.map((t: MentionTask) => ({
      id: t.id,
      label: t.title,
      sub: t.sub ?? undefined,
    }));
  },
  "#",
  true,
);
