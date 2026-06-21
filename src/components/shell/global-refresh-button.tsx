import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/shared/utils";

const DEBOUNCE_MS = 800;

function formatAgo(ts: number | null) {
  if (!ts) return "never";
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function GlobalRefreshButton() {
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const lastClickRef = useRef(0);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Force tooltip "ago" to tick
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastClickRef.current < DEBOUNCE_MS) return;
    lastClickRef.current = now;
    if (!online) {
      toast.error("You're offline");
      return;
    }
    setBusy(true);
    try {
      await Promise.all([qc.invalidateQueries(), router.invalidate()]);
      // Wait for in-flight refetches to settle (cap at 8s)
      const start = Date.now();
      while (qc.isFetching() > 0 && Date.now() - start < 8000) {
        await new Promise((r) => setTimeout(r, 150));
      }
      setLastAt(Date.now());
      toast.success("Data refreshed", { duration: 1500 });
    } catch (e) {
      toast.error("Refresh failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }, [qc, router, online]);

  // Keyboard shortcut: R (when not typing)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "r" && e.key !== "R") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      void refresh();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refresh]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            disabled={busy || !online}
            aria-label="Refresh data"
            className="rounded-full"
          >
            <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {!online
            ? "Offline"
            : busy
              ? "Refreshing…"
              : `Refresh data (R) · Last: ${formatAgo(lastAt)}`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
