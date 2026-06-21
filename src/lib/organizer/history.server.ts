import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { JsonValue } from "./schemas";

export interface ResponseHistoryRow {
  id: string;
  deployment_id: string;
  block_id: string;
  previous_value_json: JsonValue;
  new_value_json: JsonValue;
  changed_by: string | null;
  changed_at: string;
  changed_by_name: string | null;
}

export async function getResponseHistoryServer(args: {
  deployment_id: string;
  block_id: string;
}): Promise<ResponseHistoryRow[]> {
  const { data, error } = await supabaseAdmin
    .from("organizer_response_history")
    .select(
      "id, deployment_id, block_id, previous_value_json, new_value_json, changed_by, changed_at",
    )
    .eq("deployment_id", args.deployment_id)
    .eq("block_id", args.block_id)
    .order("changed_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    deployment_id: string;
    block_id: string;
    previous_value_json: JsonValue;
    new_value_json: JsonValue;
    changed_by: string | null;
    changed_at: string;
  }>;
  const userIds = Array.from(
    new Set(rows.map((r) => r.changed_by).filter((x): x is string => !!x)),
  );
  let nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    nameMap = new Map(
      (profs ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p.full_name ?? p.email ?? "Unknown",
      ]),
    );
  }
  return rows.map((r) => ({
    ...r,
    changed_by_name: r.changed_by ? (nameMap.get(r.changed_by) ?? null) : null,
  }));
}
