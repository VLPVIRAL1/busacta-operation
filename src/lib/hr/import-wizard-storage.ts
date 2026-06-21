const KEY_PREFIX = "emp:import:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 h

export type EmpDraftRow = {
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  department: string;
  position_title: string;
  employment_type: string;
  join_date: string;
  system_role: string;
  phone: string;
};

interface ImportDraftSnapshot {
  rows: EmpDraftRow[];
  savedAt: number;
}

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function saveImportDraft(userId: string, rows: EmpDraftRow[]): void {
  if (typeof window === "undefined") return;
  try {
    const payload: ImportDraftSnapshot = { rows, savedAt: Date.now() };
    window.localStorage.setItem(keyFor(userId), JSON.stringify(payload));
  } catch (e) {
    console.warn("[emp-import] localStorage save failed", e);
  }
}

export function loadImportDraft(userId: string): ImportDraftSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImportDraftSnapshot;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(keyFor(userId));
      return null;
    }
    return parsed;
  } catch (e) {
    console.warn("[emp-import] localStorage load failed", e);
    return null;
  }
}

export function clearImportDraft(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(userId));
  } catch {
    /* ignore */
  }
}
