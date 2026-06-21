/**
 * Comm Offline Queue
 *
 * Tiny IndexedDB-backed queue for outbound messages. When the browser is
 * offline (or a send fails transiently), callers `enqueue()` the payload;
 * when the network returns, `drain()` replays each item through the provided
 * sender function. Items are removed on success and re-queued on failure
 * (with an attempt counter so we can drop after N retries).
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const DB_NAME = "comm-offline-queue";
const DB_VERSION = 1;
const STORE = "outbox";
const MAX_ATTEMPTS = 5;

export type OutboxScope = "task" | "chat";

export interface OutboxItem {
  id: string;
  scope: OutboxScope;
  // For task: { task_id, body, reply_to_message_id?, client_msg_id, is_client_visible }
  // For chat: { thread_id, body, reply_to_message_id?, client_msg_id }
  payload: Record<string, unknown>;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    let out: T;
    Promise.resolve(fn(s))
      .then((v) => (out = v))
      .catch(reject);
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function enqueue(
  scope: OutboxScope,
  payload: Record<string, unknown>,
): Promise<OutboxItem> {
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    scope,
    payload,
    enqueuedAt: Date.now(),
    attempts: 0,
  };
  await tx("readwrite", (s) => {
    s.put(item);
  });
  return item;
}

export async function listQueue(): Promise<OutboxItem[]> {
  return tx(
    "readonly",
    (s) =>
      new Promise<OutboxItem[]>((resolve, reject) => {
        const req = s.getAll();
        req.onsuccess = () => resolve((req.result as OutboxItem[]) ?? []);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function removeItem(id: string): Promise<void> {
  await tx("readwrite", (s) => {
    s.delete(id);
  });
}

async function updateItem(item: OutboxItem): Promise<void> {
  await tx("readwrite", (s) => {
    s.put(item);
  });
}

async function sendItem(item: OutboxItem): Promise<void> {
  if (item.scope === "task") {
    const { error } = await supabase.from("task_messages").insert(item.payload as never);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("chat_messages").insert(item.payload as never);
    if (error) throw error;
  }
}

let draining = false;

export async function drain(): Promise<{ sent: number; failed: number; dropped: number }> {
  if (draining) return { sent: 0, failed: 0, dropped: 0 };
  draining = true;
  let sent = 0,
    failed = 0,
    dropped = 0;
  try {
    const items = await listQueue();
    for (const it of items) {
      try {
        await sendItem(it);
        await removeItem(it.id);
        sent++;
      } catch (err) {
        const next: OutboxItem = {
          ...it,
          attempts: it.attempts + 1,
          lastError: err instanceof Error ? err.message : String(err),
        };
        if (next.attempts >= MAX_ATTEMPTS) {
          await removeItem(it.id);
          dropped++;
        } else {
          await updateItem(next);
          failed++;
        }
      }
    }
  } finally {
    draining = false;
  }
  return { sent, failed, dropped };
}

/**
 * Mount once near the inbox root. Drains on mount, on `online` events,
 * and every 60s while online (in case the browser missed an event).
 */
export function useOfflineDrain() {
  const qc = useQueryClient();
  const lastNotifyRef = useRef(0);

  useEffect(() => {
    let stopped = false;

    const run = async () => {
      if (stopped) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      try {
        const res = await drain();
        if (res.sent > 0) {
          qc.invalidateQueries({ queryKey: ["inbox"] });
          qc.invalidateQueries({ queryKey: ["conv-messages"] });
          qc.invalidateQueries({ queryKey: ["task-conv-messages"] });
          // Coalesce toasts to once per 5s.
          const now = Date.now();
          if (now - lastNotifyRef.current > 5_000) {
            lastNotifyRef.current = now;
            toast.success(`Sent ${res.sent} queued message${res.sent === 1 ? "" : "s"}`);
          }
        }
        if (res.dropped > 0) {
          toast.error(
            `Dropped ${res.dropped} message${res.dropped === 1 ? "" : "s"} after retries`,
          );
        }
      } catch {
        /* ignore */
      }
    };

    void run();
    const onOnline = () => void run();
    window.addEventListener("online", onOnline);
    const id = window.setInterval(run, 60_000);
    return () => {
      stopped = true;
      window.removeEventListener("online", onOnline);
      window.clearInterval(id);
    };
  }, [qc]);
}
