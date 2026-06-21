export type MappingIssue = {
  field: string;
  severity: "error" | "warning";
  message: string;
};

/**
 * Validate the user's header mapping against the file's sample rows.
 * Returns issues per canonical field.
 */
export function validateMapping(input: {
  mapping: Record<string, string>;
  required: string[];
  rawHeaders: string[];
  sampleRows: Record<string, unknown>[];
  dateParser: (v: unknown) => string | null;
}): MappingIssue[] {
  const { mapping, required, rawHeaders, sampleRows, dateParser } = input;
  const issues: MappingIssue[] = [];

  // 1. Required fields must be set.
  for (const field of required) {
    if (!mapping[field]) {
      issues.push({ field, severity: "error", message: `${field} is required` });
    } else if (!rawHeaders.includes(mapping[field])) {
      issues.push({
        field,
        severity: "error",
        message: `Mapped column "${mapping[field]}" is not in the file`,
      });
    }
  }

  // 2. Duplicate mappings.
  const used: Record<string, string[]> = {};
  for (const [field, col] of Object.entries(mapping)) {
    if (!col) continue;
    (used[col] ||= []).push(field);
  }
  for (const [col, fields] of Object.entries(used)) {
    if (fields.length > 1) {
      for (const f of fields) {
        issues.push({
          field: f,
          severity: "warning",
          message: `Column "${col}" is also mapped to ${fields.filter((x) => x !== f).join(", ")}`,
        });
      }
    }
  }

  // 3. Date column sample validation.
  const dateCol = mapping["Date"];
  if (dateCol) {
    let bad = 0;
    let blank = 0;
    const sample = sampleRows.slice(0, 20);
    for (const r of sample) {
      const v = r[dateCol];
      if (v == null || String(v).trim() === "") {
        blank += 1;
        continue;
      }
      if (!dateParser(v)) bad += 1;
    }
    if (bad > 0) {
      issues.push({
        field: "Date",
        severity: "warning",
        message: `${bad} of first ${sample.length} sample rows have an unparseable date`,
      });
    }
    if (blank === sample.length && sample.length > 0) {
      issues.push({
        field: "Date",
        severity: "error",
        message: "Mapped Date column is empty in every sample row",
      });
    }
  }

  // 4. Employee Name column sample blank check.
  const nameCol = mapping["Employee Name"];
  if (nameCol) {
    const sample = sampleRows.slice(0, 20);
    const blank = sample.filter(
      (r) => r[nameCol] == null || String(r[nameCol]).trim() === "",
    ).length;
    if (blank === sample.length && sample.length > 0) {
      issues.push({
        field: "Employee Name",
        severity: "error",
        message: "Mapped Employee Name column is empty in every sample row",
      });
    } else if (blank > 0) {
      issues.push({
        field: "Employee Name",
        severity: "warning",
        message: `${blank} of first ${sample.length} sample rows have no employee name`,
      });
    }
  }

  return issues;
}

export function issuesByField(issues: MappingIssue[]): Record<string, MappingIssue[]> {
  const out: Record<string, MappingIssue[]> = {};
  for (const i of issues) (out[i.field] ||= []).push(i);
  return out;
}
