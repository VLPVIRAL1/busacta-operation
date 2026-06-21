import { useState } from "react";
import { Mail, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { startMicrosoftConnect } from "@/lib/email/connect.functions";

type Provider = { id: "microsoft" | "google"; label: string; soon?: boolean };

const PROVIDERS: Provider[] = [
  { id: "microsoft", label: "Microsoft 365 / Outlook" },
  { id: "google", label: "Google / Gmail", soon: true },
];

export function ConnectAccountDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Provider["id"] | null>(null);
  const startMs = useServerFn(startMicrosoftConnect);

  const startConnect = async (provider: Provider["id"]) => {
    if (provider !== "microsoft") return;
    setBusy(provider);
    try {
      const { url } = await startMs();
      window.location.href = url;
    } catch (e) {
      setBusy(null);
      toast.error(e instanceof Error ? e.message : "Could not start Microsoft sign-in");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="gap-2">
            <Mail className="h-4 w-4" />
            Connect mailbox
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect a mailbox</DialogTitle>
          <DialogDescription>
            Pick a provider. You will be redirected to sign in and authorize access. Only you can
            see your inbox until you link a thread to a Firm, Project or Task.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {PROVIDERS.map((p) => (
            <Card
              key={p.id}
              className="p-3 flex items-center justify-between hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{p.label}</div>
                  {p.soon ? <div className="text-xs text-muted-foreground">Coming soon</div> : null}
                </div>
              </div>
              <Button
                size="sm"
                variant={p.soon ? "outline" : "default"}
                disabled={p.soon || busy === p.id}
                onClick={() => startConnect(p.id)}
              >
                {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect"}
              </Button>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
