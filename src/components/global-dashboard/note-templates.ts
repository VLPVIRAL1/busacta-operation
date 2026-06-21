/**
 * Daily Notes page templates — pre-built Tiptap JSON blueprints users
 * pick when creating a new note. Mirrors the MS Loop / Notion template gallery.
 */

export type NoteTemplate = {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** Suggested default title; tokens: {date} → today's localised date. */
  defaultTitle: string;
  buildDoc: (ctx: { todayLong: string }) => unknown;
};

const h = (level: 1 | 2 | 3, text: string) => ({
  type: "heading",
  attrs: { level },
  content: [{ type: "text", text }],
});
const p = (text = "") =>
  text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" };
const callout = (variant: "info" | "warning" | "tip" | "success", text: string) => ({
  type: "calloutBlock",
  attrs: { variant },
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const bullet = (items: string[]) => ({
  type: "bulletList",
  content: items.map((t) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] }],
  })),
});
const checklist = (items: string[]) => ({
  type: "taskList",
  content: items.map((t) => ({
    type: "taskItem",
    attrs: { checked: false },
    content: [{ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] }],
  })),
});
const toggle = (summary: string, body: unknown[]) => ({
  type: "toggleBlock",
  attrs: { open: true, summary },
  content: body,
});

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "blank",
    name: "Blank note",
    icon: "📄",
    description: "Start with an empty page.",
    defaultTitle: "Untitled note",
    buildDoc: () => ({ type: "doc", content: [{ type: "paragraph" }] }),
  },
  {
    id: "meeting",
    name: "Meeting notes",
    icon: "🗓️",
    description: "Attendees, agenda, decisions, action items.",
    defaultTitle: "Meeting — {date}",
    buildDoc: ({ todayLong }) => ({
      type: "doc",
      content: [
        h(1, "Meeting notes"),
        p(todayLong),
        h(2, "Attendees"),
        bullet([""]),
        h(2, "Agenda"),
        bullet(["", "", ""]),
        h(2, "Discussion"),
        p(),
        h(2, "Decisions"),
        callout("success", "Key decisions go here."),
        h(2, "Action items"),
        checklist(["", ""]),
      ],
    }),
  },
  {
    id: "project-brief",
    name: "Project brief",
    icon: "📋",
    description: "Goal, scope, owners, timeline, risks.",
    defaultTitle: "Project brief — {date}",
    buildDoc: () => ({
      type: "doc",
      content: [
        h(1, "Project brief"),
        callout("info", "A one-page brief everyone aligns on before kickoff."),
        h(2, "Objective"),
        p("What outcome are we driving?"),
        h(2, "Scope"),
        toggle("In scope", [bullet(["", ""])]),
        toggle("Out of scope", [bullet(["", ""])]),
        h(2, "Owner & team"),
        bullet(["Owner: ", "Reviewer: ", "Contributors: "]),
        h(2, "Timeline"),
        bullet(["Kickoff: ", "Milestone 1: ", "Launch: "]),
        h(2, "Risks"),
        callout("warning", "Track open risks here."),
      ],
    }),
  },
  {
    id: "brainstorm",
    name: "Brainstorm",
    icon: "💡",
    description: "Idea dump, themes, next steps.",
    defaultTitle: "Brainstorm — {date}",
    buildDoc: () => ({
      type: "doc",
      content: [
        h(1, "Brainstorm"),
        callout("tip", "No bad ideas. Capture first, organise later."),
        h(2, "Ideas"),
        bullet(["", "", "", ""]),
        h(2, "Themes"),
        bullet(["", ""]),
        h(2, "Next steps"),
        checklist(["", ""]),
      ],
    }),
  },
  {
    id: "1-on-1",
    name: "1-on-1",
    icon: "👥",
    description: "Updates, blockers, feedback, follow-ups.",
    defaultTitle: "1-on-1 — {date}",
    buildDoc: ({ todayLong }) => ({
      type: "doc",
      content: [
        h(1, "1-on-1"),
        p(todayLong),
        h(2, "Wins since last time"),
        bullet([""]),
        h(2, "Updates"),
        bullet([""]),
        h(2, "Blockers"),
        callout("warning", "Anything I can unblock?"),
        h(2, "Feedback"),
        toggle("From me", [p()]),
        toggle("From you", [p()]),
        h(2, "Action items"),
        checklist(["", ""]),
      ],
    }),
  },
  {
    id: "sprint-retro",
    name: "Sprint retro",
    icon: "🔁",
    description: "Went well, didn't, try next.",
    defaultTitle: "Sprint retro — {date}",
    buildDoc: () => ({
      type: "doc",
      content: [
        h(1, "Sprint retrospective"),
        h(2, "What went well"),
        callout("success", ""),
        bullet([""]),
        h(2, "What didn't go well"),
        callout("warning", ""),
        bullet([""]),
        h(2, "What to try next"),
        callout("tip", ""),
        checklist(["", ""]),
      ],
    }),
  },
  {
    id: "daily-standup",
    name: "Daily standup",
    icon: "☀️",
    description: "Yesterday / today / blockers.",
    defaultTitle: "Standup — {date}",
    buildDoc: ({ todayLong }) => ({
      type: "doc",
      content: [
        h(1, "Daily standup"),
        p(todayLong),
        h(3, "Yesterday"),
        bullet([""]),
        h(3, "Today"),
        bullet([""]),
        h(3, "Blockers"),
        callout("warning", "None right now."),
      ],
    }),
  },
];

export function templateById(id: string): NoteTemplate | undefined {
  return NOTE_TEMPLATES.find((t) => t.id === id);
}
