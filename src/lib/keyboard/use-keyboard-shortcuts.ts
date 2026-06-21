import { useEffect, useRef } from "react";
import { shouldIgnoreGlobalKey, isModalOpen } from "./is-typing-target";

type Handler = (e: KeyboardEvent) => void;

export type ShortcutMap = {
  /** Single keys or combos like "?", "/", "r", "n", "mod+k", "shift+/", "esc". */
  [combo: string]: Handler;
};

export type SequenceMap = {
  /** Two-key sequences like "g d" (press g then d within 1s). */
  [sequence: string]: Handler;
};

export type UseKeyboardShortcutsOptions = {
  /** When false, the listener is detached. */
  enabled?: boolean;
  /** Respect modals: ignore keys while a Radix dialog/sheet is open. Default true. */
  ignoreInModal?: boolean;
};

function comboFor(e: KeyboardEvent): string[] {
  const mod = e.ctrlKey || e.metaKey;
  const parts: string[] = [];
  if (mod) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  // produce a few aliases so callers can use either "?" or "shift+/"
  const combos: string[] = [];
  combos.push([...parts, key].join("+"));
  if (e.key === "?" || (e.shiftKey && e.key === "/")) combos.push("?");
  if (e.key === "Escape") combos.push("esc");
  if (e.key === " ") combos.push("space");
  if (e.key === "Enter") combos.push("enter");
  return combos;
}

/**
 * Register global keyboard handlers. Auto-skips while typing in inputs,
 * in contentEditable, or (by default) while a Radix dialog/sheet is open.
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutMap,
  sequences: SequenceMap = {},
  opts: UseKeyboardShortcutsOptions = {},
) {
  const { enabled = true, ignoreInModal = true } = opts;
  const bufferRef = useRef<{ key: string; ts: number } | null>(null);
  const shortcutsRef = useRef(shortcuts);
  const sequencesRef = useRef(sequences);
  shortcutsRef.current = shortcuts;
  sequencesRef.current = sequences;

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalKey(e)) return;
      if (ignoreInModal && isModalOpen()) {
        // Only allow Escape inside modals (handled by Radix itself).
        return;
      }

      const combos = comboFor(e);

      // Single-shot combos
      for (const c of combos) {
        const handler = shortcutsRef.current[c];
        if (handler) {
          e.preventDefault();
          handler(e);
          bufferRef.current = null;
          return;
        }
      }

      // Two-key sequences (e.g. "g d")
      const plain = e.key.toLowerCase();
      if (!e.ctrlKey && !e.metaKey && !e.altKey && plain.length === 1) {
        const now = Date.now();
        const buf = bufferRef.current;
        if (buf && now - buf.ts < 1000) {
          const seq = `${buf.key} ${plain}`;
          const seqHandler = sequencesRef.current[seq];
          bufferRef.current = null;
          if (seqHandler) {
            e.preventDefault();
            seqHandler(e);
            return;
          }
        }
        // Start a buffer if this key prefixes any sequence
        const prefixes = Object.keys(sequencesRef.current).map((s) => s.split(" ")[0]);
        if (prefixes.includes(plain)) {
          bufferRef.current = { key: plain, ts: now };
          return;
        }
        bufferRef.current = null;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, ignoreInModal]);
}
