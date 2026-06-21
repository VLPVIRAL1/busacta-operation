import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Trash2, Loader2, KeyRound, Copy, Download } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { generateMfaBackupCodes, getMfaBackupStatus } from "@/lib/auth/mfa-backup.functions";
import {
  listOtpChannels,
  removeOtpChannel,
  startOtpEnrollment,
  verifyOtpEnrollment,
} from "@/lib/auth/otp.functions";

export const Route = createFileRoute("/security/mfa")({
  component: () => (
    <AuthGuard>
      <AppShell crumbs={[{ label: "Security" }, { label: "Two-factor (MFA)" }]}>
        <PageHeader
          title="Two-factor authentication"
          description="Add an extra layer of security to your account using an authenticator app."
        />
        <MfaPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

type Factor = { id: string; friendly_name?: string | null; status: string; factor_type: string };

function MfaPage() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);

  // Enrollment state
  const [enrolling, setEnrolling] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setFactors([...(data.totp ?? []), ...(data.phone ?? [])] as Factor[]);
  };

  useEffect(() => {
    refresh();
  }, []);

  const startEnroll = async () => {
    setEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toLocaleDateString()}`,
    });
    if (error) {
      setEnrolling(false);
      toast.error(error.message);
      return;
    }
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
  };

  const cancelEnroll = async () => {
    if (factorId) await supabase.auth.mfa.unenroll({ factorId });
    setFactorId(null);
    setQr(null);
    setSecret(null);
    setCode("");
    setEnrolling(false);
  };

  const finishEnroll = async () => {
    if (!factorId || !code) return;
    setVerifying(true);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr) {
      setVerifying(false);
      toast.error(chErr.message);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code });
    setVerifying(false);
    if (vErr) {
      toast.error(vErr.message);
      return;
    }
    toast.success("Two-factor authentication enabled");
    setFactorId(null);
    setQr(null);
    setSecret(null);
    setCode("");
    setEnrolling(false);
    refresh();
  };

  const removeFactor = async (id: string) => {
    if (!confirm("Remove this authenticator?")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Authenticator removed");
    refresh();
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Authenticator apps</CardTitle>
            <p className="text-xs text-muted-foreground">
              Use Google Authenticator, 1Password, Authy or any TOTP app.
            </p>
          </div>
          {!enrolling && (
            <Button onClick={startEnroll}>
              <ShieldCheck className="mr-1 h-4 w-4" />
              Add authenticator
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
              Loading…
            </div>
          ) : factors.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No authenticators yet.
            </div>
          ) : (
            <ul className="divide-y">
              {factors.map((f) => (
                <li key={f.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-sm font-medium">
                      {f.friendly_name || f.factor_type.toUpperCase()}
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {f.factor_type} · {f.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={f.status === "verified" ? "default" : "secondary"}>
                      {f.status}
                    </Badge>
                    <Button size="icon" variant="ghost" onClick={() => removeFactor(f.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {enrolling && qr && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scan QR code</CardTitle>
            <p className="text-xs text-muted-foreground">
              Scan with your authenticator app, then enter the 6-digit code below to confirm.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-4 flex-wrap">
              <img
                alt="MFA enrolment QR code"
                className="rounded-md border bg-white p-3 h-44 w-44"
                src={
                  qr.startsWith("data:") ? qr : `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`
                }
              />
              <div className="flex-1 min-w-[200px] space-y-2">
                <Label className="text-xs">Or enter this secret manually</Label>
                <code className="block break-all rounded-md border bg-muted px-2 py-1.5 text-xs">
                  {secret}
                </code>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>6-digit code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cancelEnroll}>
                Cancel
              </Button>
              <Button onClick={finishEnroll} disabled={code.length !== 6 || verifying}>
                {verifying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Verify & enable
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <BackupCodesCard hasFactor={factors.some((f) => f.status === "verified")} />
      <BackupChannelsCard />

      <p className="text-xs text-muted-foreground">
        Tip: After enabling, you'll be asked for a 6-digit code at every sign-in.{" "}
        <Link to="/global-dashboard" className="underline">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}

function BackupCodesCard({ hasFactor }: { hasFactor: boolean }) {
  const generateFn = useServerFn(generateMfaBackupCodes);
  const statusFn = useServerFn(getMfaBackupStatus);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  useEffect(() => {
    if (!hasFactor) {
      setRemaining(null);
      return;
    }
    statusFn()
      .then((r) => setRemaining(r.remaining))
      .catch(() => {});
  }, [hasFactor, statusFn]);

  const generate = async () => {
    if (!confirm("Generate new backup codes? This invalidates any previous codes.")) return;
    setGenerating(true);
    try {
      const r = await generateFn();
      setCodes(r.codes);
      setRemaining(r.codes.length);
      toast.success("Backup codes generated — save them now");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate codes");
    } finally {
      setGenerating(false);
    }
  };

  const copyAll = async () => {
    if (!codes) return;
    await navigator.clipboard.writeText(codes.join("\n"));
    toast.success("Copied to clipboard");
  };
  const download = () => {
    if (!codes) return;
    const blob = new Blob([codes.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mfa-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Backup recovery codes
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            One-time codes that let you sign in if you lose your authenticator device. Each code
            works once.
          </p>
        </div>
        {hasFactor && (
          <Button size="sm" variant="outline" onClick={generate} disabled={generating}>
            {generating && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            {remaining && remaining > 0 ? "Regenerate" : "Generate codes"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasFactor ? (
          <div className="text-sm text-muted-foreground">
            Enable an authenticator first to generate backup codes.
          </div>
        ) : codes ? (
          <>
            <div className="rounded-md border bg-muted/30 p-3 grid grid-cols-2 gap-2 font-mono text-sm">
              {codes.map((c, i) => (
                <div key={i}>{c}</div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={copyAll}>
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copy all
              </Button>
              <Button size="sm" variant="outline" onClick={download}>
                <Download className="h-3.5 w-3.5 mr-1" />
                Download .txt
              </Button>
            </div>
            <p className="text-xs text-amber-700">
              Store these somewhere safe — they won't be shown again.
            </p>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            {remaining === null
              ? "Loading…"
              : remaining > 0
                ? `${remaining} unused code(s) on file.`
                : "No backup codes yet."}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BackupChannelsCard() {
  const listFn = useServerFn(listOtpChannels);
  const startFn = useServerFn(startOtpEnrollment);
  const verifyFn = useServerFn(verifyOtpEnrollment);
  const removeFn = useServerFn(removeOtpChannel);
  const [loading, setLoading] = useState(true);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [channels, setChannels] = useState<
    { channel: "email" | "sms"; masked: string; verified: boolean }[]
  >([]);
  const [phone, setPhone] = useState("");
  const [pending, setPending] = useState<{
    channel: "email" | "sms";
    challengeId: string;
    masked: string;
  } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await listFn();
      setAccountEmail(r.accountEmail);
      setChannels(r.channels as any);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load channels");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);

  const start = async (channel: "email" | "sms") => {
    setBusy(true);
    try {
      const dest = channel === "email" ? (accountEmail ?? "") : phone.trim();
      if (!dest) {
        toast.error(channel === "email" ? "No account email" : "Enter your phone number");
        return;
      }
      const res = await startFn({ data: { channel, destination: dest } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPending({ channel, challengeId: res.challengeId, masked: res.masked });
      setCode("");
      toast.success(`Code sent to ${res.masked}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to send code");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await verifyFn({ data: { challengeId: pending.challengeId, code } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Channel verified");
      setPending(null);
      setCode("");
      setPhone("");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to verify");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (channel: "email" | "sms") => {
    if (!confirm(`Remove ${channel.toUpperCase()} as a backup sign-in channel?`)) return;
    const res = await removeFn({ data: { channel } });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Removed");
    await refresh();
  };

  const emailCh = channels.find((c) => c.channel === "email");
  const smsCh = channels.find((c) => c.channel === "sms");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          Backup sign-in channels
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Receive a one-time code by email or SMS as an alternative to your authenticator app.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            {/* Email row */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div className="text-sm">
                <div className="font-medium">Email code</div>
                <div className="text-xs text-muted-foreground">
                  {emailCh ? emailCh.masked : (accountEmail ?? "—")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {emailCh?.verified && <Badge variant="secondary">Verified</Badge>}
                {emailCh?.verified ? (
                  <Button size="sm" variant="ghost" onClick={() => remove("email")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => start("email")}
                    disabled={busy || !accountEmail}
                  >
                    Send test code
                  </Button>
                )}
              </div>
            </div>

            {/* SMS row */}
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <div className="font-medium">SMS code</div>
                  <div className="text-xs text-muted-foreground">
                    {smsCh ? smsCh.masked : "Not enrolled"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {smsCh?.verified && <Badge variant="secondary">Verified</Badge>}
                  {smsCh?.verified && (
                    <Button size="sm" variant="ghost" onClick={() => remove("sms")}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {!smsCh?.verified && (
                <div className="flex gap-2">
                  <Input
                    placeholder="+14155551234"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => start("sms")}
                    disabled={busy || phone.trim().length < 8}
                  >
                    Send code
                  </Button>
                </div>
              )}
            </div>

            {pending && (
              <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                <div className="text-xs text-muted-foreground">
                  Enter the 6-digit code sent to {pending.masked}
                </div>
                <div className="flex gap-2">
                  <Input
                    inputMode="numeric"
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                  <Button size="sm" onClick={verify} disabled={code.length !== 6 || busy}>
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPending(null);
                      setCode("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
