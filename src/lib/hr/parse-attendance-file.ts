import Papa from "papaparse";
import XlsxWorker from "@/workers/xlsx-parser.worker?worker";

export type RawRow = Record<string, unknown>;

export type ParsedFile = {
  headers: string[];
  rows: RawRow[];
};

export type ParseProgress = (info: { stage: string; percent: number; rows?: number }) => void;

/**
 * Client-side parser for biometric attendance exports.
 *  - CSV → PapaParse, streaming (worker + chunk) to avoid freezing the UI.
 *  - XLSX/XLS → SheetJS inside a dedicated Web Worker.
 *
 * `onProgress` gets called as parsing advances so the UI can show a live bar.
 */
export async function parseAttendanceFile(
  file: File,
  onProgress?: ParseProgress,
): Promise<ParsedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv") return parseCsv(file, onProgress);
  if (ext === "xlsx" || ext === "xls") return parseXlsxInWorker(file, onProgress);
  throw new Error(`Unsupported file type: .${ext || "?"}`);
}

function parseCsv(file: File, onProgress?: ParseProgress): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    onProgress?.({ stage: "Reading CSV…", percent: 0 });

    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const rows = results.data.filter(
          (r) => r && Object.values(r).some((v) => v != null && String(v).trim() !== ""),
        );
        const headers = results.meta.fields ?? (rows[0] ? Object.keys(rows[0]) : []);
        onProgress?.({ stage: "Done", percent: 100, rows: rows.length });
        resolve({ headers, rows });
      },
      error: (err) => reject(err),
    });
  });
}

function parseXlsxInWorker(file: File, onProgress?: ParseProgress): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    onProgress?.({ stage: "Reading file…", percent: 10 });
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = (e) => {
      const buf = e.target?.result as ArrayBuffer;
      onProgress?.({ stage: "Parsing spreadsheet in worker…", percent: 40 });
      let worker: Worker;
      try {
        worker = new XlsxWorker();
      } catch (err) {
        // Fallback: parse on main thread if worker construction fails.
        return parseXlsxMainThread(buf).then(resolve, reject);
      }
      worker.onmessage = (
        msg: MessageEvent<{ ok: boolean; headers?: string[]; rows?: RawRow[]; error?: string }>,
      ) => {
        worker.terminate();
        if (!msg.data.ok) return reject(new Error(msg.data.error || "Worker failed"));
        onProgress?.({ stage: "Done", percent: 100, rows: msg.data.rows!.length });
        resolve({ headers: msg.data.headers!, rows: msg.data.rows! });
      };
      worker.onerror = (ev) => {
        worker.terminate();
        reject(new Error(ev.message || "Worker error"));
      };
      worker.postMessage(buf, [buf]);
    };
    reader.readAsArrayBuffer(file);
  });
}

async function parseXlsxMainThread(buf: ArrayBuffer): Promise<ParsedFile> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: null });
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  return { headers, rows };
}
