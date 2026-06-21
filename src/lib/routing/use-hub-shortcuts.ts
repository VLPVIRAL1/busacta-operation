import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { HUB_SHORTCUT_MAP } from "@/lib/routing/hub-shortcut-map";
import { shouldIgnoreGlobalKey, isModalOpen } from "@/lib/keyboard/is-typing-target";

/**
 * Global hub navigation shortcuts:
 *  - Alt+1…9 (and Alt+p/n/l/r) — instant hub jumps, from HUB_SHORTCUT_MAP.
 *  - "g" then a letter — vim-style "go to" sequences (d=dashboard, o=ops,
 *    h=hr, w=growth, a=admin, u=guide).
 *
 * Disabled while typing in inputs / textareas / contentEditable / Radix
 * combobox, and while a modal dialog/sheet owns focus.
 */

const GO_SEQUENCES: Record<string, string> = {
  d: "/global-dashboard",
  o: "/ops",
  h: "/hr",
  w: "/growth",
  a: "/admin",
  u: "/guide",
};

export function useHubShortcuts() {
  const router = useRouter();
  useEffect(() => {
    let buffer: { key: string; ts: number } | null = null;

    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalKey(e)) return;
      if (isModalOpen()) return;

      // Alt+<key> — existing instant hub map
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        const dest = HUB_SHORTCUT_MAP[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          router.navigate({ to: dest as never });
        }
        return;
      }

      // No modifiers: handle the "g <letter>" sequence
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const key = e.key.toLowerCase();
      const now = Date.now();

      if (buffer && now - buffer.ts < 1000 && buffer.key === "g") {
        const dest = GO_SEQUENCES[key];
        buffer = null;
        if (dest) {
          e.preventDefault();
          router.navigate({ to: dest as never });
        }
        return;
      }

      if (key === "g") {
        buffer = { key: "g", ts: now };
        return;
      }
      buffer = null;
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}
