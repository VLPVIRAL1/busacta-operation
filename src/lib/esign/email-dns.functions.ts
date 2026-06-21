/**
 * DNS verification for the project's outgoing-email subdomain.
 *
 * Lovable Emails delegates a subdomain (default `notify.<root>`) to
 * `ns3.lovable.cloud` / `ns4.lovable.cloud`. Until those NS records are
 * live at the user's registrar, the email queue accepts sends but the
 * provider can't dispatch them. This server fn queries public DNS via
 * Cloudflare DoH and returns an actionable checklist for the UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const REQUIRED_NS = ["ns3.lovable.cloud", "ns4.lovable.cloud"];

type DohAnswer = { name: string; type: number; TTL: number; data: string };

async function dohQuery(
  name: string,
  type: "NS" | "MX" | "TXT" | "A" | "CNAME",
): Promise<{ status: number; answers: DohAnswer[] }> {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    { headers: { accept: "application/dns-json" } },
  );
  if (!res.ok) throw new Error(`DoH ${type} ${name} failed: ${res.status}`);
  const json = (await res.json()) as { Status: number; Answer?: DohAnswer[] };
  return { status: json.Status, answers: json.Answer ?? [] };
}

function stripTrailingDot(s: string): string {
  return s.replace(/\.$/, "").toLowerCase();
}

export type EmailDnsCheck = {
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  fix?: string;
};

export type EmailDnsResult = {
  root_domain: string;
  sender_subdomain: string;
  overall: "ok" | "warn" | "fail";
  checks: EmailDnsCheck[];
  next_steps: string[];
};

export const checkEsignEmailDns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        root_domain: z.string().trim().min(3).max(253).optional(),
        sender_subdomain: z.string().trim().min(3).max(253).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<EmailDnsResult> => {
    const root = (data.root_domain ?? "one.busacta.com").toLowerCase();
    const sender = (data.sender_subdomain ?? `notify.${root}`).toLowerCase();

    const checks: EmailDnsCheck[] = [];

    // 1. NS delegation on the sender subdomain.
    let nsOk = false;
    try {
      const { answers } = await dohQuery(sender, "NS");
      const got = answers.map((a) => stripTrailingDot(a.data)).sort();
      const missing = REQUIRED_NS.filter((n) => !got.includes(n));
      if (got.length === 0) {
        checks.push({
          label: `NS records on ${sender}`,
          status: "fail",
          detail:
            "No NS records found. The subdomain is not delegated to Lovable's nameservers yet.",
          fix: `At your domain registrar (where ${root} is managed), add two NS records on the host "notify" pointing to ns3.lovable.cloud and ns4.lovable.cloud. DNS can take up to 72 hours to propagate.`,
        });
      } else if (missing.length > 0) {
        checks.push({
          label: `NS records on ${sender}`,
          status: "fail",
          detail: `Found NS [${got.join(", ")}] but missing [${missing.join(", ")}].`,
          fix: `Replace the existing NS records on host "notify" with exactly: ns3.lovable.cloud and ns4.lovable.cloud. Remove any other NS values on that host.`,
        });
      } else {
        nsOk = true;
        checks.push({
          label: `NS records on ${sender}`,
          status: "ok",
          detail: `Delegated to ${REQUIRED_NS.join(" + ")}.`,
        });
      }
    } catch (e) {
      checks.push({
        label: `NS records on ${sender}`,
        status: "fail",
        detail: `DNS lookup failed: ${e instanceof Error ? e.message : String(e)}`,
        fix: "Retry in a few seconds. If this keeps failing, your DNS provider may be blocking public queries.",
      });
    }

    // 2. MX records (only meaningful once delegation works).
    try {
      const { answers } = await dohQuery(sender, "MX");
      if (answers.length === 0) {
        checks.push({
          label: `MX records on ${sender}`,
          status: nsOk ? "warn" : "warn",
          detail: nsOk
            ? "No MX records visible yet. Lovable provisions MX automatically after NS delegation — this usually finalizes within a few minutes."
            : "Cannot check MX records until NS delegation is in place.",
          fix: nsOk
            ? "Wait a few minutes for Lovable to provision MX, then re-run the check."
            : undefined,
        });
      } else {
        checks.push({
          label: `MX records on ${sender}`,
          status: "ok",
          detail: `Found ${answers.length} MX record${answers.length === 1 ? "" : "s"}.`,
        });
      }
    } catch (e) {
      checks.push({
        label: `MX records on ${sender}`,
        status: "warn",
        detail: `Lookup failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    // 3. SPF (TXT containing v=spf1) on the sender subdomain.
    try {
      const { answers } = await dohQuery(sender, "TXT");
      const txts = answers.map((a) => a.data.replace(/^"|"$/g, "").replace(/" "/g, ""));
      const spf = txts.find((t) => t.toLowerCase().startsWith("v=spf1"));
      if (spf) {
        checks.push({
          label: `SPF on ${sender}`,
          status: "ok",
          detail: spf,
        });
      } else {
        checks.push({
          label: `SPF on ${sender}`,
          status: nsOk ? "warn" : "warn",
          detail: "No SPF record visible.",
          fix: nsOk
            ? "Lovable provisions SPF automatically after delegation. Wait a few minutes and re-check."
            : undefined,
        });
      }
    } catch (e) {
      checks.push({
        label: `SPF on ${sender}`,
        status: "warn",
        detail: `Lookup failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }

    const overall: EmailDnsResult["overall"] = checks.some((c) => c.status === "fail")
      ? "fail"
      : checks.some((c) => c.status === "warn")
        ? "warn"
        : "ok";

    const next_steps: string[] = [];
    if (overall === "ok") {
      next_steps.push(
        "DNS looks good. Send a test envelope and confirm the email lands in your inbox.",
      );
      next_steps.push(
        "If recipients still don't get the email, check Lovable Cloud → Emails for delivery logs.",
      );
    } else {
      next_steps.push(
        `Open your domain registrar (where ${root} DNS is managed) and verify the NS records on host "notify" are exactly ns3.lovable.cloud and ns4.lovable.cloud.`,
      );
      next_steps.push("DNS changes can take up to 72 hours to propagate worldwide.");
      next_steps.push(
        "Re-run this check after updating records. Lovable monitors verification status in Project Settings → Email.",
      );
    }

    return { root_domain: root, sender_subdomain: sender, overall, checks, next_steps };
  });
