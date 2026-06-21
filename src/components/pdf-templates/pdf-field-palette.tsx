/**
 * Left-rail field palette for the PDF Template Builder.
 * Click a tile to insert a new field into the template.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Heading2,
  Minus,
  Space,
  Image,
  Type,
  Hash,
  Table2,
  Calculator,
  PenLine,
  CreditCard,
  FileText,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/shared/utils";
import { upsertFieldFn } from "@/lib/pdf-templates/functions";
import {
  PDF_FIELD_TYPE_LABELS,
  type PdfDocType,
  type PdfFieldType,
  type PdfTemplateField,
} from "@/lib/pdf-templates/schemas";

interface PaletteItem {
  type: PdfFieldType;
  icon: LucideIcon;
  group: string;
}

const GROUP_STYLE: Record<string, { dot: string; label: string }> = {
  Structure: { dot: "bg-violet-400", label: "text-violet-600 dark:text-violet-400" },
  Branding: { dot: "bg-blue-400", label: "text-blue-600 dark:text-blue-400" },
  Data: { dot: "bg-emerald-400", label: "text-emerald-600 dark:text-emerald-400" },
  Tables: { dot: "bg-amber-400", label: "text-amber-600 dark:text-amber-400" },
  Legal: { dot: "bg-rose-400", label: "text-rose-600 dark:text-rose-400" },
};

const PALETTE: PaletteItem[] = [
  { type: "section", icon: Heading2, group: "Structure" },
  { type: "divider", icon: Minus, group: "Structure" },
  { type: "spacer", icon: Space, group: "Structure" },
  { type: "logo", icon: Image, group: "Branding" },
  { type: "static_text", icon: Type, group: "Branding" },
  { type: "placeholder", icon: Hash, group: "Data" },
  { type: "notes_block", icon: FileText, group: "Data" },
  { type: "line_items_table", icon: Table2, group: "Tables" },
  { type: "totals_block", icon: Calculator, group: "Tables" },
  { type: "earnings_deductions_table", icon: BarChart3, group: "Tables" },
  { type: "report_table", icon: BarChart3, group: "Tables" },
  { type: "signature_block", icon: PenLine, group: "Legal" },
  { type: "payment_details", icon: CreditCard, group: "Legal" },
];

const DEFAULT_CONFIGS: Partial<Record<PdfFieldType, Record<string, unknown>>> = {
  section: { columns: 1 },
  static_text: { content: "Enter text here", font_size: 10 },
  placeholder: { token: "{{client_name}}", font_size: 10 },
  spacer: { height: 16 },
  logo: { width: 80, alignment: "left" },
  line_items_table: { show_index: true, show_quantity: true, show_rate: true },
  totals_block: {
    show_subtotal: true,
    show_tax: true,
    show_total: true,
    show_amount_paid: true,
    show_balance_due: true,
  },
  earnings_deductions_table: {},
  report_table: {},
  signature_block: { show_date_line: true },
  notes_block: { label: "Notes", content: "" },
};

const DEFAULT_LABELS: Partial<Record<PdfFieldType, string>> = {
  section: "New Section",
  logo: "Company Logo",
  static_text: "Heading",
  placeholder: "Data Field",
  line_items_table: "Line Items",
  totals_block: "Totals",
  earnings_deductions_table: "Earnings & Deductions",
  report_table: "Report Data",
  signature_block: "Signature",
  payment_details: "Payment Instructions",
  notes_block: "Notes",
};

interface Props {
  templateId: string;
  selectedFieldId: string | null;
  fields: PdfTemplateField[];
  docType: PdfDocType;
  onInserted: (fieldId: string) => void;
}

export function PdfFieldPalette({
  templateId,
  selectedFieldId,
  fields,
  docType,
  onInserted,
}: Props) {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertFieldFn);

  const insertMut = useMutation({
    mutationFn: async (type: PdfFieldType) => {
      // Determine parent: if a section is selected, insert as child; else top-level
      const selected = fields.find((f) => f.id === selectedFieldId);
      const parentId =
        selected?.field_type === "section" ? selected.id : (selected?.parent_id ?? null);

      // Hide table types that don't match doc type
      if (type === "earnings_deductions_table" && docType !== "salary_slip") return null;
      if (type === "report_table" && docType !== "financial_report") return null;
      if (type === "line_items_table") return null;
      if (type === "totals_block") return null;

      const result = await upsert({
        data: {
          template_id: templateId,
          parent_id: parentId,
          field_type: type,
          label: DEFAULT_LABELS[type] ?? PDF_FIELD_TYPE_LABELS[type],
          config_json: DEFAULT_CONFIGS[type] ?? {},
        },
      });
      const { field } = result as { field: import("@/lib/pdf-templates/schemas").PdfTemplateField };
      return field;
    },
    onSuccess: (field) => {
      if (!field) return;
      qc.invalidateQueries({ queryKey: ["pdf-templates", "detail", templateId] });
      onInserted(field.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groups = [...new Set(PALETTE.map((p) => p.group))];

  return (
    <ScrollArea className="h-full">
      <div className="p-2 space-y-4">
        {groups.map((group) => {
          const items = PALETTE.filter((p) => p.group === group);
          const gs = GROUP_STYLE[group] ?? { dot: "bg-slate-400", label: "text-slate-600" };

          return (
            <div key={group}>
              <div className={cn("flex items-center gap-1.5 mb-1.5 px-1")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", gs.dot)} />
                <span
                  className={cn("text-[10px] font-semibold uppercase tracking-wider", gs.label)}
                >
                  {group}
                </span>
              </div>
              <div className="space-y-0.5">
                {items.map(({ type, icon: Icon }) => {
                  const isDisabled = insertMut.isPending;
                  return (
                    <button
                      key={type}
                      disabled={isDisabled}
                      onClick={() => insertMut.mutate(type)}
                      className={cn(
                        "w-full flex items-center gap-2 rounded px-2 py-1.5 text-xs text-left",
                        "hover:bg-accent hover:text-accent-foreground transition-colors",
                        "disabled:opacity-40 disabled:cursor-not-allowed",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      <span className="truncate">{PDF_FIELD_TYPE_LABELS[type]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
