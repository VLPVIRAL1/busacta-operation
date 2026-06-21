import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { RespondentSinglePage } from "@/components/organizer/respondent-single-page";
import { type WizardTransport, type WizardCtx } from "@/components/organizer/respondent-wizard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RouteErrorComponent } from "@/components/shared/route-error";

export const Route = createFileRoute("/o/$token")({
  component: PublicOrganizerPage,
  errorComponent: RouteErrorComponent,
});

type Started = {
  deployment_id: string;
  session_token: string;
};

function PublicOrganizerPage() {
  const { token } = Route.useParams();
  const [started, setStarted] = useState<Started | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [submittedDone, setSubmittedDone] = useState(false);

  const startMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/public/organizer/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password: password || undefined,
          identity: name && email ? { name, email, company } : undefined,
        }),
      });
      const json = (await res.json()) as
        | { deployment_id: string; session_token: string }
        | { error: string };
      if (!res.ok) {
        if (res.status === 401) setNeedsPassword(true);
        throw new Error("error" in json ? json.error : "Failed to start");
      }
      return json as Started;
    },
    onSuccess: (s) => setStarted(s),
    onError: (e: Error) => toast.error(e.message),
  });

  const transport = useMemo<WizardTransport | null>(() => {
    if (!started) return null;
    const session = started.session_token;
    return {
      fetchCtx: async () => {
        const res = await fetch("/api/public/organizer/context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_token: session }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        return (await res.json()) as WizardCtx;
      },
      save: async (input) => {
        const res = await fetch("/api/public/organizer/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_token: session,
            block_id: input.block_id,
            value_json: input.value_json ?? null,
            last_visited_block_id: input.last_visited_block_id ?? null,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
        return res.json();
      },
      submit: async () => {
        const res = await fetch("/api/public/organizer/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_token: session }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Submit failed");
        setSubmittedDone(true);
        return res.json();
      },
    };
  }, [started]);

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      startMut.mutate();
    },
    [startMut],
  );

  if (submittedDone) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-accent/20 p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-3">
          <ShieldCheck className="h-12 w-12 mx-auto text-emerald-600" />
          <h1 className="text-2xl font-semibold">Thank you</h1>
          <p className="text-sm text-muted-foreground">
            Your response has been submitted. You can safely close this page.
          </p>
        </Card>
      </div>
    );
  }

  if (started && transport) {
    return (
      <RespondentSinglePage
        deploymentId={started.deployment_id}
        transport={transport}
        exitTo="/"
        exitLabel="Close"
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-accent/20 p-4">
      <Card className="max-w-md w-full p-6 space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Welcome</h1>
          <p className="text-sm text-muted-foreground">
            Please introduce yourself before starting the form.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label>Full name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Company (optional)</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          {needsPassword && (
            <div className="space-y-1">
              <Label>Access password</Label>
              <Input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={startMut.isPending}>
            {startMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Start
          </Button>
        </form>
        <p className="text-[11px] text-muted-foreground text-center">
          Powered by BusAcTa Operations
        </p>
      </Card>
    </div>
  );
}
