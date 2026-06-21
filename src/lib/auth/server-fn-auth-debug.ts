export type ServerFnAuthDebugEntry = {
  id: string;
  url: string;
  method: string;
  status: number | "network-error";
  ok: boolean;
  bearerAttached: boolean;
  hadExistingAuthorization: boolean;
  tokenAvailable: boolean;
  tokenPrefix: string | null;
  errorMessage: string | null;
  timestamp: string;
};

const MAX_ENTRIES = 30;
let entries: ServerFnAuthDebugEntry[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function recordServerFnAuthDebug(entry: Omit<ServerFnAuthDebugEntry, "id" | "timestamp">) {
  entries = [
    { ...entry, id: crypto.randomUUID(), timestamp: new Date().toISOString() },
    ...entries,
  ].slice(0, MAX_ENTRIES);
  notify();
}

export function getServerFnAuthDebugEntries() {
  return entries;
}

export function clearServerFnAuthDebugEntries() {
  entries = [];
  notify();
}

export function subscribeServerFnAuthDebug(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
