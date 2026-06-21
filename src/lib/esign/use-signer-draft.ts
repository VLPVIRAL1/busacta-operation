import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Autosaves a signer's in-progress field values to localStorage so a
 * refresh, accidental tab close, or navigate-back doesn't wipe their work.
 *
 * Stored under a token-scoped key. We cap the total serialized payload at
 * ~1.5 MB; if a signature data URL would push us over that, we keep the
 * text values but mark the oversized field so the UI can re-prompt for it
 * (rather than silently dropping the whole draft).
 */

export type SignerLocalValue = {
  text?: string;
  dataUrl?: string;
  /** Set when the previous value was too large to persist. */
  needsRecapture?: boolean;
};

export type SignerDraft = {
  values: Record<string, SignerLocalValue>;
  consent: boolean;
  updatedAt: number;
};

const MAX_BYTES = 1_500_000;

function keyFor(token: string) {
  return `esign:draft:${token}`;
}

function safeRead(token: string): SignerDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SignerDraft;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.values || typeof parsed.values !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWrite(token: string, draft: SignerDraft) {
  if (typeof window === "undefined") return;
  try {
    let serialized = JSON.stringify(draft);
    if (serialized.length > MAX_BYTES) {
      // Strip oversized data URLs first, mark them for re-capture.
      const trimmed: SignerDraft = {
        ...draft,
        values: Object.fromEntries(
          Object.entries(draft.values).map(([id, v]) => {
            if (v.dataUrl && v.dataUrl.length > 200_000) {
              return [id, { text: v.text, needsRecapture: true }];
            }
            return [id, v];
          }),
        ),
      };
      serialized = JSON.stringify(trimmed);
    }
    if (serialized.length <= MAX_BYTES) {
      window.localStorage.setItem(keyFor(token), serialized);
    }
  } catch {
    /* quota exceeded or storage disabled — drop silently */
  }
}

export function useSignerDraft(token: string) {
  const [hydrated, setHydrated] = useState<SignerDraft | null>(null);
  const [hydratedOnce, setHydratedOnce] = useState(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setHydrated(safeRead(token));
    setHydratedOnce(true);
  }, [token]);

  const save = useCallback(
    (draft: SignerDraft) => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => safeWrite(token, draft), 400);
    },
    [token],
  );

  const clear = useCallback(() => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(keyFor(token));
    } catch {
      /* noop */
    }
  }, [token]);

  return { hydrated, hydratedOnce, save, clear };
}

/**
 * Persist + restore the signer's scroll position so a refresh keeps them
 * on the field they were filling.
 */
export function useScrollRestore(scrollKey: string) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.sessionStorage.getItem(`esign:scroll:${scrollKey}`);
    if (stored) {
      const y = Number(stored);
      if (!Number.isNaN(y)) {
        requestAnimationFrame(() => window.scrollTo({ top: y }));
      }
    }
    let pending: number | null = null;
    const onScroll = () => {
      if (pending != null) return;
      pending = requestAnimationFrame(() => {
        pending = null;
        try {
          window.sessionStorage.setItem(`esign:scroll:${scrollKey}`, String(window.scrollY));
        } catch {
          /* noop */
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (pending != null) cancelAnimationFrame(pending);
    };
  }, [scrollKey]);
}
