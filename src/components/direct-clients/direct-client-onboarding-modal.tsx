/**
 * DirectClientOnboardingModal — wraps the direct-client creation form in a
 * Dialog so it can be launched directly from /clients (alongside the
 * Firm onboarding wizard). Same fields and behavior as the standalone
 * /clients/onboarding route, just modal chrome.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createDirectClient } from "@/lib/direct-clients/direct-clients.functions";

export function DirectClientOnboardingModal({
  autoOpen = false,
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: {
  autoOpen?: boolean;
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(autoOpen);
  const open = isControlled ? controlledOpen! : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  useEffect(() => {
    if (!isControlled && autoOpen) setUncontrolledOpen(true);
  }, [autoOpen, isControlled]);

  const navigate = useNavigate();
  const qc = useQueryClient();
  const createFn = useServerFn(createDirectClient);

  const [form, setForm] = useState({
    display_name: "",
    legal_name: "",
    email: "",
    phone: "",
    client_type: "individual" as "individual" | "business",
    identifier: "",
    notes: "",
  });

  const mutation = useMutation({
    mutationFn: async () =>
      createFn({
        data: {
          origin: "direct_client_hub" as const,
          display_name: form.display_name.trim(),
          legal_name: form.legal_name.trim() || null,
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          client_type: form.client_type,
          identifier: form.identifier.trim() || null,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["direct-clients"] });
      toast.success(`Created ${form.display_name}`);
      setOpen(false);
      navigate({ to: "/clients/direct/$clientId", params: { clientId: res.client.id } });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Failed to create client");
    },
  });

  const canSubmit = form.display_name.trim() && form.email.trim();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline">
            <UserPlus className="h-4 w-4 mr-2" />
            New B2C client
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Onboard New B2C Client</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <Section title="Client identity">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Display name *">
                <Input
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                  placeholder="John Smith / Acme LLC"
                />
              </Field>
              <Field label="Client type *">
                <Select
                  value={form.client_type}
                  onValueChange={(v) =>
                    setForm({ ...form, client_type: v as "individual" | "business" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="individual">Individual</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Legal name">
                <Input
                  value={form.legal_name}
                  onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Identifier (SSN / EIN)">
                <Input
                  value={form.identifier}
                  onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                  placeholder="Optional"
                />
              </Field>
            </div>
          </Section>

          <Section title="Contact">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Email *">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="client@example.com"
                />
              </Field>
              <Field label="Phone">
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Optional"
                />
              </Field>
            </div>
          </Section>

          <Section title="Notes">
            <Field label="Notes">
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal notes (not shared with client)"
                rows={3}
              />
            </Field>
          </Section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || mutation.isPending} onClick={() => mutation.mutate()}>
            <UserPlus className="h-4 w-4 mr-2" />
            {mutation.isPending ? "Creating…" : "Create Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold border-b pb-1">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
