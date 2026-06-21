import type { PdfDocType } from "./schemas";

export interface SampleLineItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface SampleEarningsRow {
  label: string;
  amount: number;
}

export interface SampleReportRow {
  label: string;
  amount: number;
  style?: "normal" | "subtotal" | "total" | "group";
}

export interface SampleData {
  [key: string]: unknown;
  line_items?: SampleLineItem[];
  earnings?: SampleEarningsRow[];
  deductions?: SampleEarningsRow[];
  report_rows?: SampleReportRow[];
}

const SALARY_SLIP_SAMPLE: SampleData = {
  employee_name: "Priya Sharma",
  employee_id: "EMP-042",
  department: "Engineering",
  designation: "Senior Developer",
  bank_account: "HDFC XXXX-7890",
  pay_period: "May 2026",
  working_days: "22",
  days_present: "21",
  basic_salary: "₹50,000",
  gross_salary: "₹65,000",
  net_salary: "₹57,500",
  deductions_total: "₹7,500",
  company_name: "BusAcTa LLP",
  generated_date: "May 31, 2026",
  earnings: [
    { label: "Basic Salary", amount: 50000 },
    { label: "House Rent Allowance", amount: 10000 },
    { label: "Transport Allowance", amount: 3000 },
    { label: "Special Allowance", amount: 2000 },
  ],
  deductions: [
    { label: "Provident Fund (12%)", amount: 6000 },
    { label: "Professional Tax", amount: 200 },
    { label: "TDS", amount: 1300 },
  ],
};

const FINANCIAL_REPORT_SAMPLE: SampleData = {
  report_title: "Profit & Loss Statement",
  report_period: "Jan 2026 – May 2026",
  fiscal_year: "FY 2025-26",
  company_name: "BusAcTa LLP",
  generated_date: "May 31, 2026",
  report_rows: [
    { label: "Revenue", amount: 0, style: "group" },
    { label: "Client Fees", amount: 3200000, style: "normal" },
    { label: "Retainer Income", amount: 480000, style: "normal" },
    { label: "Total Revenue", amount: 3680000, style: "subtotal" },
    { label: "Operating Expenses", amount: 0, style: "group" },
    { label: "Salaries & Wages", amount: 1800000, style: "normal" },
    { label: "Office Rent", amount: 360000, style: "normal" },
    { label: "Software & Tools", amount: 120000, style: "normal" },
    { label: "Total Expenses", amount: 2280000, style: "subtotal" },
    { label: "Net Profit", amount: 1400000, style: "total" },
  ],
};

export const SAMPLE_DATA: Record<PdfDocType, SampleData> = {
  salary_slip: SALARY_SLIP_SAMPLE,
  financial_report: FINANCIAL_REPORT_SAMPLE,
};
