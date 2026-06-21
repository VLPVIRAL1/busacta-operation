import { describe, it, expect } from "vitest";
import {
  resolveVariants,
  buildExportFilename,
  normalizeSheetName,
  buildMultiSheetPayload,
  buildSharedMeta,
  isExportEmpty,
  type ExportVariant,
} from "../export-menu-helpers";

const v = (label: string, rows: number, opts: Partial<ExportVariant> = {}): ExportVariant => ({
  label,
  suffix: `_${label.toLowerCase()}`,
  rows: Array.from({ length: rows }, (_, i) => ({ Name: `R${i}`, Amount: i * 10 })),
  ...opts,
});

describe("ExportMenu helpers — variant resolution", () => {
  it("falls back to single CSV variant when no variants provided", () => {
    const rows = [{ a: 1 }];
    const out = resolveVariants(undefined, rows);
    expect(out).toEqual([{ label: "CSV", suffix: "", rows }]);
  });

  it("falls back when variants is empty array", () => {
    expect(resolveVariants([], [{ x: 1 }])).toHaveLength(1);
    expect(resolveVariants([], [{ x: 1 }])[0].suffix).toBe("");
  });

  it("preserves provided variants verbatim", () => {
    const variants = [v("Summary", 2), v("Detail", 5)];
    expect(resolveVariants(variants, [])).toBe(variants);
  });
});

describe("ExportMenu helpers — filename routing", () => {
  it.each([
    ["report", "", "csv", "report.csv"],
    ["report", "_summary", "xlsx", "report_summary.xlsx"],
    ["pl-2026", "_detail", "pdf", "pl-2026_detail.pdf"],
    ["", "_x", "csv", "_x.csv"],
  ] as const)("buildExportFilename(%s,%s,%s) → %s", (base, suffix, ext, expected) => {
    expect(buildExportFilename(base, suffix, ext)).toBe(expected);
  });
});

describe("ExportMenu helpers — sheet names", () => {
  it("uses sheetName when provided", () => {
    expect(normalizeSheetName(v("Profit & Loss", 1, { sheetName: "P&L" }))).toBe("P&L");
  });

  it("falls back to label when sheetName missing", () => {
    expect(normalizeSheetName(v("Balance Sheet", 0))).toBe("Balance Sheet");
  });

  it("truncates names to Excel's 31-char limit", () => {
    const long = "A".repeat(50);
    expect(normalizeSheetName(v(long, 0)).length).toBe(31);
    expect(normalizeSheetName(v("x", 0, { sheetName: long }))).toBe("A".repeat(31));
  });
});

describe("ExportMenu helpers — multi-sheet workbook payload", () => {
  it("maps every variant to a sheet with correct name and row mapping", () => {
    const variants = [
      v("Summary", 2),
      v("Detail", 4, { sheetName: "Line Detail" }),
      v("Tax vs Actual", 3),
    ];
    const payload = buildMultiSheetPayload("finance-report", variants);

    expect(payload.filename).toBe("finance-report.xlsx");
    expect(payload.sheets).toHaveLength(3);
    expect(payload.sheets.map((s) => s.name)).toEqual(["Summary", "Line Detail", "Tax vs Actual"]);
    expect(payload.sheets[0].rows).toBe(variants[0].rows);
    expect(payload.sheets[1].rows).toHaveLength(4);
    expect(payload.sheets[2].rows[0]).toEqual({ Name: "R0", Amount: 0 });
  });

  it("does not mutate the source variants", () => {
    const variants = [v("A", 1), v("B", 2)];
    const snapshot = JSON.parse(JSON.stringify(variants));
    buildMultiSheetPayload("x", variants);
    expect(variants).toEqual(snapshot);
  });

  it("matches snapshot for canonical finance variants", () => {
    const variants = [v("P&L", 1), v("Balance", 1), v("Cash Flow", 1)];
    expect(buildMultiSheetPayload("finance", variants)).toMatchInlineSnapshot(`
      {
        "filename": "finance.xlsx",
        "sheets": [
          {
            "name": "P&L",
            "rows": [
              {
                "Amount": 0,
                "Name": "R0",
              },
            ],
          },
          {
            "name": "Balance",
            "rows": [
              {
                "Amount": 0,
                "Name": "R0",
              },
            ],
          },
          {
            "name": "Cash Flow",
            "rows": [
              {
                "Amount": 0,
                "Name": "R0",
              },
            ],
          },
        ],
      }
    `);
  });
});

describe("ExportMenu helpers — shared meta merging", () => {
  it("returns undefined when neither meta nor pdf provided", () => {
    expect(buildSharedMeta(undefined, undefined)).toBeUndefined();
  });

  it("prefers explicit meta fields over PDF defaults", () => {
    const m = buildSharedMeta(
      { title: "Custom", scope: "Firm A" },
      { title: "PDF Title", from: "2026-01-01", to: "2026-01-31" },
    );
    expect(m).toEqual({
      title: "Custom",
      subtitle: undefined,
      period: "2026-01-01 → 2026-01-31",
      scope: "Firm A",
    });
  });

  it("derives period from PDF from/to when meta.period is absent", () => {
    expect(buildSharedMeta(undefined, { from: "2026-01-01" })?.period).toBe("2026-01-01 → —");
    expect(buildSharedMeta(undefined, { to: "2026-12-31" })?.period).toBe("— → 2026-12-31");
  });
});

describe("ExportMenu helpers — empty detection", () => {
  it("is empty when all variants have zero rows and no custom PDF", () => {
    expect(isExportEmpty([v("A", 0), v("B", 0)], false)).toBe(true);
  });

  it("is not empty when any variant has rows", () => {
    expect(isExportEmpty([v("A", 0), v("B", 1)], false)).toBe(false);
  });

  it("is not empty when a custom PDF action is present", () => {
    expect(isExportEmpty([v("A", 0)], true)).toBe(false);
  });
});
