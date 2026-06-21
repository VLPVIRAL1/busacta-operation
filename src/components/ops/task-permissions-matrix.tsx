import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserAvatar } from "@/components/shared/user-avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";

const CAPS = [
  { key: "can_view", label: "View" },
  { key: "can_edit_fields", label: "Edit" },
  { key: "can_edit_time", label: "Time" },
  { key: "can_manage_subtasks", label: "Subtasks" },
  { key: "can_manage_attachments", label: "Files" },
  { key: "can_change_status", label: "Status" },
] as const;

type Cap = (typeof CAPS)[number]["key"];

type Row = Record<Cap, boolean> & {
  task_id: string;
  user_id: string;
};

interface Props {
  taskId: string;
}

export function TaskPermissionsMatrix({ taskId }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: profiles, isLoading: lp } = useQuery({
    queryKey: ["client-profiles"],
    queryFn: async () => {
      // Show clients only — internal users get full access via task_capability().
      const { data } = await supabase
        .from("user_roles")
        .select("user_id, role, profiles!inner(id, full_name, email, avatar_url, status)")
        .eq("role", "client");
      type Profile = {
        id: string;
        full_name: string | null;
        email: string | null;
        avatar_url: string | null;
        status: string | null;
      };
      type RoleRow = { user_id: string; profiles: Profile | Profile[] | null };
      const rows = (data ?? []) as unknown as RoleRow[];
      return rows
        .map((r) => (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles))
        .filter((p): p is Profile => !!p && p.status !== "disabled");
    },
  });

  const { data: rows, isLoading: lr } = useQuery({
    queryKey: ["task-permissions", taskId],
    queryFn: async () => {
      const { data } = await supabase
        .from("task_permissions")
        .select(
          "task_id, user_id, can_view, can_edit_fields, can_edit_time, can_manage_subtasks, can_manage_attachments, can_change_status",
        )
        .eq("task_id", taskId);
      return (data ?? []) as Row[];
    },
  });

  const byUser = useMemo(() => {
    const map = new Map<string, Row>();
    for (const r of rows ?? []) map.set(r.user_id, r);
    return map;
  }, [rows]);

  const toggle = useMutation({
    mutationFn: async (v: { user_id: string; cap: Cap; value: boolean }) => {
      const existing = byUser.get(v.user_id);
      const base: Row = existing ?? {
        task_id: taskId,
        user_id: v.user_id,
        can_view: true,
        can_edit_fields: false,
        can_edit_time: false,
        can_manage_subtasks: false,
        can_manage_attachments: false,
        can_change_status: false,
      };
      const next = { ...base, [v.cap]: v.value };
      const { error } = await supabase
        .from("task_permissions")
        .upsert({ ...next, granted_by: user?.id ?? null } as never, {
          onConflict: "task_id,user_id",
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-permissions", taskId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const loading = lp || lr;

  return (
    <Card className="border-dashed">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Per-task access matrix
        </div>
        <p className="text-xs text-muted-foreground">
          Choose which clients can do what on this task. Internal employees and admins always have
          full access.
        </p>
        {loading ? (
          <Skeleton className="h-32" />
        ) : (profiles ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No client users yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[220px]">User</TableHead>
                {CAPS.map((c) => (
                  <TableHead key={c.key} className="text-center text-[11px]">
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(profiles ?? []).map((p) => {
                const r = byUser.get(p.id);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          profile={{
                            id: p.id,
                            full_name: p.full_name,
                            email: p.email,
                            avatar_url: p.avatar_url,
                          }}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">
                            {p.full_name || p.email}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {p.email}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    {CAPS.map((c) => (
                      <TableCell key={c.key} className="text-center">
                        <Checkbox
                          checked={!!(r?.[c.key] ?? (c.key === "can_view" ? false : false))}
                          onCheckedChange={(v) =>
                            toggle.mutate({ user_id: p.id, cap: c.key, value: !!v })
                          }
                          disabled={toggle.isPending}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {toggle.isPending && (
          <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" /> Saving…
          </div>
        )}
      </CardContent>
    </Card>
  );
}
