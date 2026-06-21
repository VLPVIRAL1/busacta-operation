/**
 * Logo upload helper for PDF templates.
 * Lives in lib/ so it can import the Supabase client per project conventions.
 */
import { supabase } from "@/integrations/supabase/client";

export async function uploadTemplateLogo(templateId: string, file: File): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  const path = `pdf-templates/logos/${templateId}-${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
  if (error) throw new Error(error.message);
  return path;
}
