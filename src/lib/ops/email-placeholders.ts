// Dynamic placeholder registry + substitution helpers for Email templates.
//
// Email template bodies (rich text) and subject lines may contain
// {{snake_case}} tokens. The Preview action substitutes sample data so authors
// can verify their merge fields before the template is ever sent. Sending
// itself lives in the /email hub and is out of scope here.

export interface EmailPlaceholder {
  /** The literal token as authored, e.g. "{{client_name}}". */
  token: string;
  /** The bare key inside the braces, e.g. "client_name". */
  key: string;
  /** Human label for the insert menu. */
  label: string;
  /** Sample value used by the Preview. */
  sample: string;
  /** Short grouping hint shown in the insert menu. */
  group: "Client" | "Engagement" | "Task" | "Dates" | "Team";
  /** When true, the sample value is already HTML and should NOT be escaped on preview. */
  html?: boolean;
}

function ph(
  key: string,
  label: string,
  sample: string,
  group: EmailPlaceholder["group"],
  opts?: { html?: boolean },
): EmailPlaceholder {
  return { token: `{{${key}}}`, key, label, sample, group, html: opts?.html };
}

export const EMAIL_PLACEHOLDERS: EmailPlaceholder[] = [
  // Client
  ph("client_name", "Client name", "Acme Corp", "Client"),
  ph("client_group_name", "Client group name", "Acme Group", "Client"),
  ph("contact_name", "Contact name", "Jordan Smith", "Client"),
  ph("firm_name", "Firm name", "BusAcTa LLP", "Client"),
  // Engagement
  ph("project_name", "Project name", "2025 Year-End Close", "Engagement"),
  ph("entity_name", "Entity name", "Acme Holdings Inc.", "Engagement"),
  ph("tax_year", "Tax year", "2025", "Engagement"),
  ph("period", "Period", "Q4 2025", "Engagement"),
  // Task
  ph("task_name", "Task name", "Prepare Form 1065", "Task"),
  ph("task_status", "Task status", "In Progress", "Task"),
  ph("difficulty_level", "Difficulty level", "Medium", "Task"),
  ph("urgency", "Urgency", "High", "Task"),
  ph(
    "clarifications_action_items",
    "Clarification & action items",
    "<ul><li>Confirm prior-year K-1 totals</li><li>Send updated W-9</li></ul>",
    "Task",
    { html: true },
  ),
  ph(
    "task_notes",
    "Task notes",
    "Client confirmed extension. Awaiting trial balance.",
    "Task",
  ),
  ph(
    "activity_notes",
    "Activity tab notes",
    "Drafted return; pending reviewer signoff.",
    "Task",
  ),
  ph(
    "related_links",
    "Related links",
    "Engagement letter: https://example.com/eng · Prior return: https://example.com/py",
    "Task",
  ),
  // Dates
  ph("start_date", "Start date", "Jan 15, 2026", "Dates"),
  ph("due_date", "Due date", "Apr 15, 2026", "Dates"),
  ph("completion_date", "Completion date", "Apr 12, 2026", "Dates"),
  ph("today", "Today's date", "May 31, 2026", "Dates"),
  // Team
  ph("assignee_name", "Assignee", "Taylor Reed", "Team"),
  ph("preparer_name", "Preparer name", "Taylor Reed", "Team"),
  ph("reviewer_name", "Reviewer name", "Morgan Lee", "Team"),
];

const KNOWN_KEYS = new Set(EMAIL_PLACEHOLDERS.map((p) => p.key));
const HTML_KEYS = new Set(EMAIL_PLACEHOLDERS.filter((p) => p.html).map((p) => p.key));

/** Map of every known key → its sample value, for the Preview. */
export function samplePlaceholderData(): Record<string, string> {
  return Object.fromEntries(EMAIL_PLACEHOLDERS.map((p) => [p.key, p.sample]));
}

/** Match {{ key }} allowing surrounding whitespace; key is snake/alnum. */
const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Escape characters that have special meaning in HTML to prevent XSS. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Replace every {{key}} with data[key]. Unknown keys (no sample provided) are
 * left untouched so the Preview can visibly flag them. Values are HTML-escaped
 * to prevent injection when the result is rendered as HTML.
 */
export function substitutePlaceholders(text: string, data: Record<string, string>): string {
  if (!text) return text;
  return text.replace(TOKEN_RE, (whole, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(data, key)) return whole;
    return HTML_KEYS.has(key) ? data[key] : escapeHtml(data[key]);
  });
}

/** Distinct tokens used in the text that are NOT in the registry. */
export function findUnknownTokens(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(TOKEN_RE)) {
    if (!KNOWN_KEYS.has(m[1])) out.add(`{{${m[1]}}}`);
  }
  return Array.from(out);
}

/** Distinct registry tokens actually used in the text — for "fields in use" chips. */
export function findUsedKnownTokens(text: string): EmailPlaceholder[] {
  if (!text) return [];
  const used = new Set<string>();
  for (const m of text.matchAll(TOKEN_RE)) if (KNOWN_KEYS.has(m[1])) used.add(m[1]);
  return EMAIL_PLACEHOLDERS.filter((p) => used.has(p.key));
}
