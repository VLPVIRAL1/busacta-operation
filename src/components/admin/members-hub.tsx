import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search,
  X,
  Users,
  UserRound,
  Building2,
  Tag,
  CircleDot,
  Compass,
  Briefcase,
  Phone,
  Mail,
  Sparkles,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { UserAvatar } from "@/components/shared/user-avatar";
import { EditMemberDialog } from "@/components/shared/edit-member-dialog";
import { FacetedMultiChip } from "@/components/shared/faceted-multi-chip";
import {
  CaptchaAlertAction,
  CaptchaAlertDescription,
  useCaptchaGate,
} from "@/components/auth/captcha-confirm";
import { supabase } from "@/integrations/supabase/client";
import { usersRolesQuery, type TeamData } from "@/lib/queries/admin.queries";
import { useAuth, type AppRole } from "@/lib/auth/auth-context";
import { cn } from "@/lib/shared/utils";

const ALL_ROLES: AppRole[] = ["super_admin", "admin", "hr_manager", "employee", "client"];
const STATUSES = ["active", "inactive"];
const PROVENANCE: Array<{ value: string; label: string }> = [
  { value: "firm_hub", label: "Firm Hub" },
  { value: "direct_client_hub", label: "B2C Client Hub" },
  { value: "hr_hub", label: "HR Hub" },
  { value: "self_signup", label: "Self signup" },
  { value: "legacy", label: "Legacy" },
];
const PROVENANCE_LABEL: Record<string, string> = Object.fromEntries(
  PROVENANCE.map((p) => [p.value, p.label]),
);

const cap = (s: string | null | undefined) =>
  (s ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function MembersHub() {
  const qc = useQueryClient();
  const { roles: viewerRoles } = useAuth();
  const isSuper = (viewerRoles ?? []).includes("super_admin");
  const { data, isLoading } = useQuery(usersRolesQuery());

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [deptFilter, setDeptFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [roleChange, setRoleChange] = useState<{
    type: "add" | "remove";
    user_id: string;
    role: AppRole;
    label: string;
  } | null>(null);
  const captcha = useCaptchaGate(
    roleChange ? `${roleChange.type}-${roleChange.user_id}-${roleChange.role}` : "role-change",
  );

  const addRole = useMutation({
    mutationFn: async (v: { user_id: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: v.user_id, role: v.role as never });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role assigned");
      qc.invalidateQueries({ queryKey: ["users-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeRole = useMutation({
    mutationFn: async (v: { user_id: string; role: AppRole }) => {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", v.user_id)
        .eq("role", v.role as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role removed");
      qc.invalidateQueries({ queryKey: ["users-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const profiles = data?.profiles ?? [];
  const roleMap = data?.roles ?? new Map<string, AppRole[]>();

  const departments = useMemo(() => {
    const s = new Set<string>();
    for (const p of profiles) if (p.department) s.add(p.department);
    return [...s].sort();
  }, [profiles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return profiles.filter((p) => {
      const roles = roleMap.get(p.id) ?? [];
      if (q) {
        const hay = [p.full_name, p.email, p.phone, p.specialty, p.department, p.position]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (roleFilter.length && !roles.some((r) => roleFilter.includes(r))) return false;
      if (deptFilter.length && !deptFilter.includes(p.department ?? "")) return false;
      if (statusFilter.length && !statusFilter.includes(p.status ?? "active")) return false;
      if (sourceFilter.length && !sourceFilter.includes(p.provisioned_via ?? "legacy"))
        return false;
      return true;
    });
  }, [profiles, roleMap, search, roleFilter, deptFilter, statusFilter, sourceFilter]);

  // Keep a valid selection: default to the first member, and re-pick when the
  // current selection is filtered out.
  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((p) => p.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const counts = useMemo(() => {
    const r = new Map<string, number>();
    const d = new Map<string, number>();
    const s = new Map<string, number>();
    const src = new Map<string, number>();
    for (const p of profiles) {
      for (const role of roleMap.get(p.id) ?? []) r.set(role, (r.get(role) ?? 0) + 1);
      d.set(p.department ?? "", (d.get(p.department ?? "") ?? 0) + 1);
      s.set(p.status ?? "active", (s.get(p.status ?? "active") ?? 0) + 1);
      const pv = p.provisioned_via ?? "legacy";
      src.set(pv, (src.get(pv) ?? 0) + 1);
    }
    return { r, d, s, src };
  }, [profiles, roleMap]);

  if (isLoading) return <Skeleton className="h-64" />;

  const hasFilters =
    !!search ||
    roleFilter.length > 0 ||
    deptFilter.length > 0 ||
    statusFilter.length > 0 ||
    sourceFilter.length > 0;

  const selected = filtered.find((p) => p.id === selectedId) ?? null;

  const filterRow = (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, phone…"
          className="h-7 w-56 pl-7 text-xs"
        />
      </div>
      <FacetedMultiChip
        icon={<CircleDot className="h-3 w-3" />}
        label="Role"
        options={ALL_ROLES.map((r) => ({ value: r, label: cap(r) }))}
        selected={roleFilter}
        onChange={setRoleFilter}
        counts={counts.r}
      />
      <FacetedMultiChip
        icon={<Building2 className="h-3 w-3" />}
        label="Department"
        options={departments.map((d) => ({ value: d, label: d }))}
        selected={deptFilter}
        onChange={setDeptFilter}
        counts={counts.d}
      />
      <FacetedMultiChip
        icon={<Tag className="h-3 w-3" />}
        label="Status"
        options={STATUSES.map((s) => ({ value: s, label: cap(s) }))}
        selected={statusFilter}
        onChange={setStatusFilter}
        counts={counts.s}
      />
      <FacetedMultiChip
        icon={<Compass className="h-3 w-3" />}
        label="Source"
        options={PROVENANCE}
        selected={sourceFilter}
        onChange={setSourceFilter}
        counts={counts.src}
      />
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          onClick={() => {
            setSearch("");
            setRoleFilter([]);
            setDeptFilter([]);
            setStatusFilter([]);
            setSourceFilter([]);
          }}
        >
          <X className="h-3 w-3" /> Reset
        </Button>
      ) : null}
    </div>
  );

  // Only super_admins may assign/revoke roles. RLS enforces this server-side;
  // this guard keeps the UI honest (defence in depth).
  const onAddRole = (uid: string, role: AppRole, label: string) => {
    if (!isSuper) {
      toast.error("Only a Super Admin can assign roles.");
      return;
    }
    setRoleChange({ type: "add", user_id: uid, role, label });
    captcha.reset();
  };
  const onRemoveRole = (uid: string, role: AppRole, label: string) => {
    if (!isSuper) {
      toast.error("Only a Super Admin can change roles.");
      return;
    }
    setRoleChange({ type: "remove", user_id: uid, role, label });
    captcha.reset();
  };

  return (
    <>
      <div className="flex h-full min-h-[500px] flex-col gap-3">
        <div className="shrink-0 space-y-2">
          {filterRow}
          <div className="text-[11px] text-muted-foreground">
            <Users className="inline h-3 w-3 mr-1" />
            {filtered.length} of {profiles.length} members
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="No members match"
            description="Adjust filters or search to see results."
          />
        ) : (
          <div className="flex min-h-0 flex-1 gap-3">
            {/* LEFT — names */}
            <div className="flex w-64 shrink-0 flex-col overflow-hidden rounded-lg border bg-card sm:w-72">
              <div className="shrink-0 border-b px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Members
              </div>
              <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5">
                {filtered.map((p) => {
                  const roles = roleMap.get(p.id) ?? [];
                  const isSel = p.id === selectedId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                        isSel ? "bg-primary/10 text-primary" : "hover:bg-accent",
                      )}
                    >
                      <UserAvatar
                        profile={{
                          id: p.id,
                          full_name: p.full_name,
                          email: p.email,
                          avatar_url: p.avatar_url,
                        }}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">
                          {p.full_name || p.email || "—"}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">
                          {p.email ?? "No email"}
                        </div>
                      </div>
                      {roles.length > 0 && (
                        <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[9px]">
                          {roles.length}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT — access details */}
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card p-4">
              {selected ? (
                <MemberDetails
                  profile={selected}
                  roles={roleMap.get(selected.id) ?? []}
                  onAddRole={onAddRole}
                  onRemoveRole={onRemoveRole}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    icon={<UserRound className="h-10 w-10" />}
                    title="Select a member"
                    description="Pick someone on the left to view and manage their access."
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        open={!!roleChange}
        onOpenChange={(o) => {
          if (!o) {
            setRoleChange(null);
            captcha.reset();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {roleChange?.type === "add" ? "Assign role?" : "Remove role?"}
            </AlertDialogTitle>
            <CaptchaAlertDescription captchaKey={captcha.nonce} onValidChange={captcha.setValid}>
              {roleChange?.type === "add" ? "Assign" : "Remove"} the{" "}
              <strong className="capitalize">{roleChange?.role}</strong> role{" "}
              {roleChange?.type === "add" ? "to" : "from"} <strong>{roleChange?.label}</strong>.
            </CaptchaAlertDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <CaptchaAlertAction
              valid={captcha.valid}
              pending={addRole.isPending || removeRole.isPending}
              onConfirm={() => {
                if (!roleChange) return;
                if (roleChange.type === "add")
                  addRole.mutate({ user_id: roleChange.user_id, role: roleChange.role });
                else removeRole.mutate({ user_id: roleChange.user_id, role: roleChange.role });
                setRoleChange(null);
                captcha.reset();
              }}
            >
              {addRole.isPending || removeRole.isPending ? "Saving…" : "Confirm"}
            </CaptchaAlertAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type Profile = TeamData["profiles"][number];

function MemberDetails({
  profile,
  roles,
  onAddRole,
  onRemoveRole,
}: {
  profile: Profile;
  roles: AppRole[];
  onAddRole: (uid: string, role: AppRole, label: string) => void;
  onRemoveRole: (uid: string, role: AppRole, label: string) => void;
}) {
  const isActive = (profile.status ?? "active") !== "inactive";
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <UserAvatar
          profile={{
            id: profile.id,
            full_name: profile.full_name,
            email: profile.email,
            avatar_url: profile.avatar_url,
          }}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold">
            {profile.full_name || profile.email || "—"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {profile.email ?? "No email"}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge
              variant={isActive ? "outline" : "secondary"}
              className={cn(
                "text-[10px] capitalize",
                isActive && "border-emerald-500/40 text-emerald-600 dark:text-emerald-300",
              )}
            >
              {profile.status ?? "active"}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {PROVENANCE_LABEL[profile.provisioned_via ?? "legacy"] ?? "Legacy"}
            </Badge>
          </div>
        </div>
        <EditMemberDialog profile={profile} />
      </div>

      <div>
        <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Roles &amp; access
        </h4>
        <RolesCell profile={profile} roles={roles} onAdd={onAddRole} onRemove={onRemoveRole} />
      </div>

      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Profile
        </h4>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DetailField icon={<Building2 className="h-3.5 w-3.5" />} label="Department">
            {cap(profile.department) || "—"}
          </DetailField>
          <DetailField icon={<Briefcase className="h-3.5 w-3.5" />} label="Position">
            {cap(profile.position) || "—"}
          </DetailField>
          <DetailField icon={<Phone className="h-3.5 w-3.5" />} label="Phone">
            {profile.phone || "—"}
          </DetailField>
          <DetailField icon={<Mail className="h-3.5 w-3.5" />} label="Email">
            {profile.email || "—"}
          </DetailField>
          {profile.specialty && (
            <DetailField icon={<Sparkles className="h-3.5 w-3.5" />} label="Specialty">
              {profile.specialty}
            </DetailField>
          )}
        </dl>
      </div>
    </div>
  );
}

function DetailField({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm">{children}</dd>
    </div>
  );
}

function RolesCell({
  profile,
  roles,
  onAdd,
  onRemove,
}: {
  profile: Profile;
  roles: AppRole[];
  onAdd: (uid: string, role: AppRole, label: string) => void;
  onRemove: (uid: string, role: AppRole, label: string) => void;
}) {
  const label = profile.full_name || profile.email || "this user";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {roles.length === 0 && <span className="text-[11px] text-muted-foreground">No roles</span>}
      {roles.map((r) => (
        <Badge key={r} variant="secondary" className="capitalize gap-1 text-[11px]">
          {r.replace("_", " ")}
          <button
            type="button"
            className="hover:text-destructive ml-0.5"
            onClick={() => onRemove(profile.id, r, label)}
            aria-label={`Remove ${r}`}
          >
            ×
          </button>
        </Badge>
      ))}
      <Select value="" onValueChange={(v) => onAdd(profile.id, v as AppRole, label)}>
        <SelectTrigger className="h-7 w-[120px] px-2 text-xs">
          <SelectValue placeholder="+ Add role" />
        </SelectTrigger>
        <SelectContent>
          {ALL_ROLES.filter((r) => !roles.includes(r)).map((r) => (
            <SelectItem key={r} value={r} className="capitalize text-xs">
              {r.replace("_", " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
