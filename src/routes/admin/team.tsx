import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Users, ShieldCheck, LayoutGrid } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { HubPermissionsPage } from "@/routes/admin/hub-permissions";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { supabase } from "@/integrations/supabase/client";
import { type AppRole } from "@/lib/auth/auth-context";
import { roleCapabilitiesQuery, teamTaskPermissionsAuditQuery } from "@/lib/queries/admin.queries";
import { UserAvatar } from "@/components/shared/user-avatar";
import { MembersHub } from "@/components/admin/members-hub";

export const Route = createFileRoute("/admin/team")({
  component: () => (
    <AuthGuard allow={["super_admin"]}>
      <AppShell crumbs={[{ label: "Admin" }, { label: "Team" }]}>
        <TeamPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

const CAP_LABELS = [
  ["can_view", "View"],
  ["can_edit_fields", "Edit"],
  ["can_edit_time", "Time"],
  ["can_manage_subtasks", "Subtasks"],
  ["can_manage_attachments", "Files"],
  ["can_change_status", "Status"],
] as const;

type TeamSection = "members" | "permissions" | "hubs";

export function TeamPage({
  embedded = false,
  forceSection,
}: { embedded?: boolean; forceSection?: TeamSection } = {}) {
  const [sectionState, setSection] = useState<TeamSection>(forceSection ?? "members");
  const section: TeamSection = forceSection ?? sectionState;

  return (
    <>
      {!embedded && (
        <PageHeader
          title="Team"
          description="Manage members and task-level access. New people are added from Firm Hub (clients) or HR Hub (everyone else)."
        />
      )}

      {!forceSection && (
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <TeamSectionButton
            active={section === "members"}
            icon={<Users className="h-4 w-4" />}
            title="Members"
            description="Profiles and roles"
            onClick={() => setSection("members")}
          />
          <TeamSectionButton
            active={section === "permissions"}
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Roles & Capabilities"
            description="What each role can do"
            onClick={() => setSection("permissions")}
          />
          <TeamSectionButton
            active={section === "hubs"}
            icon={<LayoutGrid className="h-4 w-4" />}
            title="Hub Visibility"
            description="Per-employee hub overrides"
            onClick={() => setSection("hubs")}
          />
        </div>
      )}

      <section
        className={
          embedded && forceSection === "members" ? "flex min-h-0 flex-1 flex-col" : "space-y-3"
        }
      >
        {!embedded && (
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {section === "members"
                ? "Members"
                : section === "permissions"
                  ? "Roles & Capabilities"
                  : "Hub Visibility"}
            </h2>
            <Badge variant="outline" className="capitalize">
              {section}
            </Badge>
          </div>
        )}
        {section === "members" && <MembersHub />}
        {section === "permissions" && (
          <div className="space-y-6">
            <RoleCapabilityMatrix />
            <SubRolesPanel />
            <div>
              <h3 className="text-sm font-semibold mb-2">Per-task overrides</h3>
              <PermissionsAuditSection />
            </div>
          </div>
        )}
        {section === "hubs" && <HubPermissionsPage embedded />}
      </section>
    </>
  );
}

function TeamSectionButton({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition-all ${active ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-card hover:bg-muted/40"}`}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </button>
  );
}

const ROLES: AppRole[] = ["super_admin", "admin", "hr_manager", "employee", "client"];
const LOCKED_ROLES = new Set<AppRole>(["super_admin", "admin"]);
const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  hr_manager: "HR Mgr",
  employee: "Employee",
  client: "Client",
};

const CAPABILITY_GROUPS: Array<{
  group: string;
  items: Array<{ key: string; label: string; desc?: string }>;
}> = [
  {
    group: "People & Access",
    items: [
      { key: "people.invite", label: "Invite users" },
      { key: "people.manage", label: "Manage members & roles" },
    ],
  },
  {
    group: "Firms",
    items: [
      { key: "firms.create", label: "Create firms" },
      { key: "firms.edit", label: "Edit firms" },
      { key: "firms.delete", label: "Delete firms" },
    ],
  },
  {
    group: "Clients",
    items: [
      { key: "clients.create", label: "Create clients" },
      { key: "clients.edit", label: "Edit clients" },
      { key: "clients.delete", label: "Delete clients" },
    ],
  },
  {
    group: "Projects",
    items: [
      { key: "projects.create", label: "Create projects" },
      { key: "projects.edit", label: "Edit projects" },
      { key: "projects.delete", label: "Delete projects" },
    ],
  },
  {
    group: "Tasks",
    items: [
      { key: "tasks.create", label: "Create tasks" },
      { key: "tasks.edit", label: "Edit tasks" },
      { key: "tasks.delete", label: "Delete tasks" },
      { key: "subtasks.manage", label: "Manage subtasks" },
    ],
  },
  {
    group: "Communication & Templates",
    items: [
      { key: "communication.post_internal", label: "Post internal messages" },
      { key: "templates.manage", label: "Manage workflow templates" },
    ],
  },
  {
    group: "Time",
    items: [{ key: "timesheet.view_all", label: "View everyone's time logs" }],
  },
];

function RoleCapabilityMatrix() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(roleCapabilitiesQuery());

  const toggle = useMutation({
    mutationFn: async (v: { role: AppRole; capability: string; allowed: boolean }) => {
      const { error } = await supabase.from("role_capabilities").upsert(
        {
          role: v.role as never,
          capability: v.capability,
          allowed: v.allowed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "role,capability" },
      );
      if (error) throw error;
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["role-capabilities"] });
      const prev = qc.getQueryData<Map<string, boolean>>(["role-capabilities"]);
      if (prev) {
        const next = new Map(prev);
        next.set(`${v.role}:${v.capability}`, v.allowed);
        qc.setQueryData(["role-capabilities"], next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["role-capabilities"], ctx.prev);
      toast.error("Failed to update permission");
    },
    onSuccess: () => {
      toast.success("Permission updated");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["role-capabilities"] }),
  });

  if (isLoading) return <Skeleton className="h-64" />;

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[260px]">Capability</TableHead>
              {ROLES.map((r) => (
                <TableHead key={r} className="text-center w-28">
                  {ROLE_LABEL[r]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {CAPABILITY_GROUPS.flatMap((g) => [
              <TableRow key={`g-${g.group}`} className="bg-muted/50 hover:bg-muted/50">
                <TableCell
                  colSpan={ROLES.length + 1}
                  className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {g.group}
                </TableCell>
              </TableRow>,
              ...g.items.map((item) => (
                <TableRow key={item.key}>
                  <TableCell>
                    <div className="text-sm font-medium">{item.label}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">{item.key}</div>
                  </TableCell>
                  {ROLES.map((role) => {
                    const locked = LOCKED_ROLES.has(role);
                    const checked = locked ? true : (data?.get(`${role}:${item.key}`) ?? false);
                    return (
                      <TableCell key={role} className="text-center">
                        <Switch
                          checked={checked}
                          disabled={locked || toggle.isPending}
                          onCheckedChange={(v) =>
                            toggle.mutate({ role, capability: item.key, allowed: v })
                          }
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              )),
            ])}
          </TableBody>
        </Table>
        <div className="px-4 py-2 text-[11px] text-muted-foreground border-t">
          Super Admin and Admin always have every capability and cannot be reduced here. Create a
          sub-role below to define a narrower bundle on top of any base role.
        </div>
      </CardContent>
    </Card>
  );
}

function PermissionsAuditSection() {
  const { data, isLoading } = useQuery(teamTaskPermissionsAuditQuery());

  if (isLoading) return <Skeleton className="h-32" />;
  if (!data || data.rows.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-10 w-10" />}
        title="No task permissions yet"
        description="Per-task permission rows will appear here after access is granted on a task."
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Task</TableHead>
              {CAP_LABELS.map(([key, label]) => (
                <TableHead key={key} className="text-center text-[11px]">
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => {
              const profile = data.profiles.get(row.user_id);
              return (
                <TableRow key={`${row.task_id}:${row.user_id}`}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        profile={
                          profile
                            ? {
                                id: profile.id,
                                full_name: profile.full_name ?? null,
                                email: profile.email ?? null,
                                avatar_url: profile.avatar_url ?? null,
                              }
                            : null
                        }
                        userId={row.user_id}
                        size="sm"
                      />
                      <span className="text-xs font-medium">
                        {profile?.full_name || profile?.email || "User"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{data.tasks.get(row.task_id) ?? "Task"}</TableCell>
                  {CAP_LABELS.map(([key]) => (
                    <TableCell key={key} className="text-center text-xs">
                      {row[key] ? "✓" : "—"}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SubRolesPanel() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [baseRole, setBaseRole] = useState<AppRole>("employee");
  const [description, setDescription] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: subroles, isLoading } = useQuery({
    queryKey: ["role-subroles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_subroles" as never)
        .select("id, name, base_role, description, created_at")
        .order("base_role")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string;
        base_role: AppRole;
        description: string | null;
        created_at: string;
      }>;
    },
  });

  const { data: parentCaps } = useQuery(roleCapabilitiesQuery());

  const { data: subCaps } = useQuery({
    queryKey: ["role-subrole-capabilities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_subrole_capabilities" as never)
        .select("subrole_id, module_key, allowed");
      if (error) throw error;
      const map = new Map<string, boolean>();
      for (const r of (data ?? []) as Array<{
        subrole_id: string;
        module_key: string;
        allowed: boolean;
      }>)
        map.set(`${r.subrole_id}:${r.module_key}`, r.allowed);
      return map;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const { error } = await supabase.from("role_subroles" as never).insert({
        name: trimmed,
        base_role: baseRole,
        description: description.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sub-role created");
      setName("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["role-subroles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("role_subroles" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sub-role removed");
      qc.invalidateQueries({ queryKey: ["role-subroles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleCap = useMutation({
    mutationFn: async (v: {
      subrole_id: string;
      base_role: AppRole;
      module_key: string;
      allowed: boolean;
    }) => {
      // Ceiling check: cannot grant a capability the parent role doesn't have.
      if (v.allowed) {
        const parentAllowed =
          v.base_role === "admin" ||
          v.base_role === "super_admin" ||
          (parentCaps?.get(`${v.base_role}:${v.module_key}`) ?? false);
        if (!parentAllowed) {
          throw new Error("Parent role does not grant this capability");
        }
      }
      const { error } = await supabase
        .from("role_subrole_capabilities" as never)
        .upsert(
          { subrole_id: v.subrole_id, module_key: v.module_key, allowed: v.allowed } as never,
          { onConflict: "subrole_id,module_key" } as never,
        );
      if (error) throw error;
    },
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["role-subrole-capabilities"] });
      const prev = qc.getQueryData<Map<string, boolean>>(["role-subrole-capabilities"]);
      if (prev) {
        const next = new Map(prev);
        next.set(`${v.subrole_id}:${v.module_key}`, v.allowed);
        qc.setQueryData(["role-subrole-capabilities"], next);
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["role-subrole-capabilities"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["role-subrole-capabilities"] }),
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Sub-roles</h3>
          <p className="text-xs text-muted-foreground">
            Named bundles on top of a base role. A sub-role can only narrow the parent role's
            capabilities — never exceed them. Assign to employees from HR Hub → employee sheet.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="grid grid-cols-1 sm:grid-cols-[1fr_160px_1fr_auto] gap-2 items-end"
        >
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="E.g. Reviewer"
              maxLength={60}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Base role</Label>
            <Select value={baseRole} onValueChange={(v) => setBaseRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["super_admin", "admin", "hr_manager", "employee", "client"] as AppRole[]).map(
                  (r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r.replace("_", " ")}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this sub-role do?"
              maxLength={200}
            />
          </div>
          <Button type="submit" disabled={create.isPending || !name.trim()} size="sm">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </form>
        {isLoading ? (
          <Skeleton className="h-20" />
        ) : (subroles ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No sub-roles defined yet.</p>
        ) : (
          <div className="space-y-2">
            {(subroles ?? []).map((sr) => {
              const isOpen = expandedId === sr.id;
              const isAdminParent = sr.base_role === "admin" || sr.base_role === "super_admin";
              return (
                <div key={sr.id} className="rounded-md border bg-card">
                  <div className="flex items-center gap-2 p-2 text-sm">
                    <Badge variant="outline" className="capitalize text-[10px]">
                      {sr.base_role.replace("_", " ")}
                    </Badge>
                    <span className="font-medium">{sr.name}</span>
                    {sr.description && (
                      <span className="text-xs text-muted-foreground truncate">
                        — {sr.description}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-7 text-xs"
                      onClick={() => setExpandedId(isOpen ? null : sr.id)}
                    >
                      {isOpen ? "Hide" : "Edit"} capabilities
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive h-7 w-7"
                      onClick={() => remove.mutate(sr.id)}
                      disabled={remove.isPending}
                      aria-label="Delete sub-role"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {isOpen && (
                    <div className="border-t p-2 space-y-2 bg-muted/30">
                      <p className="text-[11px] text-muted-foreground">
                        Toggle the capabilities this sub-role grants. Capabilities not granted to
                        the
                        <span className="capitalize"> {sr.base_role.replace("_", " ")}</span> base
                        role are locked.
                      </p>
                      {CAPABILITY_GROUPS.map((g) => (
                        <div key={g.group} className="rounded border bg-background p-2">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                            {g.group}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                            {g.items.map((item) => {
                              const parentAllowed =
                                isAdminParent ||
                                (parentCaps?.get(`${sr.base_role}:${item.key}`) ?? false);
                              const checked = subCaps?.get(`${sr.id}:${item.key}`) ?? false;
                              return (
                                <label
                                  key={item.key}
                                  className={`flex items-center justify-between gap-2 rounded px-2 py-1 text-xs ${parentAllowed ? "hover:bg-accent" : "opacity-50"}`}
                                  title={
                                    parentAllowed ? "" : "Parent role doesn't grant this capability"
                                  }
                                >
                                  <span>{item.label}</span>
                                  <Switch
                                    checked={parentAllowed && checked}
                                    disabled={!parentAllowed || toggleCap.isPending}
                                    onCheckedChange={(v) =>
                                      toggleCap.mutate({
                                        subrole_id: sr.id,
                                        base_role: sr.base_role,
                                        module_key: item.key,
                                        allowed: v,
                                      })
                                    }
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
