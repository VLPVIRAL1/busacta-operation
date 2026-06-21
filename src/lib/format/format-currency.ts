// Lightweight currency formatters with no PDF/canvas dependencies.
// Import these instead of pulling them through pdf-export to avoid bundling
// jsPDF/jspdf-autotable on pages that only render currency strings.

export function fmtUSD(n: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    Number(n ?? 0),
  );
}

export function fmtINR(n: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(n ?? 0));
}
