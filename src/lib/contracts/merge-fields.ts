// Mail-merge field registry + substitution helpers for Contract templates.
//
// Contract template bodies (rich text) contain {{snake_case}} tokens that are
// resolved from a Contract Profile (the legal counterparty) at generation time.
// Mirrors the email-template placeholder system (src/lib/ops/email-placeholders.ts)
// but is sourced from contract_profiles + joined lead/campaign + firm/date context.

import type { ContractProfile, ContractType } from "./schemas";

export interface ContractMergeField {
  /** The literal token as authored, e.g. "{{registered_legal_name}}". */
  token: string;
  /** The bare key inside the braces, e.g. "registered_legal_name". */
  key: string;
  /** Human label for the insert menu. */
  label: string;
  /** Sample value used by the Preview. */
  sample: string;
  /** Grouping hint shown in the insert menu. */
  group: "Counterparty" | "Signatory" | "Dates" | "Firm" | "Links";
}

function mf(
  key: string,
  label: string,
  sample: string,
  group: ContractMergeField["group"],
): ContractMergeField {
  return { token: `{{${key}}}`, key, label, sample, group };
}

export const CONTRACT_MERGE_FIELDS: ContractMergeField[] = [
  mf("registered_legal_name", "Registered legal name", "Acme Holdings Inc.", "Counterparty"),
  mf("trading_name", "Trading / display name", "Acme", "Counterparty"),
  mf("counterparty_address", "Address", "1 Market St, San Francisco, CA 94105", "Counterparty"),
  mf("counterparty_email", "Email", "legal@acme.com", "Counterparty"),
  mf("counterparty_phone", "Phone", "+1 (415) 555-0100", "Counterparty"),
  mf("jurisdiction", "Governing jurisdiction", "State of Delaware", "Counterparty"),
  mf("contract_type", "Contract type", "NDA", "Counterparty"),
  mf("signatory_name", "Signatory name", "Jordan Smith", "Signatory"),
  mf("signatory_title", "Signatory title", "Chief Executive Officer", "Signatory"),
  mf("effective_date", "Effective date", "June 2, 2026", "Dates"),
  mf("today", "Today's date", "June 2, 2026", "Dates"),
  mf("firm_name", "Firm name", "BusAcTa LLP", "Firm"),
  mf("lead_company", "Linked lead company", "Acme Corp", "Links"),
  mf("campaign_name", "Linked campaign", "2026 Spring Outreach", "Links"),
];

const KNOWN_KEYS = new Set(CONTRACT_MERGE_FIELDS.map((p) => p.key));

const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  nda: "NDA",
  sla: "SLA",
  other: "Contract",
};

/** Map of every known key → its sample value, for the Preview. */
export function samplePlaceholderData(): Record<string, string> {
  return Object.fromEntries(CONTRACT_MERGE_FIELDS.map((p) => [p.key, p.sample]));
}

/** Format a YYYY-MM-DD (or ISO) date as e.g. "June 2, 2026"; blank stays blank. */
function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  // Anchor date-only strings to midday UTC so the calendar date never shifts.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Resolve token → value for a profile. `joins` carries the optional linked
 * lead company name / campaign name; `firmName` and `today` are context.
 */
export function buildMergeData(
  profile: ContractProfile,
  joins?: { leadCompany?: string | null; campaignName?: string | null },
  context?: { firmName?: string | null; today?: string },
): Record<string, string> {
  const todayIso = context?.today ?? new Date().toISOString().slice(0, 10);
  return {
    registered_legal_name: profile.registered_legal_name ?? "",
    trading_name: profile.trading_name ?? "",
    counterparty_address: profile.address ?? "",
    counterparty_email: profile.email ?? "",
    counterparty_phone: profile.phone ?? "",
    jurisdiction: profile.jurisdiction ?? "",
    contract_type: CONTRACT_TYPE_LABELS[profile.contract_type] ?? "Contract",
    signatory_name: profile.signatory_name ?? "",
    signatory_title: profile.signatory_title ?? "",
    effective_date: formatDate(profile.effective_date),
    today: formatDate(todayIso),
    firm_name: context?.firmName ?? "",
    lead_company: joins?.leadCompany ?? "",
    campaign_name: joins?.campaignName ?? "",
  };
}

/** Match {{ key }} allowing surrounding whitespace; key is snake/alnum. */
const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Escape characters that have special meaning in HTML to prevent injection. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Replace every {{key}} with data[key], HTML-escaping the value. Use for the
 * HTML preview and the PDF (print) path where output is rendered as HTML.
 * Unknown keys are left untouched so they remain visible.
 */
export function substituteMergeFieldsHtml(text: string, data: Record<string, string>): string {
  if (!text) return text;
  return text.replace(TOKEN_RE, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(data, key) ? escapeHtml(data[key]) : whole,
  );
}

/**
 * Replace every {{key}} with the raw value (no escaping). Use when substituting
 * into Tiptap text nodes for the .docx path — the docx library handles its own
 * XML escaping, so escaping here would double-encode.
 */
export function substituteMergeFieldsText(text: string, data: Record<string, string>): string {
  if (!text) return text;
  return text.replace(TOKEN_RE, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(data, key) ? data[key] : whole,
  );
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

/** Distinct registry fields actually used in the text — for "fields in use" chips. */
export function findUsedKnownTokens(text: string): ContractMergeField[] {
  if (!text) return [];
  const used = new Set<string>();
  for (const m of text.matchAll(TOKEN_RE)) if (KNOWN_KEYS.has(m[1])) used.add(m[1]);
  return CONTRACT_MERGE_FIELDS.filter((p) => used.has(p.key));
}
