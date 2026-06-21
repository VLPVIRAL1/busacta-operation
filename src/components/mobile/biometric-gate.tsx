import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isNative } from "@/lib/mobile/is-native";
import { markActive, needsBiometricReauth, promptBiometric } from "@/lib/mobile/biometric";
import { installDeepLinkHandler } from "@/lib/mobile/deep-link";

/**
 * Native-only overlay: when the app resumes after >5 min in the background,
 * blur the UI and require Face ID / Touch ID / fingerprint to continue.
 * Renders nothing on web.
 */
export function BiometricGate() {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!isNative()) return;
    void installDeepLinkHandler();
    markActive();

    const onVisibility = async () => {
      if (document.visibilityState === "visible") {
        if (needsBiometricReauth()) {
          setLocked(true);
        } else {
          markActive();
        }
      } else {
        markActive();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const unlock = async () => {
    const ok = await promptBiometric("Unlock BusAcTa Operations");
    if (ok) {
      markActive();
      setLocked(false);
    }
  };

  if (!locked) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background/95 backdrop-blur-md">
      <Fingerprint className="h-16 w-16 text-primary" aria-hidden />
      <div className="text-center">
        <h2 className="text-lg font-semibold">BusAcTa Operations is locked</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Use Face ID, Touch ID, or your fingerprint to continue.
        </p>
      </div>
      <Button onClick={unlock}>Unlock</Button>
    </div>
  );
}
