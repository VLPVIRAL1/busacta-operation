import type { PdfDocType } from "./schemas";

export type PdfPlaceholderGroup = "Company" | "Employee" | "Payroll" | "Report" | "Dates";

export interface PdfPlaceholder {
  token: string;
  key: string;
  label: string;
  sample: string;
  group: PdfPlaceholderGroup;
  docTypes: PdfDocType[];
}

function ph(
  key: string,
  label: string,
  sample: string,
  group: PdfPlaceholderGroup,
  docTypes: PdfDocType[],
): PdfPlaceholder {
  return { token: `{{${key}}}`, key, label, sample, group, docTypes };
}

export const PDF_PLACEHOLDERS: PdfPlaceholder[] = [
  // ── Company ──
  ph("company_name", "Company Name", "BusAcTa LLP", "Company", ["salary_slip", "financial_report"]),
  ph("company_address", "Company Address", "Mumbai, Maharashtra 400001", "Company", [
    "salary_slip",
  ]),

  // ── Employee ──
  ph("employee_name", "Employee Name", "Priya Sharma", "Employee", ["salary_slip"]),
  ph("employee_id", "Employee ID", "EMP-001", "Employee", ["salary_slip"]),
  ph("department", "Department", "Engineering", "Employee", ["salary_slip"]),
  ph("designation", "Designation", "Senior Developer", "Employee", ["salary_slip"]),
  ph("bank_account", "Bank Account (masked)", "XXXX-1234", "Employee", ["salary_slip"]),

  // ── Payroll ──
  ph("pay_period", "Pay Period", "May 2026", "Payroll", ["salary_slip"]),
  ph("working_days", "Working Days", "22", "Payroll", ["salary_slip"]),
  ph("days_present", "Days Present", "21", "Payroll", ["salary_slip"]),
  ph("basic_salary", "Basic Salary", "₹50,000", "Payroll", ["salary_slip"]),
  ph("gross_salary", "Gross Salary", "₹65,000", "Payroll", ["salary_slip"]),
  ph("net_salary", "Net Salary", "₹58,000", "Payroll", ["salary_slip"]),
  ph("deductions_total", "Total Deductions", "₹7,000", "Payroll", ["salary_slip"]),

  // ── Report ──
  ph("report_title", "Report Title", "Profit & Loss Statement", "Report", ["financial_report"]),
  ph("report_period", "Report Period", "Jan 2026 – May 2026", "Report", ["financial_report"]),
  ph("fiscal_year", "Fiscal Year", "FY 2025-26", "Report", ["financial_report"]),

  // ── Dates ──
  ph("generated_date", "Generated Date", "May 31, 2026", "Dates", [
    "salary_slip",
    "financial_report",
  ]),
];

export function getPdfPlaceholders(docType?: PdfDocType): PdfPlaceholder[] {
  if (!docType) return PDF_PLACEHOLDERS;
  return PDF_PLACEHOLDERS.filter((p) => p.docTypes.includes(docType));
}

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function substitutePdfPlaceholders(text: string, data: Record<string, unknown>): string {
  if (!text) return text;
  return text.replace(TOKEN_RE, (whole, key: string) => {
    const val = data[key];
    if (val === undefined || val === null) return whole;
    return String(val);
  });
}

export function samplePlaceholderData(docType?: PdfDocType): Record<string, string> {
  return Object.fromEntries(getPdfPlaceholders(docType).map((p) => [p.key, p.sample]));
}
