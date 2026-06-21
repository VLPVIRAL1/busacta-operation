/// <reference lib="webworker" />
import * as XLSX from "xlsx";

type RawRow = Record<string, unknown>;

self.onmessage = (e: MessageEvent<ArrayBuffer>) => {
  try {
    const wb = XLSX.read(new Uint8Array(e.data), { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: null });
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    // Date objects survive structured clone, so pass through directly.
    (self as unknown as Worker).postMessage({ ok: true, headers, rows });
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: (err as Error).message });
  }
};
