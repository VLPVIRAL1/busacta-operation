/**
 * Public verification — anyone with the slug can confirm a sealed envelope's
 * authenticity. Returns metadata, the SHA-256 fingerprint, and short-lived
 * signed URLs to the sealed PDF + tamper-evidence certificate. No auth.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const slugSchema = z.object({
  slug: z
    .string()
    .min(8)
    .max(128)
    .regex(/^[a-f0-9]+$/i),
});

export type VerificationResult =
  | { found: false }
  | {
      found: true;
      envelope: {
        id: string;
        title: string;
        status: string;
        completed_at: string | null;
      };
      sha256_hex: string;
      signature_algo: string;
      signed_at: string;
      sealed_pdf_url: string;
      certificate_pdf_url: string;
      recipients: Array<{
        full_name: string;
        email: string;
        routing_order: number;
        completed_at: string | null;
      }>;
    };

async function sign(path: string, downloadName?: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from("esign-signed")
    .createSignedUrl(path, 60 * 60, downloadName ? { download: downloadName } : undefined);
  if (error || !data) throw new Error(error?.message ?? "sign url failed");
  return data.signedUrl;
}

export const verifySealedEnvelope = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => slugSchema.parse(input))
  .handler(async ({ data }): Promise<VerificationResult> => {
    const { data: row, error } = await supabaseAdmin
      .from("esign_completed_documents")
      .select(
        "envelope_id, sealed_pdf_path, certificate_pdf_path, sha256_hex, signature_algo, signed_at",
      )
      .eq("verification_slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { found: false };

    const [envRes, rcpRes] = await Promise.all([
      supabaseAdmin
        .from("esign_envelopes")
        .select("id, title, status, completed_at")
        .eq("id", row.envelope_id)
        .single(),
      supabaseAdmin
        .from("esign_recipients")
        .select("full_name, email, routing_order, completed_at")
        .eq("envelope_id", row.envelope_id)
        .order("routing_order", { ascending: true }),
    ]);
    if (envRes.error || !envRes.data) throw new Error(envRes.error?.message ?? "Envelope missing");

    // Audit the lookup. Best-effort.
    try {
      const ua = (() => {
        try {
          return getRequestHeader("user-agent") ?? null;
        } catch {
          return null;
        }
      })();
      const ip = (() => {
        try {
          return (
            getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
            getRequestHeader("cf-connecting-ip") ??
            null
          );
        } catch {
          return null;
        }
      })();
      await supabaseAdmin.from("esign_audit_log").insert({
        envelope_id: row.envelope_id,
        event: "verification_scanned",
        user_agent: ua,
        ip: ip ?? null,
        metadata_json: { slug: data.slug },
      });
    } catch {
      /* swallow */
    }

    const [sealedUrl, certUrl] = await Promise.all([
      sign(row.sealed_pdf_path, "sealed-document.pdf"),
      sign(row.certificate_pdf_path, "certificate-of-completion.pdf"),
    ]);

    return {
      found: true,
      envelope: envRes.data,
      sha256_hex: row.sha256_hex,
      signature_algo: row.signature_algo,
      signed_at: row.signed_at,
      sealed_pdf_url: sealedUrl,
      certificate_pdf_url: certUrl,
      recipients: rcpRes.data ?? [],
    };
  });

const idSchema = z.object({ envelope_id: z.string().uuid() });

/**
 * Authenticated lookup used by the envelope detail page to fetch the sealed
 * PDF + certificate URLs after completion. Re-uses the public verifier but
 * starts from envelope_id instead of slug (the slug is also returned so the
 * page can deep-link to /verify/<slug>).
 */
export const getCompletedEnvelopeAssets = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("esign_completed_documents")
      .select("verification_slug, sealed_pdf_path, certificate_pdf_path, sha256_hex, signed_at")
      .eq("envelope_id", data.envelope_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { sealed: false as const };
    const [sealedUrl, certUrl] = await Promise.all([
      sign(row.sealed_pdf_path, "sealed-document.pdf"),
      sign(row.certificate_pdf_path, "certificate-of-completion.pdf"),
    ]);
    return {
      sealed: true as const,
      slug: row.verification_slug,
      sha256_hex: row.sha256_hex,
      signed_at: row.signed_at,
      sealed_pdf_url: sealedUrl,
      certificate_pdf_url: certUrl,
    };
  });
