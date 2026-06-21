// Shared, pure conditional-rule evaluator. Used by the builder preview,
// the respondent wizard (client-side), and the server-side submit validator.
//
// A block is visible when its `conditional_rules_json.show_when` group
// evaluates to true (or when no rules are set). Sections cascade: if a
// section is hidden, every descendant is hidden too.

import type {
  ConditionalGroup,
  ConditionalLeaf,
  ConditionalRules,
  OrganizerBlock,
} from "./schemas";

export type AnswerMap = Map<string, unknown>;

function isGroup(node: ConditionalGroup | ConditionalLeaf): node is ConditionalGroup {
  return (node as ConditionalGroup).rules !== undefined;
}

function readScalar(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    // Rich text answer envelope: prefer plain-text projection of HTML
    if (obj.kind === "rich" && typeof obj.html === "string") {
      return (obj.html as string).replace(/<[^>]*>/g, "").trim();
    }
    if (obj.kind === "plain" && typeof obj.text === "string") return obj.text;
    // Signature
    if (obj.kind === "drawn" || obj.kind === "typed") {
      return obj.typedName ?? obj.storagePath ?? "";
    }
    // Multi-file
    if (Array.isArray(obj.files)) {
      return (obj.files as unknown[]).length;
    }
    // Matrix
    if (obj.selections && typeof obj.selections === "object") {
      const sel = obj.selections as Record<string, unknown>;
      return Object.values(sel).flat().filter(Boolean).join(",");
    }
    if ("text" in obj) return obj.text;
    if ("value" in obj) return obj.value;
    if ("optionId" in obj) return obj.optionId;
    if ("optionIds" in obj) return obj.optionIds;
    if ("iso" in obj) return obj.iso;
  }
  return value;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function evalLeaf(leaf: ConditionalLeaf, answers: AnswerMap): boolean {
  const raw = answers.get(leaf.blockId);
  const lhs = readScalar(raw);
  const rhs = leaf.value;
  switch (leaf.op) {
    case "equals":
      return Array.isArray(lhs) ? false : lhs === rhs;
    case "not_equals":
      return lhs !== rhs;
    case "in":
      return Array.isArray(rhs) && (rhs as unknown[]).includes(lhs as never);
    case "not_in":
      return Array.isArray(rhs) && !(rhs as unknown[]).includes(lhs as never);
    case "gt":
      return typeof lhs === "number" && typeof rhs === "number" && lhs > rhs;
    case "gte":
      return typeof lhs === "number" && typeof rhs === "number" && lhs >= rhs;
    case "lt":
      return typeof lhs === "number" && typeof rhs === "number" && lhs < rhs;
    case "lte":
      return typeof lhs === "number" && typeof rhs === "number" && lhs <= rhs;
    case "is_empty":
      return isEmpty(lhs);
    case "is_not_empty":
      return !isEmpty(lhs);
    case "contains":
      if (Array.isArray(lhs)) return (lhs as unknown[]).includes(rhs as never);
      if (typeof lhs === "string" && typeof rhs === "string") return lhs.includes(rhs);
      return false;
    default:
      return false;
  }
}

function evalGroup(group: ConditionalGroup, answers: AnswerMap): boolean {
  if (!group.rules.length) return true;
  const results = group.rules.map((r) =>
    isGroup(r) ? evalGroup(r, answers) : evalLeaf(r, answers),
  );
  return group.op === "AND" ? results.every(Boolean) : results.some(Boolean);
}

export function isBlockShown(rules: ConditionalRules | undefined, answers: AnswerMap): boolean {
  if (!rules) return true;
  return evalGroup(rules.show_when, answers);
}

/**
 * Compute the visible-block id set for an entire template, honoring
 * section cascading. `answers` maps blockId → value_json shape.
 */
export function computeVisibleBlockIds(blocks: OrganizerBlock[], answers: AnswerMap): Set<string> {
  const visible = new Set<string>();
  const byId = new Map(blocks.map((b) => [b.id, b]));

  const ownRules = (b: OrganizerBlock): ConditionalRules =>
    (b.conditional_rules_json as unknown as ConditionalRules) ?? null;

  const isShown = (b: OrganizerBlock): boolean => {
    if (!isBlockShown(ownRules(b), answers)) return false;
    if (b.parent_id) {
      const parent = byId.get(b.parent_id);
      if (parent && !isShown(parent)) return false;
    }
    return true;
  };

  for (const b of blocks) {
    if (isShown(b)) visible.add(b.id);
  }
  return visible;
}
