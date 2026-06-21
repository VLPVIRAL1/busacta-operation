import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service | Busacta" },
      { name: "description", content: "Terms governing use of the Busacta platform." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 prose prose-slate dark:prose-invert">
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Effective: 14 May 2026</p>

      <h2>1. Agreement</h2>
      <p>
        By accessing the platform you agree to these Terms. If you are using it on behalf of an
        organisation you represent that you have authority to bind that organisation.
      </p>

      <h2>2. Account &amp; security</h2>
      <p>
        You are responsible for keeping credentials confidential, enabling MFA when required, and
        notifying us promptly of any suspected unauthorised access.
      </p>

      <h2>3. Acceptable use</h2>
      <p>
        No reverse engineering, no scraping, no attempts to bypass security controls, no use that
        violates law or third-party rights.
      </p>

      <h2>4. Customer data</h2>
      <p>
        You retain ownership of data you upload. We process it only to provide the service per our{" "}
        <a href="/legal/dpa">DPA</a>.
      </p>

      <h2>5. Availability</h2>
      <p>
        We target 99.5% monthly uptime but do not guarantee uninterrupted service. Scheduled
        maintenance is announced in advance.
      </p>

      <h2>6. Termination</h2>
      <p>
        You may close your account at any time. We may suspend access for breach of these Terms or
        applicable law. On termination, data is exportable for 30 days, then deleted subject to
        legal-retention obligations.
      </p>

      <h2>7. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, our aggregate liability is limited to fees paid in
        the 12 months preceding the claim.
      </p>

      <h2>8. Governing law</h2>
      <p>These Terms are governed by the laws of the jurisdiction stated in your order form.</p>

      <h2>9. Contact</h2>
      <p>
        <a href="mailto:legal@busacta.com">legal@busacta.com</a>
      </p>
    </main>
  );
}
