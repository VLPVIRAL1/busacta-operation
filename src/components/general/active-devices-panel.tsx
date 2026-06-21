import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Laptop, MonitorSmartphone, LogOut, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import { getOrCreateDeviceId } from "@/lib/auth/device-id";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type DeviceRow = {
  id: string;
  device_id: string;
  label: string | null;
  user_agent: string | null;
  last_ip: string | null;
  last_seen_at: string;
};

export function ActiveDevicesPanel() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const currentDeviceId = getOrCreateDeviceId();

  const { data, isLoading } = useQuery({
    queryKey: ["my-devices", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<DeviceRow[]> => {
      const { data, error } = await supabase
        .from("user_devices")
        .select("id, device_id, label, user_agent, last_ip, last_seen_at")
        .is("revoked_at", null)
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DeviceRow[];
    },
  });

  const revoke = useMutation({
    mutationFn: async (deviceId: string) => {
      const { error } = await supabase
        .from("user_devices")
        .update({
          revoked_at: new Date().toISOString(),
          revoked_reason: "user_revoked_from_profile",
        })
        .eq("device_id", deviceId)
        .is("revoked_at", null);
      if (error) throw error;
    },
    onSuccess: (_d, deviceId) => {
      toast.success(
        deviceId === currentDeviceId ? "Signed out — you'll be redirected." : "Device signed out.",
      );
      qc.invalidateQueries({ queryKey: ["my-devices", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Active devices</CardTitle>
        <CardDescription>
          You can be signed in on up to 3 computers at a time. Sign out any device you no longer
          recognize.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No active devices.</p>
        ) : (
          <ul className="space-y-2">
            {data!.map((d) => {
              const isCurrent = d.device_id === currentDeviceId;
              const last = (() => {
                try {
                  return formatDistanceToNow(new Date(d.last_seen_at), { addSuffix: true });
                } catch {
                  return "recently";
                }
              })();
              const isMobile = /iphone|android|mobile/i.test(d.user_agent ?? "");
              return (
                <li
                  key={d.id}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                    {isMobile ? (
                      <MonitorSmartphone className="h-4 w-4" aria-hidden />
                    ) : (
                      <Laptop className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {d.label ?? "Unknown device"}
                      </span>
                      {isCurrent && <Badge variant="secondary">This device</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Last active {last}
                      {d.last_ip ? ` · ${d.last_ip}` : ""}
                    </div>
                    {d.user_agent && (
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                        {d.user_agent}
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(d.device_id)}
                  >
                    {revoke.isPending && revoke.variables === d.device_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogOut className="h-4 w-4" />
                    )}
                    <span className="ml-1.5">{isCurrent ? "Sign out here" : "Sign out"}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
