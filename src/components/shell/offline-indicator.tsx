import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Tiny pill that appears when navigator reports offline.
 * Used by both the web app and the Electron desktop wrapper.
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive shadow-lg backdrop-blur">
      <span className="inline-flex items-center gap-1.5">
        <WifiOff className="h-3.5 w-3.5" />
        Offline — changes will sync when reconnected
      </span>
    </div>
  );
}
