import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Search, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/auth-context";
import { contractProfilesQuery, useContractFns } from "@/lib/queries/contracts.queries";
import {
  CONTRACT_TYPE_LABELS,
  type ContractProfile,
  type ContractType,
} from "@/lib/contracts/schemas";
import { ContractProfileDialog } from "./contract-profile-dialog";

export function ContractProfileList() {
  const { user } = useAuth();
  const [typeF, setTypeF] = useState<ContractType | "all">("all");
  const [statusF, setStatusF] = useState<string>("all");
  const [ownerF, setOwnerF] = useState<"all" | "mine">("all");
  const [search, setSearch] = useState("");

  const profilesQ = useQuery(contractProfilesQuery());

  const jurisdictions = useMemo(() => {
    const set = new Set<string>();
    (profilesQ.data ?? []).forEach((p) => p.jurisdiction && set.add(p.jurisdiction));
    return Array.from(set).sort();
  }, [profilesQ.data]);
  const [jurisdictionF, setJurisdictionF] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (profilesQ.data ?? []).filter((p) => {
      if (typeF !== "all" && p.contract_type !== typeF) return false;
      if (statusF !== "all" && p.status !== statusF) return false;
      if (ownerF === "mine" && p.owner_id !== user?.id) return false;
      if (jurisdictionF !== "all" && p.jurisdiction !== jurisdictionF) return false;
      if (q && !`${p.registered_legal_name} ${p.trading_name ?? ""}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [profilesQ.data, typeF, statusF, ownerF, jurisdictionF, search, user?.id]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by legal name…"
              className="pl-8"
            />
          </div>
          <Select value={typeF} onValueChange={(v) => setTypeF(v as ContractType | "all")}>
            <SelectTrigger className="w-full lg:w-36">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(CONTRACT_TYPE_LABELS) as ContractType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {CONTRACT_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger className="w-full lg:w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ownerF} onValueChange={(v) => setOwnerF(v as "all" | "mine")}>
            <SelectTrigger className="w-full lg:w-32">
              <SelectValue placeholder="Owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              <SelectItem value="mine">Mine</SelectItem>
            </SelectContent>
          </Select>
          <Select value={jurisdictionF} onValueChange={setJurisdictionF}>
            <SelectTrigger className="w-full lg:w-44">
              <SelectValue placeholder="Jurisdiction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All jurisdictions</SelectItem>
              {jurisdictions.map((j) => (
                <SelectItem key={j} value={j}>
                  {j}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ContractProfileDialog />
        </CardContent>
      </Card>

      {profilesQ.isLoading ? (
        <Skeleton className="h-72" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title={(profilesQ.data ?? []).length === 0 ? "No contract profiles yet" : "No matches"}
          description={
            (profilesQ.data ?? []).length === 0
              ? "Create a counterparty profile to merge into NDA & SLA documents."
              : "Try clearing the filters or search."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <ProfileCard key={p.id} profile={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileCard({ profile }: { profile: ContractProfile }) {
  const qc = useQueryClient();
  const { deleteProfile } = useContractFns();
  const deleteMut = useMutation({
    mutationFn: async () => {
      await deleteProfile({ data: { id: profile.id } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contract-profiles"] });
      toast.success("Profile deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="h-full transition-shadow hover:shadow-md">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">
              {profile.registered_legal_name}
            </div>
            {profile.trading_name && (
              <div className="truncate text-xs text-muted-foreground">{profile.trading_name}</div>
            )}
          </div>
          <Badge variant="outline" className="shrink-0 font-normal uppercase">
            {CONTRACT_TYPE_LABELS[profile.contract_type]}
          </Badge>
        </div>
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {profile.signatory_name && (
            <div>
              {profile.signatory_name}
              {profile.signatory_title ? `, ${profile.signatory_title}` : ""}
            </div>
          )}
          {profile.jurisdiction && <div>{profile.jurisdiction}</div>}
        </div>
        <div className="flex items-center justify-between border-t pt-2">
          <Badge
            variant={profile.status === "active" ? "secondary" : "outline"}
            className="font-normal capitalize"
          >
            {profile.status}
          </Badge>
          <div className="flex items-center gap-1">
            <ContractProfileDialog profile={profile} />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm("Delete this profile?")) deleteMut.mutate();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
