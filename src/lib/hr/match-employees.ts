import { supabase } from "@/integrations/supabase/client";

export type EmployeeProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

export type MatchConfidence =
  | "exact_code"
  | "exact_email"
  | "exact_name"
  | "alias"
  | "fuzzy_name"
  | "unmatched";

export type EmployeeAlias = {
  id: string;
  raw_code: string;
  raw_name: string;
  employee_id: string;
};

const ALIAS_TABLE = "attendance_employee_aliases" as const;

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s.\-_]+/g, " ")
    .trim();
}

/** Tiny Levenshtein for fuzzy name matching (capped string lengths in practice). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length,
    n = b.length;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export type MatchInput = {
  employee_code: string;
  employee_name: string;
};

export type MatchResult = {
  employee_id: string | null;
  confidence: MatchConfidence;
  candidates?: Array<{ id: string; full_name: string; distance: number }>;
};

export function aliasKey(code: string, name: string): string {
  return `${code.trim().toLowerCase()}|${normalizeName(name)}`;
}

export type MatchContext = {
  byCode: Map<string, string>; // employee_code -> employee_id (when codes are tracked elsewhere)
  byEmail: Map<string, string>; // email -> id
  byName: Map<string, string[]>; // normalised name -> [ids]
  aliasMap: Map<string, string>; // aliasKey -> employee_id
  profiles: EmployeeProfile[];
};

export function buildMatchContext(
  profiles: EmployeeProfile[],
  aliases: EmployeeAlias[],
): MatchContext {
  const byCode = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const p of profiles) {
    if (p.email) byEmail.set(p.email.toLowerCase().trim(), p.id);
    if (p.full_name) {
      const k = normalizeName(p.full_name);
      const arr = byName.get(k) ?? [];
      arr.push(p.id);
      byName.set(k, arr);
    }
  }
  const aliasMap = new Map<string, string>();
  for (const a of aliases)
    aliasMap.set(aliasKey(a.raw_code ?? "", a.raw_name ?? ""), a.employee_id);
  return { byCode, byEmail, byName, aliasMap, profiles };
}

export function scoreRow(input: MatchInput, ctx: MatchContext): MatchResult {
  const code = (input.employee_code ?? "").trim();
  const name = (input.employee_name ?? "").trim();

  // 1. Alias memory (highest after exact matches because it's an explicit human decision).
  const ak = aliasKey(code, name);
  const alias = ctx.aliasMap.get(ak);
  if (alias) return { employee_id: alias, confidence: "alias" };

  // 2. Email in the code column.
  if (code.includes("@")) {
    const id = ctx.byEmail.get(code.toLowerCase());
    if (id) return { employee_id: id, confidence: "exact_email" };
  }

  // 3. Employee code (registered profiles' code is not in profiles; future-proof).
  if (code) {
    const id = ctx.byCode.get(code);
    if (id) return { employee_id: id, confidence: "exact_code" };
  }

  // 4. Exact name (only when unique).
  if (name) {
    const k = normalizeName(name);
    const hits = ctx.byName.get(k);
    if (hits && hits.length === 1) return { employee_id: hits[0], confidence: "exact_name" };
  }

  // 5. Fuzzy name — distance ≤ 2 OR ≤ 25% of length, whichever is larger.
  if (name) {
    const target = normalizeName(name);
    if (target.length >= 3) {
      const threshold = Math.max(2, Math.floor(target.length * 0.25));
      const candidates: Array<{ id: string; full_name: string; distance: number }> = [];
      for (const p of ctx.profiles) {
        if (!p.full_name) continue;
        const k = normalizeName(p.full_name);
        if (Math.abs(k.length - target.length) > threshold) continue;
        const d = levenshtein(target, k);
        if (d <= threshold) candidates.push({ id: p.id, full_name: p.full_name, distance: d });
      }
      candidates.sort((a, b) => a.distance - b.distance);
      if (candidates.length === 1 && candidates[0].distance <= 1) {
        return { employee_id: candidates[0].id, confidence: "fuzzy_name", candidates };
      }
      if (candidates.length > 0) {
        return { employee_id: null, confidence: "fuzzy_name", candidates: candidates.slice(0, 5) };
      }
    }
  }

  return { employee_id: null, confidence: "unmatched" };
}

export async function loadEmployeeAliases(): Promise<EmployeeAlias[]> {
  const { data, error } = await supabase
    .from(ALIAS_TABLE)
    .select("id, raw_code, raw_name, employee_id");
  if (error) {
    console.error("loadEmployeeAliases failed", error);
    return [];
  }
  return (data ?? []) as EmployeeAlias[];
}

export async function upsertEmployeeAlias(input: {
  raw_code: string;
  raw_name: string;
  employee_id: string;
}): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from(ALIAS_TABLE).upsert(
    {
      raw_code: input.raw_code.trim(),
      raw_name: input.raw_name.trim(),
      employee_id: input.employee_id,
      created_by: u.user?.id ?? null,
    },
    { onConflict: "raw_code,raw_name" },
  );
  if (error) console.error("upsertEmployeeAlias failed", error);
}
