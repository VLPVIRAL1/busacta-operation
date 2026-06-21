/**
 * Server-only helpers for the Contracts (NDA/SLA) feature.
 * Imported only by functions.ts.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  ContractDocument,
  ContractProfile,
  ContractTemplate,
  CreateContractProfileInput,
  ListDocumentsInput,
  ListProfilesInput,
  ListTemplatesInput,
  ProfileMergeBundle,
  RecordContractDocumentInput,
  UpdateContractProfileInput,
  UpsertContractTemplateInput,
} from "./schemas";

function asProfile(row: Record<string, unknown>): ContractProfile {
  return row as unknown as ContractProfile;
}
function asTemplate(row: Record<string, unknown>): ContractTemplate {
  return row as unknown as ContractTemplate;
}
function asDocument(row: Record<string, unknown>): ContractDocument {
  return row as unknown as ContractDocument;
}

// ─── Profiles ────────────────────────────────────────────────────────────────

export async function listProfilesServer(args?: ListProfilesInput): Promise<ContractProfile[]> {
  let q = supabaseAdmin
    .from("contract_profiles")
    .select("*")
    .order("updated_at", { ascending: false });
  if (args?.contractType) q = q.eq("contract_type", args.contractType);
  if (args?.status) q = q.eq("status", args.status);
  if (args?.ownerId) q = q.eq("owner_id", args.ownerId);
  if (args?.jurisdiction) q = q.eq("jurisdiction", args.jurisdiction);
  if (args?.search) q = q.ilike("registered_legal_name", `%${args.search}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(asProfile);
}

export async function createProfileServer(
  args: CreateContractProfileInput & { createdBy: string },
): Promise<ContractProfile> {
  const { createdBy, ...rest } = args;
  const { data, error } = await supabaseAdmin
    .from("contract_profiles")
    .insert({ ...rest, created_by: createdBy } as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asProfile(data);
}

export async function updateProfileServer(
  args: UpdateContractProfileInput,
): Promise<ContractProfile> {
  const { id, ...patch } = args;
  const { data, error } = await supabaseAdmin
    .from("contract_profiles")
    .update(patch as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asProfile(data);
}

export async function deleteProfileServer(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("contract_profiles").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Profile + joined lead company / campaign name + firm name, for generation. */
export async function getProfileMergeBundleServer(id: string): Promise<ProfileMergeBundle> {
  const { data, error } = await supabaseAdmin
    .from("contract_profiles")
    .select("*, leads(company_name), marketing_campaigns(name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Contract profile not found");

  const row = data as Record<string, unknown>;
  const lead = row.leads as { company_name?: string } | null;
  const campaign = row.marketing_campaigns as { name?: string } | null;

  const { data: firm } = await supabaseAdmin
    .from("firms")
    .select("name")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return {
    profile: asProfile(row),
    leadCompany: lead?.company_name ?? null,
    campaignName: campaign?.name ?? null,
    firmName: (firm as { name?: string } | null)?.name ?? null,
  };
}

// ─── Templates ───────────────────────────────────────────────────────────────

export async function listTemplatesServer(args?: ListTemplatesInput): Promise<ContractTemplate[]> {
  let q = supabaseAdmin
    .from("contract_templates")
    .select("*")
    .order("updated_at", { ascending: false });
  if (args?.contractType) q = q.eq("contract_type", args.contractType);
  if (args?.status) q = q.eq("status", args.status);
  if (args?.jurisdiction) q = q.eq("jurisdiction", args.jurisdiction);
  if (args?.search) q = q.ilike("name", `%${args.search}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(asTemplate);
}

export async function getTemplateServer(id: string): Promise<ContractTemplate | null> {
  const { data, error } = await supabaseAdmin
    .from("contract_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? asTemplate(data) : null;
}

export async function upsertTemplateServer(
  args: UpsertContractTemplateInput & { createdBy: string },
): Promise<ContractTemplate> {
  const { id, createdBy, ...rest } = args;
  if (id) {
    const { data, error } = await supabaseAdmin
      .from("contract_templates")
      .update(rest as never)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return asTemplate(data);
  }
  const { data, error } = await supabaseAdmin
    .from("contract_templates")
    .insert({ ...rest, created_by: createdBy, status: rest.status ?? "draft" } as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asTemplate(data);
}

export async function deleteTemplateServer(id: string): Promise<void> {
  const { error } = await supabaseAdmin.from("contract_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function duplicateTemplateServer(args: {
  id: string;
  actorId: string;
}): Promise<ContractTemplate> {
  const src = await getTemplateServer(args.id);
  if (!src) throw new Error("Template not found");
  const { data, error } = await supabaseAdmin
    .from("contract_templates")
    .insert({
      name: `${src.name} (Copy)`,
      description: src.description,
      contract_type: src.contract_type,
      status: "draft",
      body_html: src.body_html,
      body_json: src.body_json,
      version: 1,
      jurisdiction: src.jurisdiction,
      created_by: args.actorId,
    } as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asTemplate(data);
}

// ─── Link option lookups (for the profile form pickers) ─────────────────────

export interface LinkOption {
  id: string;
  label: string;
}

export async function listLeadOptionsServer(): Promise<LinkOption[]> {
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("id, company_name")
    .order("company_name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => ({ id: l.id as string, label: l.company_name as string }));
}

export async function listCampaignOptionsServer(): Promise<LinkOption[]> {
  const { data, error } = await supabaseAdmin
    .from("marketing_campaigns")
    .select("id, name")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ id: c.id as string, label: c.name as string }));
}

// ─── Audit trail ───────────────────────────────────────────────────────────────

export async function recordContractDocumentServer(
  args: RecordContractDocumentInput & { generatedBy: string },
): Promise<ContractDocument> {
  const { generatedBy, ...rest } = args;
  const { data, error } = await supabaseAdmin
    .from("contract_documents")
    .insert({
      template_id: rest.template_id ?? null,
      template_name: rest.template_name,
      profile_id: rest.profile_id ?? null,
      profile_name: rest.profile_name,
      contract_type: rest.contract_type,
      output_format: rest.output_format,
      file_name: rest.file_name,
      generated_by: generatedBy,
    } as never)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asDocument(data);
}

export async function listDocumentsServer(args?: ListDocumentsInput): Promise<ContractDocument[]> {
  let q = supabaseAdmin
    .from("contract_documents")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(500);
  if (args?.contractType) q = q.eq("contract_type", args.contractType);
  if (args?.outputFormat) q = q.eq("output_format", args.outputFormat);
  if (args?.generatedBy) q = q.eq("generated_by", args.generatedBy);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(asDocument);
}
