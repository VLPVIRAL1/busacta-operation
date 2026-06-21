/**
 * Server-only helpers for organizer public share links.
 * All callers MUST already be authenticated/authorized.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface OrganizerPublicLink {
  id: string;
  template_id: string;
  token: string;
  label: string | null;
  created_by: string;
  firm_id: string | null;
  expires_at: string | null;
  max_submissions: number | null;
  require_identity: boolean;
  password_hash: string | null;
  revoked_at: string | null;
  submission_count: number;
  created_at: string;
  updated_at: string;
}

function genToken(): string {
  // 32 url-safe chars (~192 bits)
  return randomBytes(24).toString("base64url");
}

function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64);
  return `s1$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [v, saltHex, hashHex] = stored.split("$");
  if (v !== "s1" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const got = scryptSync(plain, salt, expected.length);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export async function createPublicLinkServer(args: {
  template_id: string;
  created_by: string;
  label?: string | null;
  firm_id?: string | null;
  expires_at?: string | null;
  max_submissions?: number | null;
  require_identity?: boolean;
  password?: string | null;
}): Promise<OrganizerPublicLink> {
  // Verify template is published
  const { data: tpl, error: tplErr } = await supabaseAdmin
    .from("organizer_templates")
    .select("id, status")
    .eq("id", args.template_id)
    .single();
  if (tplErr) throw new Error(tplErr.message);
  if (tpl.status !== "published") {
    throw new Error("Only published templates can have public links");
  }

  const { data, error } = await supabaseAdmin
    .from("organizer_public_links")
    .insert({
      template_id: args.template_id,
      token: genToken(),
      label: args.label ?? null,
      created_by: args.created_by,
      firm_id: args.firm_id ?? null,
      expires_at: args.expires_at ?? null,
      max_submissions: args.max_submissions ?? null,
      require_identity: args.require_identity ?? true,
      password_hash: args.password ? hashPassword(args.password) : null,
    } as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as OrganizerPublicLink;
}

export async function listPublicLinksServer(templateId: string): Promise<OrganizerPublicLink[]> {
  const { data, error } = await supabaseAdmin
    .from("organizer_public_links")
    .select("*")
    .eq("template_id", templateId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrganizerPublicLink[];
}

export async function revokePublicLinkServer(id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("organizer_public_links")
    .update({ revoked_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deletePublicLinkServer(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("organizer_public_links").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Lookup an active public link by its URL token. Returns null if revoked/expired. */
export async function getActivePublicLinkServer(
  token: string,
): Promise<OrganizerPublicLink | null> {
  const { data, error } = await supabaseAdmin
    .from("organizer_public_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const link = data as unknown as OrganizerPublicLink;
  if (link.revoked_at) return null;
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) return null;
  if (link.max_submissions !== null && link.submission_count >= link.max_submissions) return null;
  return link;
}
