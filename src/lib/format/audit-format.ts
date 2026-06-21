import {
  Activity,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  FileText,
  GitBranch,
  Link2,
  Paperclip,
  Pin,
  Sparkles,
  Tag,
  Trash2,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

const STAGE_LABELS: Record<string, string> = {
  handover_received: "Handover Received",
  in_prep: "In-Prep",
  internal_qc: "Internal QC",
  in_qc: "Internal QC",
  waiting_cpa: "Waiting on B2B Firm",
  ready_for_delivery: "Ready for Delivery",
  final_signoff: "Final Sign-off",
  in_review: "Review",
};

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  in_qc: "Internal QC",
  in_review: "Review",
  blocked: "Blocked",
  completed: "Completed",
  cancelled: "Cancelled",
  draft: "Draft",
};

function pretty(value: unknown): string {
  if (value == null) return "—";
  const s = String(value);
  return (
    STAGE_LABELS[s] ??
    STATUS_LABELS[s] ??
    s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** UUID v4-ish detector. Treat matches as "needs name resolution". */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(x: unknown): x is string {
  return typeof x === "string" && UUID_RE.test(x);
}

export interface FormattedAuditEvent {
  icon: LucideIcon;
  /** Human-readable phrase to follow the actor name. Use {{uuid}} placeholders
   *  for any user ID that should be resolved to a display name at render time. */
  text: string;
  /** Category for filter chips. */
  category: "status" | "assignment" | "message" | "file" | "link" | "task" | "other";
  /** All UUIDs referenced by the phrase (in {{uuid}} placeholders) so the
   *  caller can batch-load profiles. */
  refUserIds: string[];
}

function fmt(template: string, ...uuids: string[]): { text: string; refUserIds: string[] } {
  return { text: template, refUserIds: uuids.filter(isUuid) };
}

export function formatAuditEvent(
  event_type: string,
  payload: Record<string, unknown> | null | undefined,
): FormattedAuditEvent {
  const p = (payload ?? {}) as Record<string, unknown>;
  const from = p.from;
  const to = p.to;
  const name = p.name;

  switch (event_type) {
    case "task_created":
      return { icon: Sparkles, text: "created this task", category: "task", refUserIds: [] };

    case "status_changed":
      return {
        icon: CheckCircle2,
        text: `moved status${from ? ` from ${pretty(from)}` : ""} → ${pretty(to)}`,
        category: "status",
        refUserIds: [],
      };

    case "pipeline_stage_changed":
      return {
        icon: GitBranch,
        text: `changed stage${from ? ` from ${pretty(from)}` : ""} → ${pretty(to)}`,
        category: "status",
        refUserIds: [],
      };

    case "template_applied": {
      const label = (p.label as string) ?? pretty(p.template);
      const created = Number(p.items_created ?? 0);
      return {
        icon: FileText,
        text: `applied template "${label}"${created ? ` · added ${created} sub-task${created === 1 ? "" : "s"}` : ""}`,
        category: "task",
        refUserIds: [],
      };
    }

    case "assignee_changed": {
      const refs: string[] = [];
      const fromTxt = isUuid(from) ? (refs.push(from), `{{${from}}}`) : from ? pretty(from) : null;
      const toTxt = isUuid(to)
        ? (refs.push(to as string), `{{${to}}}`)
        : to
          ? pretty(to)
          : "no one";
      return {
        icon: UserPlus,
        text: fromTxt
          ? `reassigned the task from ${fromTxt} → ${toTxt}`
          : `assigned the task to ${toTxt}`,
        category: "assignment",
        refUserIds: refs,
      };
    }

    case "reviewer_changed": {
      const refs: string[] = [];
      const fromTxt = isUuid(from) ? (refs.push(from), `{{${from}}}`) : from ? pretty(from) : null;
      const toTxt = isUuid(to)
        ? (refs.push(to as string), `{{${to}}}`)
        : to
          ? pretty(to)
          : "no one";
      return {
        icon: UserPlus,
        text: fromTxt ? `changed reviewer from ${fromTxt} → ${toTxt}` : `set ${toTxt} as reviewer`,
        category: "assignment",
        refUserIds: refs,
      };
    }

    case "assignee_added": {
      const id = (p.user_id as string) ?? "";
      const refs = isUuid(id) ? [id] : [];
      const who = name ? pretty(name) : isUuid(id) ? `{{${id}}}` : "someone";
      return { icon: UserPlus, text: `assigned ${who}`, category: "assignment", refUserIds: refs };
    }

    case "assignee_removed": {
      const id = (p.user_id as string) ?? "";
      const refs = isUuid(id) ? [id] : [];
      const who = name ? pretty(name) : isUuid(id) ? `{{${id}}}` : "someone";
      return { icon: UserPlus, text: `removed ${who}`, category: "assignment", refUserIds: refs };
    }

    case "reviewer_added": {
      const id = (p.user_id as string) ?? "";
      const refs = isUuid(id) ? [id] : [];
      const who = name ? pretty(name) : isUuid(id) ? `{{${id}}}` : "someone";
      return {
        icon: UserPlus,
        text: `added ${who} as reviewer`,
        category: "assignment",
        refUserIds: refs,
      };
    }

    case "reviewer_removed": {
      const id = (p.user_id as string) ?? "";
      const refs = isUuid(id) ? [id] : [];
      const who = name ? pretty(name) : isUuid(id) ? `{{${id}}}` : "someone";
      return {
        icon: UserPlus,
        text: `removed reviewer ${who}`,
        category: "assignment",
        refUserIds: refs,
      };
    }

    case "due_date_changed":
      return {
        icon: Clock,
        text: `changed the due date${from ? ` from ${pretty(from)}` : ""} → ${pretty(to)}`,
        category: "task",
        refUserIds: [],
      };

    case "priority_changed":
      return { icon: Tag, text: `set priority to ${pretty(to)}`, category: "task", refUserIds: [] };

    case "message_visibility_changed":
      return p.to
        ? {
            icon: Eye,
            text: "shared a message with the client",
            category: "message",
            refUserIds: [],
          }
        : {
            icon: EyeOff,
            text: "hid a message from the client",
            category: "message",
            refUserIds: [],
          };

    case "message_pinned":
      return { icon: Pin, text: "pinned a message", category: "message", refUserIds: [] };
    case "message_unpinned":
      return { icon: Pin, text: "unpinned a message", category: "message", refUserIds: [] };
    case "message_edited":
      return { icon: Pin, text: "edited a message", category: "message", refUserIds: [] };
    case "message_deleted":
      return { icon: Trash2, text: "deleted a message", category: "message", refUserIds: [] };

    case "link_added":
      return {
        icon: Link2,
        text: `added a link${p.url ? ` (${String(p.url)})` : ""}`,
        category: "link",
        refUserIds: [],
      };
    case "link_removed":
      return { icon: Link2, text: "removed a link", category: "link", refUserIds: [] };

    case "attachment_uploaded":
      return {
        icon: Paperclip,
        text: `uploaded a file${p.filename ? ` — ${String(p.filename)}` : ""}`,
        category: "file",
        refUserIds: [],
      };
    case "attachment_archived":
      return { icon: Paperclip, text: "archived a file", category: "file", refUserIds: [] };
    case "attachment_deleted":
      return { icon: Trash2, text: "deleted a file", category: "file", refUserIds: [] };

    case "category_created":
      return {
        icon: Tag,
        text: `created category "${String(p.name ?? "")}"`,
        category: "file",
        refUserIds: [],
      };
    case "category_renamed":
      return {
        icon: Tag,
        text: `renamed category "${String(p.from ?? "")}" → "${String(p.to ?? "")}"`,
        category: "file",
        refUserIds: [],
      };
    case "category_assigned": {
      const n = Number(p.count ?? 0);
      return {
        icon: Tag,
        text: `tagged ${n} file${n === 1 ? "" : "s"} with "${String(p.name ?? "")}"`,
        category: "file",
        refUserIds: [],
      };
    }
    case "category_unassigned": {
      const n = Number(p.count ?? 0);
      return {
        icon: Tag,
        text: `removed "${String(p.name ?? "")}" from ${n} file${n === 1 ? "" : "s"}`,
        category: "file",
        refUserIds: [],
      };
    }
    case "category_deleted": {
      const n = Number(p.affected_files ?? 0);
      const mode = String(p.mode ?? "untag");
      const tail =
        mode === "reassign"
          ? ` and reassigned ${n} file${n === 1 ? "" : "s"}`
          : n > 0
            ? ` and untagged ${n} file${n === 1 ? "" : "s"}`
            : "";
      return {
        icon: Tag,
        text: `deleted category "${String(p.name ?? "")}"${tail}`,
        category: "file",
        refUserIds: [],
      };
    }

    case "subtask_completed":
      return { icon: CheckCircle2, text: "completed a sub-task", category: "task", refUserIds: [] };

    default: {
      const cleaned = event_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      return { icon: Activity, text: cleaned.toLowerCase(), category: "other", refUserIds: [] };
    }
  }
}

/** Resolve `{{uuid}}` placeholders in a phrase to display names from a lookup. */
export function resolveAuditNames(text: string, lookup: (id: string) => string): string {
  return text.replace(/\{\{([0-9a-f-]{36})\}\}/gi, (_, id) => lookup(id));
}
