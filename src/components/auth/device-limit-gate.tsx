import { useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { DeviceLimitDialog } from "@/components/auth/device-limit-dialog";

/** Mounted at root: renders the 4th-device prompt whenever auth surfaces it. */
export function DeviceLimitGate() {
  const { deviceLimitPrompt, resolveDeviceLimit, cancelDeviceLimit } = useAuth();
  const [pending, setPending] = useState(false);
  if (!deviceLimitPrompt) return null;
  return (
    <DeviceLimitDialog
      open
      devices={deviceLimitPrompt.activeDevices}
      newDeviceLabel={deviceLimitPrompt.newDeviceLabel}
      pending={pending}
      onRevokeAndContinue={async (id) => {
        setPending(true);
        try {
          await resolveDeviceLimit(id);
        } finally {
          setPending(false);
        }
      }}
      onCancel={() => {
        void cancelDeviceLimit();
      }}
    />
  );
}
