import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import {
  campaignOptionsQuery,
  leadOptionsQuery,
  useContractFns,
} from "@/lib/queries/contracts.queries";
import {
  CONTRACT_TYPE_LABELS,
  type ContractProfile,
  type ContractType,
} from "@/lib/contracts/schemas";

const NONE = "__none__";

const CONTRACT_TYPES = (Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((value) => ({
  value,
  label: CONTRACT_TYPE_LABELS[value],
}));

const STATUSES = ["active", "inactive"] as const;

export function ContractProfileDialog({ profile }: { profile?: ContractProfile }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { createProfile, updateProfile } = useContractFns();
  const [open, setOpen] = useState(false);

  const [legalName, setLegalName] = useState(profile?.registered_legal_name ?? "");
  const [tradingName, setTradingName] = useState(profile?.trading_name ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [signatoryName, setSignatoryName] = useState(profile?.signatory_name ?? "");
  const [signatoryTitle, setSignatoryTitle] = useState(profile?.signatory_title ?? "");
  const [jurisdiction, setJurisdiction] = useState(profile?.jurisdiction ?? "");
  const [effectiveDate, setEffectiveDate] = useState(profile?.effective_date ?? "");
  const [email, setEmail] = useState(profile?.email ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [type, setType] = useState<ContractType>(profile?.contract_type ?? "nda");
  const [status, setStatus] = useState(profile?.status ?? "active");
  const [leadId, setLeadId] = useState(profile?.lead_id ?? NONE);
  const [campaignId, setCampaignId] = useState(profile?.campaign_id ?? NONE);
  const [notes, setNotes] = useState(profile?.notes ?? "");

  const campaignsQ = useQuery(campaignOptionsQuery());
  const leadsQ = useQuery(leadOptionsQuery());

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!legalName.trim()) throw new Error("Registered legal name is required");
      const payload = {
        registered_legal_name: legalName.trim(),
        trading_name: tradingName.trim() || null,
        address: address.trim() || null,
        signatory_name: signatoryName.trim() || null,
        signatory_title: signatoryTitle.trim() || null,
        jurisdiction: jurisdiction.trim() || null,
        effective_date: effectiveDate || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        contract_type: type,
        status,
        lead_id: leadId === NONE ? null : leadId,
        campaign_id: campaignId === NONE ? null : campaignId,
        notes: notes.trim() || null,
      };
      if (profile) {
        await updateProfile({ data: { id: profile.id, ...payload } });
      } else {
        await createProfile({ data: { ...payload, owner_id: user?.id ?? null } });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-profiles"] });
      toast.success(profile ? "Profile updated" : "Profile created");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {profile ? (
          <Button size="sm" variant="ghost">
            Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" />
            New profile
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{profile ? "Edit contract profile" : "New contract profile"}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <div className="grid gap-1.5">
            <Label>Registered legal name *</Label>
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Trading / display name</Label>
              <Input value={tradingName} onChange={(e) => setTradingName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Jurisdiction</Label>
              <Input
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
                placeholder="e.g. State of Delaware"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Registered address</Label>
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Signatory name</Label>
              <Input value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Signatory title</Label>
              <Input value={signatoryTitle} onChange={(e) => setSignatoryTitle(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Contract type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ContractType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Effective date</Label>
              <Input
                type="date"
                value={effectiveDate ?? ""}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Linked lead</Label>
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger>
                  <SelectValue placeholder="No lead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {(leadsQ.data ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Linked campaign</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder="No campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None —</SelectItem>
                  {(campaignsQ.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
