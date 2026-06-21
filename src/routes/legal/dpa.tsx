import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/dpa")({
  head: () => ({
    meta: [
      { title: "Data Processing Addendum | Busacta" },
      {
        name: "description",
        content: "Data Processing Addendum (DPA) covering GDPR processor obligations.",
      },
    ],
  }),
  component: DpaPage,
});

function DpaPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 prose prose-slate dark:prose-invert">
      <h1>Data Processing Addendum</h1>
      <p className="text-sm text-muted-foreground">Forms part of the Terms of Service.</p>

      <h2>1. Roles</h2>
      <p>
        Customer is the <strong>controller</strong> of customer data; Busacta is the{" "}
        <strong>processor</strong>.
      </p>

      <h2>2. Subject matter &amp; duration</h2>
      <p>
        Processing is for the duration of the subscription and limited to providing the contracted
        services.
      </p>

      <h2>3. Nature &amp; purpose of processing</h2>
      <p>
        Storage, retrieval, computation, and presentation of customer-uploaded operational and
        financial records.
      </p>

      <h2>4. Categories of data subjects &amp; data</h2>
      <p>
        Customer's employees, contractors, and the customer's own clients. Identifiers, contact
        details, financial transaction records, task and time data.
      </p>

      <h2>5. Subprocessors</h2>
      <p>
        Lovable Cloud (database, storage, auth) and Cloudflare (edge / CDN). Customer is notified of
        new subprocessors with 30 days to object.
      </p>

      <h2>6. Security measures</h2>
      <p>
        See <a href="/legal/security">Security overview</a>. Includes encryption, MFA, RLS, and
        append-only audit logging.
      </p>

      <h2>7. Data subject requests</h2>
      <p>
        Busacta will assist Customer in responding to access, rectification, erasure, and
        portability requests within 30 days.
      </p>

      <h2>8. Breach notification</h2>
      <p>
        Busacta notifies Customer without undue delay and within 72 hours of confirming a
        personal-data breach.
      </p>

      <h2>9. International transfers</h2>
      <p>Where data crosses borders, Standard Contractual Clauses apply.</p>

      <h2>10. Audit rights</h2>
      <p>Customer may request our latest SOC 2 report under NDA once per year.</p>

      <h2>11. Return / deletion</h2>
      <p>
        On termination, customer data is exportable for 30 days, then deleted within 60 days
        (subject to legal retention).
      </p>

      <h2>12. Contact</h2>
      <p>
        <a href="mailto:privacy@busacta.com">privacy@busacta.com</a>
      </p>
    </main>
  );
}
