import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy | Busacta" },
      {
        name: "description",
        content: "How Busacta collects, uses, and protects your data. GDPR and CCPA aligned.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 prose prose-slate dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Effective: 14 May 2026</p>

      <h2>1. Who we are</h2>
      <p>
        Busacta operates this platform for accounting and operations management. We act as a{" "}
        <strong>data processor</strong> for customer data and as a <strong>controller</strong> for
        account and billing data.
      </p>

      <h2>2. Data we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong> — name, email, role.
        </li>
        <li>
          <strong>Firm &amp; client records</strong> — firm details, contacts, projects, invoices,
          tasks.
        </li>
        <li>
          <strong>Audit &amp; security logs</strong> — request IP, user agent, access events.
        </li>
      </ul>
      <p>
        We do not intentionally collect protected health information (PHI). Healthcare-regulated
        data requires a signed Business Associate Agreement before onboarding.
      </p>

      <h2>3. How we use it</h2>
      <p>
        To provide the service, secure it, satisfy legal/tax obligations (7-year retention for
        financial records), and improve product quality.
      </p>

      <h2>4. Sharing</h2>
      <p>
        Data is processed by vetted subprocessors under signed DPAs: Lovable Cloud (database,
        storage, auth) and Cloudflare (edge / CDN). We do not sell personal data.
      </p>

      <h2>5. Your rights</h2>
      <p>
        Access, rectification, erasure, portability, and the right to lodge a complaint with your
        supervisory authority. Email <a href="mailto:privacy@busacta.com">privacy@busacta.com</a> —
        we respond within 30 days.
      </p>

      <h2>6. Security</h2>
      <p>
        TLS in transit, AES-256 at rest, MFA required for privileged roles, append-only audit trail,
        leaked-password protection (HIBP). See our <a href="/legal/security">Security overview</a>.
      </p>

      <h2>7. Retention</h2>
      <p>Account data: life of account + 7 years. Audit logs: 7 years. Technical logs: 90 days.</p>

      <h2>8. Contact</h2>
      <p>
        Privacy Officer — <a href="mailto:privacy@busacta.com">privacy@busacta.com</a>
      </p>
    </main>
  );
}
