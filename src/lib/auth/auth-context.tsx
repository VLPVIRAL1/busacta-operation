import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceInfo, getGeoInfo } from "@/lib/shared/device-info";
import { flushChannels } from "@/lib/realtime/channel-registry";
import {
  clearDeviceId,
  getDeviceLabel,
  getOrCreateDeviceId,
  type ActiveDevice,
} from "@/lib/auth/device-id";

async function recordLoginEvent(userId: string, email: string | null) {
  try {
    const device = getDeviceInfo();
    const geo = await getGeoInfo();
    await supabase.from("login_events" as never).insert({
      user_id: userId,
      user_email: email,
      session_id: typeof window !== "undefined" ? getOrCreateDeviceId() : null,
      event_type: "login",
      ...device,
      ...geo,
    } as never);
  } catch (e) {
    console.warn("Failed to record login event", e);
  }
}

export type AppRole = "super_admin" | "admin" | "hr_manager" | "employee" | "client";
export type ActiveRoleValue = AppRole | "all";

const ADMIN_ROLES: AppRole[] = ["admin", "super_admin"];
// Login default order: the LEAST-access role a user holds is auto-selected
// (lowest number wins). Fixed hierarchy, fewest privileges first:
//   client < employee < hr_manager < admin < super_admin
const NON_ADMIN_ORDER: Record<AppRole, number> = {
  client: 0,
  employee: 1,
  hr_manager: 2,
  admin: 3,
  super_admin: 4,
};
const STORAGE_KEY = "active-role";

export type Department = "hr" | "finance" | "ops" | "exec";

export type DeviceLimitPrompt = {
  activeDevices: ActiveDevice[];
  newDeviceLabel: string;
};

interface AuthCtx {
  user: User | null;
  session: Session | null;
  /**
   * Currently focused role. `null` until roles load. `"all"` means the user
   * has chosen to combine every role they hold — capability checks should
   * fall back to `effectiveRoles`/`roles` in that case.
   */
  role: AppRole | null;
  activeRole: ActiveRoleValue | null;
  /** Every role granted to this user. */
  roles: AppRole[];
  /** Roles whose capabilities are currently in effect (single role, or all). */
  effectiveRoles: AppRole[];
  /** True when the user picked "All roles". */
  isAllMode: boolean;
  department: Department | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
  setActiveRole: (role: ActiveRoleValue) => void;
  /** When non-null, render the device-limit dialog. */
  deviceLimitPrompt: DeviceLimitPrompt | null;
  /** Pick one of the active devices to revoke so this browser can take its slot. */
  resolveDeviceLimit: (revokeDeviceId: string) => Promise<void>;
  /** User declined → sign out completely. */
  cancelDeviceLimit: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

const HEARTBEAT_MS = 60_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [activeRole, setActiveRoleState] = useState<ActiveRoleValue | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceLimitPrompt, setDeviceLimitPrompt] = useState<DeviceLimitPrompt | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastUidRef = useRef<string | null>(null);

  const applyRoles = useCallback((found: AppRole[]) => {
    setRoles(found);
    if (found.length === 0) {
      setActiveRoleState(null);
      return;
    }
    const stored =
      typeof window !== "undefined"
        ? (localStorage.getItem(STORAGE_KEY) as ActiveRoleValue | null)
        : null;
    // Honor a stored choice if it's still valid (single role they still have,
    // or "all" when they hold 2+ roles).
    if (stored === "all" && found.length > 1) {
      setActiveRoleState("all");
      return;
    }
    if (stored && stored !== "all" && found.includes(stored as AppRole)) {
      setActiveRoleState(stored);
      return;
    }
    // Default selection: highest-priority NON-admin role. Admin / Super Admin
    // are never auto-selected — they must explicitly switch into them.
    const nonAdmin = found.filter((r) => !ADMIN_ROLES.includes(r));
    const pool = nonAdmin.length > 0 ? nonAdmin : found;
    const pick = [...pool].sort((a, b) => NON_ADMIN_ORDER[a] - NON_ADMIN_ORDER[b])[0];
    setActiveRoleState(pick);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, pick);
  }, []);

  const fetchRoles = useCallback(
    async (uid: string) => {
      const [rolesRes, profRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("department").eq("id", uid).maybeSingle(),
      ]);
      const found = (rolesRes.data ?? []).map((r) => r.role as AppRole);
      const dept = (profRes.data as { department?: string | null } | null)?.department ?? null;
      setDepartment((dept as Department | null) ?? null);
      applyRoles(found);
    },
    [applyRoles],
  );

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(
    (deviceId: string) => {
      stopHeartbeat();
      heartbeatRef.current = setInterval(async () => {
        try {
          const { data, error } = await supabase.rpc("heartbeat_device", { _device_id: deviceId });
          if (error) return;
          const active = (data as { active?: boolean } | null)?.active;
          if (active === false) {
            // Per admin policy: do NOT auto-sign-out on device revocation.
            // Keep the session usable; surface a non-blocking notice and let
            // the user sign out manually if desired. This prevents the timer
            // UI from being interrupted by an involuntary logout.
            stopHeartbeat();
          }
        } catch {
          // Network blip — ignore.
        }
      }, HEARTBEAT_MS);
    },
    [stopHeartbeat],
  );

  // Try to claim a device slot. If at the 3-device cap, surface the prompt
  // and return false so the caller knows we're not active yet.
  const claimDevice = useCallback(async (): Promise<boolean> => {
    const deviceId = getOrCreateDeviceId();
    const label = getDeviceLabel();
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : undefined;
    const { data, error } = await supabase.rpc("claim_device_slot", {
      _device_id: deviceId,
      _label: label,
      ...(ua ? { _user_agent: ua } : {}),
    });
    if (error) {
      console.warn("claim_device_slot failed", error);
      return false;
    }
    const payload = data as
      | { status: "ok" | "reactivated"; device_id: string }
      | { status: "limit_reached"; active: ActiveDevice[] };
    if (payload?.status === "limit_reached") {
      setDeviceLimitPrompt({ activeDevices: payload.active, newDeviceLabel: label });
      return false;
    }
    setDeviceLimitPrompt(null);
    startHeartbeat(deviceId);
    return true;
  }, [startHeartbeat]);

  const resolveDeviceLimit = useCallback(
    async (revokeDeviceId: string) => {
      const deviceId = getOrCreateDeviceId();
      const label = getDeviceLabel();
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : undefined;
      const { data, error } = await supabase.rpc("revoke_and_claim_device", {
        _revoke_device_id: revokeDeviceId,
        _claim_device_id: deviceId,
        _label: label,
        ...(ua ? { _user_agent: ua } : {}),
      });
      if (error) {
        toast.error("Could not switch devices. Try again.");
        return;
      }
      const payload = data as { status?: string };
      if (payload?.status === "limit_reached") {
        toast.error("Still at the device limit. Pick a different device to sign out.");
        return;
      }
      setDeviceLimitPrompt(null);
      startHeartbeat(deviceId);
      toast.success("Signed out the other device. You're in.");
    },
    [startHeartbeat],
  );

  const cancelDeviceLimit = useCallback(async () => {
    // Non-blocking dismiss: the user is already authenticated in this tab,
    // so closing the device-limit warning must NOT sign them out. They can
    // free a slot later from the Active Devices panel.
    setDeviceLimitPrompt(null);
  }, []);

  useEffect(() => {
    // "Keep me signed in" enforcement: if the user opted out, sign them out
    // when this is a brand-new browser session (no sessionStorage marker).
    if (typeof window !== "undefined") {
      const keep = localStorage.getItem("keep-signed-in");
      const sessionMarker = sessionStorage.getItem("session-active");
      if (keep === "false" && !sessionMarker) {
        supabase.auth.signOut().catch(() => {});
      } else {
        sessionStorage.setItem("session-active", "1");
      }
    }
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        const uid = s.user.id;
        const email = s.user.email ?? null;
        if (typeof window !== "undefined") sessionStorage.setItem("session-active", "1");
        const shouldRefetch =
          (evt === "SIGNED_IN" || evt === "INITIAL_SESSION" || evt === "USER_UPDATED") &&
          lastUidRef.current !== uid;
        if (shouldRefetch) {
          lastUidRef.current = uid;
          setTimeout(() => {
            fetchRoles(uid);
            claimDevice();
            if (evt === "SIGNED_IN") {
              void recordLoginEvent(uid, email);
            }
          }, 0);
        }
      } else {
        lastUidRef.current = null;
        setRoles([]);
        setActiveRoleState(null);
        setDeviceLimitPrompt(null);
        stopHeartbeat();
        flushChannels();
      }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        lastUidRef.current = s.user.id;
        Promise.all([fetchRoles(s.user.id), claimDevice()]).finally(() => setLoading(false));
      } else setLoading(false);
    });
    return () => {
      sub.subscription.unsubscribe();
      stopHeartbeat();
    };
  }, [fetchRoles, claimDevice, stopHeartbeat]);

  const signOut = async () => {
    flushChannels();
    stopHeartbeat();
    // Revoke this device's slot before clearing local state so it doesn't
    // linger in the user's active list.
    try {
      const deviceId = getOrCreateDeviceId();
      await supabase
        .from("user_devices")
        .update({ revoked_at: new Date().toISOString(), revoked_reason: "user_sign_out" })
        .eq("device_id", deviceId)
        .is("revoked_at", null);
    } catch {
      // Best-effort — still proceed with sign out.
    }
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem("keep-signed-in");
      sessionStorage.removeItem("session-active");
      // Intentionally KEEP the device id so the next sign-in on this browser
      // re-uses the same slot instead of consuming a new one.
    }
    setRoles([]);
    setActiveRoleState(null);
  };

  const refreshRole = async () => {
    if (user) await fetchRoles(user.id);
  };

  const setActiveRole = (r: ActiveRoleValue) => {
    if (r === "all") {
      if (roles.length < 2) return;
    } else if (!roles.includes(r)) {
      return;
    }
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, r);
    setActiveRoleState(r);
  };

  const isAllMode = activeRole === "all";
  const effectiveRoles: AppRole[] = isAllMode ? roles : activeRole ? [activeRole] : [];
  // Backwards-compat `role` field: callers that check `role === "admin"` keep
  // working in single-role mode. In "All" mode we surface the user's highest-
  // privilege role so admin UI keeps rendering for admins who chose "All".
  // Sort descending (highest NON_ADMIN_ORDER = most privileged) to surface the
  // top role in "All" mode so admin checks like `role === "super_admin"` work.
  const legacyRole: AppRole | null = isAllMode
    ? ([...roles].sort((a, b) => NON_ADMIN_ORDER[b] - NON_ADMIN_ORDER[a])[0] ?? null)
    : (activeRole ?? null);

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        role: legacyRole,
        activeRole,
        roles,
        effectiveRoles,
        isAllMode,
        department,
        loading,
        signOut,
        refreshRole,
        setActiveRole,
        deviceLimitPrompt,
        resolveDeviceLimit,
        cancelDeviceLimit,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}

// Re-export for callers that want to clear the slot on hard reset.
export { clearDeviceId };
