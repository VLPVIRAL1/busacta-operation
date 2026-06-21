import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/security")({
  head: () => ({
    meta: [
      { title: "Security | Busacta" },
      {
        name: "description",
        content:
          "How Busacta protects your data: encryption, MFA, audit logging, and SOC 2 readiness.",
      },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 prose prose-slate dark:prose-invert">
      <h1>Security overview</h1>

      <h2>Encryption</h2>
      <p>
        TLS 1.2+ in transit (HSTS preload). AES-256 at rest for the database and object storage.
      </p>

      <h2>Authentication &amp; access</h2>
      <ul>
        <li>Email + password with HIBP leaked-password check.</li>
        <li>TOTP MFA mandatory for admin, finance, and HR roles.</li>
        <li>Rate limiting: 5 failed attempts / 15 min triggers lockout.</li>
        <li>Server-side session revocation available to platform administrators.</li>
      </ul>

      <h2>Authorization</h2>
      <p>
        Postgres Row-Level Security on every user-data table. Capability-based checks scoped to firm
        and role.
      </p>

      <h2>Auditability</h2>
      <p>
        Every privileged action and data mutation lands in an append-only audit log retained for 7
        years. Sensitive actions (role grants, payment ops, MFA changes) are double-logged.
      </p>

      <h2>Compliance posture</h2>
      <p>
        SOC 2 Type 2 readiness in progress. HIPAA-defensive controls applied; we do not currently
        store PHI and require a BAA before any healthcare-regulated data is onboarded.
      </p>

      <h2>Vulnerability reporting</h2>
      <p>
        Email <a href="mailto:security@busacta.com">security@busacta.com</a>. Acknowledged within 1
        business day; HIGH/CRITICAL fixed within 7 days.
      </p>
    </main>
  );
}
