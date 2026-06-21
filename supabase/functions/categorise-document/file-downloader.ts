// Isolated file download — swap this module when migrating to Microsoft Graph API / SharePoint.
import { type SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function downloadFile(
  storagePath: string,
  supabase: SupabaseClient,
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage
    .from("task-attachments")
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message ?? "no data"}`);
  }

  return new Uint8Array(await data.arrayBuffer());
}
