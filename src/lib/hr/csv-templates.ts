// Client-side CSV template downloads for HR bulk imports.
// Pure browser helpers — no server / Supabase access.

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadAttendanceTemplate() {
  const headers = [
    "Employee ID",
    "Employee Name",
    "Department",
    "Designation",
    "Date",
    "Day",
    "Punch In",
    "Punch Out",
    "Total Working Hours",
    "Total Break",
    "Status",
  ];
  const sampleRows = [
    [
      "EMP-0001",
      "Ada Lovelace",
      "ops",
      "Senior Associate",
      "2025-05-01",
      "Thu",
      "09:02",
      "18:14",
      "9.20",
      "00:45",
      "Present",
    ],
    [
      "EMP-0002",
      "Charles Babbage",
      "exec",
      "Partner",
      "2025-05-01",
      "Thu",
      "10:30",
      "15:00",
      "4.50",
      "00:30",
      "Half Day",
    ],
    [
      "EMP-0003",
      "Grace Hopper",
      "finance",
      "Manager",
      "2025-05-01",
      "Thu",
      "",
      "",
      "0",
      "",
      "Absent",
    ],
  ];
  const lines = [headers, ...sampleRows].map((row) =>
    row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
  );
  downloadCsv("attendance-import-template.csv", lines.join("\n"));
}

export function downloadBulkTasksTemplate() {
  const headers = [
    "Client",
    "Title",
    "Description",
    "Assignee",
    "Reviewer",
    "Status",
    "Priority",
    "Complexity",
    "Period",
    "Tax Year",
    "Start Date",
    "Due Date",
    "Software",
  ];
  const sampleRows = [
    [
      "Acme Corp",
      "1040 Individual Return",
      "Federal individual tax filing",
      "Ada Lovelace",
      "Charles Babbage",
      "draft",
      "high",
      "a_hard",
      "Yearly",
      "2025",
      "2026-01-15",
      "2026-04-15",
      "lacerte",
    ],
    [
      "Bright LLC",
      "Quarterly Payroll Tax",
      "Q1 payroll tax filing 941",
      "Grace Hopper",
      "",
      "in_progress",
      "medium",
      "b_medium",
      "Quarterly",
      "2025",
      "2026-03-01",
      "2026-04-30",
      "ultratax",
    ],
    [
      "Cedar Inc",
      "Monthly Bookkeeping",
      "Reconcile bank and credit card statements",
      "",
      "",
      "draft",
      "low",
      "c_easy",
      "Monthly",
      "",
      "",
      "2026-06-15",
      "",
    ],
    [
      "Acme Corp",
      "S-Corp 1120S",
      "S-Corp federal return with K-1s",
      "Ada Lovelace",
      "Charles Babbage",
      "draft",
      "high",
      "a_hard",
      "Yearly",
      "2025",
      "2026-02-01",
      "2026-03-15",
      "cch_axcess",
    ],
    [
      "Delta Partners",
      "Sales Tax Filing",
      "State sales tax Q2",
      "Grace Hopper",
      "",
      "waiting_client",
      "medium",
      "c_easy",
      "Quarterly",
      "2026",
      "",
      "2026-07-31",
      "drake",
    ],
  ];
  const lines = [headers, ...sampleRows].map((row) =>
    row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
  );
  downloadCsv("bulk-tasks-sample.csv", lines.join("\n"));
}

export function downloadEmployeeTemplate() {
  const headers = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "employee_id",
    "department",
    "position",
    "position_title",
    "employment_type",
    "join_date",
    "system_role",
  ];
  const samples = [
    [
      "Ada",
      "Lovelace",
      "ada@example.com",
      "+15551234",
      "EMP-0001",
      "ops",
      "senior",
      "Senior Associate",
      "full_time",
      "2025-01-15",
      "employee",
    ],
    [
      "Charles",
      "Babbage",
      "charles@example.com",
      "+15555678",
      "EMP-0002",
      "exec",
      "partner",
      "Managing Partner",
      "full_time",
      "2024-06-01",
      "admin",
    ],
    [
      "Invalid",
      "Row",
      "not-an-email",
      "",
      "BAD ID WITH SPACES",
      "marketing",
      "",
      "",
      "casual",
      "01/01/2024",
      "ceo",
    ],
  ];
  const lines = [headers, ...samples].map((row) =>
    row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
  );
  downloadCsv("employees-import-template.csv", lines.join("\n"));
}
