/**
 * Shared Team & Access tab for both B2B Firms and B2C Clients.
 * Adapter-driven — uses teamTable / memberCapsTable / fkColumn from the
 * ClientAdapter so this single component covers both streams. Replaces the
 * per-stream TeamTab + TeamMemberAccessBadges + TeamMemberAccessDialog +
 * RoleLabelEditor previously living inside src/routes/clients/firm/$firmId.index.tsx.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FEATURE_MATRIX } from "@/lib/shared/firm-features";
import type { ClientAdapter } from "@/lib/client-hub/adapter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserAvatar } from "@/components/shared/user-avatar";
import { SinglePersonPicker } from "@/components/shared/single-person-picker";

const ACCESS_COLORS: Record<string, string> = {
  tasks: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 border-blue-300",
  documents:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300",
  invoices: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-300",
  messaging:
    "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200 border-violet-300",
  sops: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300",
  open_points: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border-rose-300",
  timesheet: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200 border-cyan-300",
  internal_notes:
    "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-950 dark:text-fuchsia-200 border-fuchsia-300",
  audit_trail: "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200 border-stone-300",
  pipeline: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200 border-teal-300",
};

interface Props {
  adapter: ClientAdapter;
  entityId: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}
interface TeamRow {
  id: string;
  user_id: string;
  role_label: string | null;
}
interface CapRow {
  user_id: string;
  capability: string;
  allowed: boolean;
}

export function ClientTeamTab({ adapter, entityId }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [roleLabel, setRoleLabel] = useState("");

  const teamKey = [adapter.queryKeyPrefix, "team", entityId];
  const capsKey = [adapter.queryKeyPrefix, "caps", entityId];

  const { data: team = [] } = useQuery<TeamRow[]>({
    queryKey: teamKey,
    queryFn: async () => {
      const { data, error } = await (supabase.from(adapter.teamTable) as any)
        .select("id, user_id, role_label")
        .eq(adapter.fkColumn, entityId);
      if (error) throw error;
      return (data ?? []) as TeamRow[];
    },
  });

  const { data: profiles = [] } = useQuery<ProfileRow[]>({
    queryKey: ["internal-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url")
        .order("full_name");
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const { data: caps = [] } = useQuery<CapRow[]>({
    queryKey: capsKey,
    queryFn: async () => {
      const { data, error } = await (supabase.from(adapter.memberCapsTable) as any)
        .select("user_id, capability, allowed")
        .eq(adapter.fkColumn, entityId);
      if (error) throw error;
      return (data ?? []) as CapRow[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select a user");
      const { error } = await (supabase.from(adapter.teamTable) as any).insert({
        [adapter.fkColumn]: entityId,
        user_id: selected,
        role_label: roleLabel || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member assigned");
      setOpen(false);
      setSelected("");
      setRoleLabel("");
      qc.invalidateQueries({ queryKey: teamKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from(adapter.teamTable) as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKey }),
  });

  const updateRoleLabel = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: string }) => {
      const { error } = await (supabase.from(adapter.teamTable) as any)
        .update({ role_label: label.trim() || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: teamKey });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setCap = useMutation({
    mutationFn: async ({
      user_id,
      capability,
      allowed,
    }: {
      user_id: string;
      capability: string;
      allowed: boolean;
    }) => {
      const { error } = await (supabase.from(adapter.memberCapsTable) as any).upsert(
        { [adapter.fkColumn]: entityId, user_id, capability, allowed },
        { onConflict: `${adapter.fkColumn},user_id,capability` },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: capsKey }),
  });

  const getCap = (uid: string, key: string) => {
    const row = caps.find((c) => c.user_id === uid && c.capability === key);
    return row ? row.allowed : true;
  };

  const profileMap = new Map(profiles.map((p) => [p.id, p] as const));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Internal team assigned to this {adapter.entityNoun.toLowerCase()}</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Assign member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Assign member</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>User</Label>
                  <SinglePersonPicker
                    value={selected || null}
                    onChange={(id) => setSelected(id ?? "")}
                    placeholder="Pick a profile…"
                  />
                </div>
                <div>
                  <Label>Role label (optional)</Label>
                  <Input
                    value={roleLabel}
                    onChange={(e) => setRoleLabel(e.target.value)}
                    placeholder="e.g. Lead reviewer"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => add.mutate()} disabled={add.isPending}>
                  Assign
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {team.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground text-center">
              No team members assigned.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role label</TableHead>
                  <TableHead>Access given</TableHead>
                  <TableHead></TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.map((m) => {
                  const p = profileMap.get(m.user_id);
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <UserAvatar
                            profile={{
                              id: m.user_id,
                              full_name: p?.full_name ?? null,
                              email: p?.email ?? null,
                              avatar_url: p?.avatar_url ?? null,
                            }}
                            size="sm"
                            showPresence={false}
                          />
                          <div className="font-medium">{p?.full_name ?? "—"}</div>
                        </div>
                      </TableCell>
                      <TableCell>{p?.email ?? "—"}</TableCell>
                      <TableCell>
                        <RoleLabelEditor
                          value={m.role_label ?? ""}
                          onSave={(label) => updateRoleLabel.mutate({ id: m.id, label })}
                          pending={updateRoleLabel.isPending}
                        />
                      </TableCell>
                      <TableCell>
                        <TeamMemberAccessBadges caps={caps} userId={m.user_id} />
                      </TableCell>
                      <TableCell>
                        <TeamMemberAccessDialog
                          memberName={p?.full_name ?? p?.email ?? m.user_id}
                          userId={m.user_id}
                          getCap={getCap}
                          onChange={(capability, allowed) =>
                            setCap.mutate({ user_id: m.user_id, capability, allowed })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => remove.mutate(m.id)}
                          title="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TeamMemberAccessBadges({ caps, userId }: { caps: CapRow[]; userId: string }) {
  const overrides = new Map<string, boolean>(
    caps.filter((c) => c.user_id === userId).map((c) => [c.capability, c.allowed]),
  );
  const allowed = FEATURE_MATRIX.filter((f) =>
    overrides.has(f.key) ? overrides.get(f.key)! : true,
  );
  if (allowed.length === 0) return <span className="text-xs text-muted-foreground">None</span>;
  return (
    <div className="flex flex-wrap gap-1 max-w-[280px]">
      {allowed.map((f) => (
        <span
          key={f.key}
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${ACCESS_COLORS[f.key] ?? "bg-muted text-foreground border-border"}`}
          title={f.description}
        >
          {f.label}
        </span>
      ))}
    </div>
  );
}

function TeamMemberAccessDialog({
  memberName,
  userId,
  getCap,
  onChange,
}: {
  memberName: string;
  userId: string;
  getCap: (uid: string, key: string) => boolean;
  onChange: (capability: string, allowed: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Settings2 className="mr-1 h-3.5 w-3.5" />
          Access
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Internal access · {memberName}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Choose which internal workspace capabilities this employee has. Defaults to enabled when
            not explicitly set.
          </p>
        </DialogHeader>
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Capability</TableHead>
                <TableHead className="text-center w-24">Allowed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {FEATURE_MATRIX.map((f) => (
                <TableRow key={f.key}>
                  <TableCell>
                    <div className="font-medium text-sm">{f.label}</div>
                    {f.description && (
                      <div className="text-xs text-muted-foreground">{f.description}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={getCap(userId, f.key)}
                      onCheckedChange={(v) => onChange(f.key, v)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RoleLabelEditor({
  value,
  onSave,
  pending,
}: {
  value: string;
  onSave: (label: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value, open]);
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="truncate">{value || "—"}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="icon" variant="ghost" className="h-5 w-5" title="Edit role label">
            <Pencil className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-2" align="start">
          <Label className="text-xs">Role label (optional)</Label>
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Lead reviewer"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                onSave(draft);
                setOpen(false);
              }}
            >
              Save
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
