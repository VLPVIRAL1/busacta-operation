import { supabase } from "@/integrations/supabase/client";

export type MappingPreset = {
  id: string;
  name: string;
  description: string | null;
  mapping: Record<string, string>;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

const TABLE = "attendance_import_mapping_presets" as const;

export async function listMappingPresets(): Promise<MappingPreset[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, name, description, mapping, is_default, created_at, updated_at")
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MappingPreset[];
}

export async function saveMappingPreset(input: {
  name: string;
  description?: string | null;
  mapping: Record<string, string>;
  is_default?: boolean;
}): Promise<MappingPreset> {
  const { data: u } = await supabase.auth.getUser();
  if (input.is_default) {
    // Clear any existing default first to satisfy the partial unique index.
    await supabase.from(TABLE).update({ is_default: false }).eq("is_default", true);
  }
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      mapping: input.mapping,
      is_default: !!input.is_default,
      created_by: u.user?.id ?? null,
    })
    .select("id, name, description, mapping, is_default, created_at, updated_at")
    .single();
  if (error) throw error;
  return data as MappingPreset;
}

export async function updateMappingPreset(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    mapping?: Record<string, string>;
    is_default?: boolean;
  },
): Promise<void> {
  if (input.is_default) {
    await supabase.from(TABLE).update({ is_default: false }).eq("is_default", true).neq("id", id);
  }
  const patch: {
    name?: string;
    description?: string | null;
    mapping?: Record<string, string>;
    is_default?: boolean;
  } = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.mapping !== undefined) patch.mapping = input.mapping;
  if (input.is_default !== undefined) patch.is_default = !!input.is_default;
  const { error } = await supabase.from(TABLE).update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteMappingPreset(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/**
 * Filter a preset's mapping down to columns that actually exist in the file.
 * Returns { applied, missing } so the UI can warn about dropped entries.
 */
export function applyPresetToFile(
  preset: Pick<MappingPreset, "mapping">,
  fileHeaders: string[],
): { applied: Record<string, string>; missing: Array<{ field: string; column: string }> } {
  const set = new Set(fileHeaders);
  const applied: Record<string, string> = {};
  const missing: Array<{ field: string; column: string }> = [];
  for (const [field, column] of Object.entries(preset.mapping)) {
    if (!column) continue;
    if (set.has(column)) applied[field] = column;
    else missing.push({ field, column });
  }
  return { applied, missing };
}
