/**
 * Public verification page — no auth. Anyone holding a slug (typically from
 * the QR code stamped on the sealed PDF) can confirm authenticity, view the
 * SHA-256 fingerprint, and download both the sealed PDF and the certificate.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, ShieldAlert, FileSignature, FileBadge2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { verifySealedEnvelope, type VerificationResult } from "@/lib/esign/verify.functions";

export const Route = createFileRoute("/verify/$slug")({
  component: VerifyPage,
});

function VerifyPage() {
  const { slug } = Route.useParams();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; data: VerificationResult }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    verifySealedEnvelope({ data: { slug } })
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Verification failed",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="esign-scope esign-signer-bg min-h-screen">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-4">
          <FileSignature className="h-5 w-5 text-primary" />
          <div>
            <div className="text-sm font-semibold">BusAcTa Operations — Signature Verification</div>
            <div className="text-xs text-muted-foreground">Public integrity check</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {state.kind === "loading" && (
          <Card>
            <CardContent className="space-y-3 p-6">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        )}

        {state.kind === "error" && (
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              <CardTitle className="text-base">Unable to verify</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{state.message}</CardContent>
          </Card>
        )}

        {state.kind === "ready" && !state.data.found && (
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              <CardTitle className="text-base">No record found</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              This verification code does not match any sealed envelope. The link may be mistyped or
              the document may have been revoked.
            </CardContent>
          </Card>
        )}

        {state.kind === "ready" && state.data.found && <VerifiedCard data={state.data} />}
      </main>
    </div>
  );
}

function VerifiedCard({ data }: { data: Extract<VerificationResult, { found: true }> }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-semibold">
                Authentic — sealed by BusAcTa Operations
              </span>
            </div>
            <CardTitle className="mt-2 text-xl">{data.envelope.title}</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">Envelope {data.envelope.id}</div>
          </div>
          <Badge variant="outline" className="capitalize">
            {data.envelope.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="grid gap-3 sm:grid-cols-2">
          <Field label="Sealed at" value={new Date(data.signed_at).toLocaleString()} />
          <Field label="Algorithm" value={data.signature_algo} />
          <Field label="SHA-256" value={data.sha256_hex} mono className="sm:col-span-2" />
        </section>

        <section>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Signers
          </div>
          <ul className="divide-y rounded-md border">
            {data.recipients.map((r) => (
              <li
                key={r.email}
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{r.full_name}</div>
                  <div className="text-xs text-muted-foreground">{r.email}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.completed_at
                    ? `Signed ${new Date(r.completed_at).toLocaleDateString()}`
                    : "Pending"}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={data.sealed_pdf_url} target="_blank" rel="noopener noreferrer">
              <FileSignature className="mr-2 h-4 w-4" />
              Download sealed PDF
            </a>
          </Button>
          <Button asChild variant="secondary">
            <a href={data.certificate_pdf_url} target="_blank" rel="noopener noreferrer">
              <FileBadge2 className="mr-2 h-4 w-4" />
              Download certificate
            </a>
          </Button>
        </section>

        <p className="text-xs text-muted-foreground">
          To verify integrity, recompute SHA-256 of the downloaded sealed PDF and compare to the
          fingerprint above. Any mismatch indicates tampering.
        </p>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={mono ? "mt-1 break-all font-mono text-xs" : "mt-1 text-sm"}>{value}</div>
    </div>
  );
}
