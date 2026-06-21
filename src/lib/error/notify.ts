import { supabase } from "@/integrations/supabase/client";

export interface NotifyInput {
  user_ids: string[];
  kind:
    | "mention"
    | "task_assigned"
    | "task_watching"
    | "task_status"
    | "open_point"
    | "note"
    | "reminder";
  title: string;
  body?: string | null;
  url?: string | null;
  task_id?: string | null;
  project_id?: string | null;
  firm_id?: string | null;
}

/**
 * Insert a notification row for each recipient. Failures are logged but never thrown
 * so notification side-effects don't break the primary action.
 */
export async function notify(input: NotifyInput) {
  const ids = Array.from(new Set(input.user_ids.filter(Boolean)));
  if (ids.length === 0) return;
  const rows = ids.map((user_id) => ({
    user_id,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    url: input.url ?? null,
    task_id: input.task_id ?? null,
    project_id: input.project_id ?? null,
    firm_id: input.firm_id ?? null,
  }));
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) console.error("[notify]", error);
}

/** Pull mention IDs from a body containing @[name](uuid) tokens. */
export function extractMentionIds(body: string): string[] {
  const ids = new Set<string>();
  const re = /@\[[^\]]+\]\(([0-9a-f-]{36})\)/g;
  let m;
  while ((m = re.exec(body)) !== null) ids.add(m[1]);
  return Array.from(ids);
}
