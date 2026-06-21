/**
 * FirmOnboardingWizard — modal that creates a B2B firm from basic info only.
 *
 * Onboarding is intentionally minimal: capture the firm's identity and default
 * currency, create the firm row (with default feature flags), then drop the user
 * on the firm profile where projects, entities, contacts, features, billing,
 * address, and notes are filled in. Used from /clients (super_admin only).
 */
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { buildDefaultFeatureFlags } from "@/lib/shared/firm-features";
import { CurrencyPicker } from "@/components/shared/currency-picker";

interface FirmForm {
  firmName: string;
  firmIdentifier: string;
  contactEmail: string;
  firmCurrency: string;
}

const INITIAL: FirmForm = {
  firmName: "",
  firmIdentifier: "",
  contactEmail: "",
  firmCurrency: "USD",
};

/** Suggest a 2–5-char identifier from the firm name. */
function suggestFirmIdentifier(name: string): string {
  const stop = new Set([
    "LLC",
    "LLP",
    "INC",
    "CO",
    "COMPANY",
    "GROUP",
    "AND",
    "OF",
    "THE",
    "PC",
    "PA",
    "CPA",
    "CPAS",
    "LTD",
    "LIMITED",
    "CORP",
    "CORPORATION",
  ]);
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !stop.has(w));
  let initials = "";
  for (const w of words) {
    initials += w[0];
    if (initials.length >= 5) break;
  }
  if (initials.length >= 2) return initials;
  const first = words[0];
  if (first && first.length >= 2) return first.slice(0, 3);
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.slice(0, 3) || "FRM";
}

export function FirmOnboardingWizard({
  autoOpen = false,
  hideTrigger = false,
  open: controlledOpen,
  onOpenChange,
}: {
  autoOpen?: boolean;
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const isControlled = controlledOpen !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(autoOpen);
  useEffect(() => {
    if (!isControlled && autoOpen) setUncontrolledOpen(true);
  }, [autoOpen, isControlled]);
  const open = isControlled ? controlledOpen! : uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Firm
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-2xl">
        {open && <WizardBody onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function WizardBody({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [s, setS] = useState<FirmForm>(INITIAL);
  const upd = <K extends keyof FirmForm>(k: K, v: FirmForm[K]) => setS((p) => ({ ...p, [k]: v }));

  const idTouched = s.firmIdentifier.length > 0;
  const idValid = /^[A-Z0-9]{2,10}$/.test(s.firmIdentifier.trim().toUpperCase());
  const canSubmit = s.firmName.trim().length > 0 && idValid;

  const submit = useMutation({
    mutationFn: async () => {
      const { data: firmRow, error: firmErr } = await supabase
        .from("firms")
        .insert({
          name: s.firmName.trim(),
          firm_identifier: s.firmIdentifier.trim().toUpperCase(),
          contact_email: s.contactEmail.trim() || null,
          currency: (s.firmCurrency || "USD").toUpperCase(),
          primary_partner_user_id: user?.id ?? null,
          feature_flags: buildDefaultFeatureFlags(),
        })
        .select("id")
        .single();
      if (firmErr) throw firmErr;
      return firmRow.id as string;
    },
    onSuccess: (firmId) => {
      toast.success("Firm created");
      qc.invalidateQueries({ queryKey: ["firm-hub-firms"] });
      onClose();
      navigate({ to: "/clients/firm/$firmId", params: { firmId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Onboard a new firm</DialogTitle>
      </DialogHeader>

      <div className="space-y-3 py-2">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Label>Firm name *</Label>
            <Input
              value={s.firmName}
              onChange={(e) => {
                const v = e.target.value;
                upd("firmName", v);
                if (!idTouched) upd("firmIdentifier", suggestFirmIdentifier(v));
              }}
              placeholder="e.g. Acme CPA, LLC"
            />
          </div>
          <div>
            <Label>Identifier *</Label>
            <Input
              value={s.firmIdentifier}
              onChange={(e) =>
                upd(
                  "firmIdentifier",
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 10),
                )
              }
              placeholder="VPC"
              maxLength={10}
              className="font-mono uppercase"
            />
            <p
              className={`mt-1 text-[10px] ${idTouched && !idValid ? "text-destructive" : "text-muted-foreground"}`}
            >
              2–10 letters/digits. Shown in tables instead of the full name.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Contact email</Label>
            <Input
              type="email"
              value={s.contactEmail}
              onChange={(e) => upd("contactEmail", e.target.value)}
              placeholder="partner@acme.com"
            />
          </div>
          <div>
            <Label>Default currency *</Label>
            <CurrencyPicker
              value={s.firmCurrency}
              onChange={(v) => upd("firmCurrency", v ?? "USD")}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Used as the default for every project unless overridden.
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          You can add projects, entities, contacts, features, address, billing, and notes later from
          the firm profile.
        </p>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose} disabled={submit.isPending}>
          Cancel
        </Button>
        <Button onClick={() => submit.mutate()} disabled={!canSubmit || submit.isPending}>
          {submit.isPending ? "Creating…" : "Create firm"}
        </Button>
      </DialogFooter>
    </>
  );
}
