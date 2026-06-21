/**
 * Inline config editor for each PDF field type.
 * Rendered inside the inspector's collapsible card per field.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Trash2, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/shared/utils";
import { deleteFieldFn, upsertFieldFn } from "@/lib/pdf-templates/functions";
import {
  PDF_FIELD_TYPE_LABELS,
  type PdfDocType,
  type PdfFieldType,
  type PdfTemplateField,
} from "@/lib/pdf-templates/schemas";
import { getPdfPlaceholders } from "@/lib/pdf-templates/placeholders";

const FIELD_COLOR: Partial<Record<PdfFieldType, string>> = {
  section: "border-l-violet-400",
  logo: "border-l-blue-400",
  static_text: "border-l-blue-400",
  placeholder: "border-l-emerald-400",
  divider: "border-l-slate-300",
  spacer: "border-l-slate-300",
  line_items_table: "border-l-amber-400",
  totals_block: "border-l-amber-400",
  earnings_deductions_table: "border-l-amber-400",
  report_table: "border-l-amber-400",
  signature_block: "border-l-rose-400",
  payment_details: "border-l-rose-400",
  notes_block: "border-l-emerald-400",
};

interface Props {
  field: PdfTemplateField;
  templateId: string;
  docType: PdfDocType;
  isSelected: boolean;
  onSelect: () => void;
}

export function PdfFieldEditorCard({ field, templateId, docType, isSelected, onSelect }: Props) {
  const [expanded, setExpanded] = useState(isSelected);
  const qc = useQueryClient();

  const upsert = useServerFn(upsertFieldFn);
  const deleteFn = useServerFn(deleteFieldFn);

  const saveMut = useMutation({
    mutationFn: async (
      patch: Partial<PdfTemplateField> & { config_json?: Record<string, unknown> },
    ) => {
      await upsert({
        data: { id: field.id, template_id: templateId, field_type: field.field_type, ...patch },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pdf-templates", "detail", templateId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      await deleteFn({ data: { id: field.id } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pdf-templates", "detail", templateId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const cfg = field.config_json as Record<string, unknown>;

  function updateCfg(updates: Record<string, unknown>) {
    saveMut.mutate({ config_json: { ...cfg, ...updates } });
  }

  const borderClass = FIELD_COLOR[field.field_type] ?? "border-l-slate-300";

  return (
    <div
      className={cn(
        "border-l-2 rounded-sm bg-card border border-border/50 overflow-hidden",
        borderClass,
        isSelected && "ring-1 ring-primary/30",
      )}
      onClick={onSelect}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
          setExpanded((v) => !v);
        }}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="flex-1 text-xs font-medium truncate">
          {field.label ?? PDF_FIELD_TYPE_LABELS[field.field_type]}
        </span>
        <span className="text-[10px] text-muted-foreground mr-1">
          {PDF_FIELD_TYPE_LABELS[field.field_type]}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 opacity-50 hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            saveMut.mutate({ is_visible: !field.is_visible });
          }}
        >
          {field.is_visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-destructive/60 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            deleteMut.mutate();
          }}
          disabled={deleteMut.isPending}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Config body */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/30 pt-2">
          {/* Label (shown for most types) */}
          {field.field_type !== "divider" && field.field_type !== "spacer" && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Label (in builder only)</Label>
              <Input
                className="h-7 text-xs"
                defaultValue={field.label ?? ""}
                onBlur={(e) => saveMut.mutate({ label: e.target.value || null })}
              />
            </div>
          )}

          <FieldTypeConfig field={field} cfg={cfg} docType={docType} updateCfg={updateCfg} />
        </div>
      )}
    </div>
  );
}

// ─── Type-specific config forms ───────────────────────────────────────────────

function FieldTypeConfig({
  field,
  cfg,
  docType,
  updateCfg,
}: {
  field: PdfTemplateField;
  cfg: Record<string, unknown>;
  docType: PdfDocType;
  updateCfg: (u: Record<string, unknown>) => void;
}) {
  switch (field.field_type) {
    case "section":
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Columns</Label>
            <Select
              value={String(cfg.columns ?? 1)}
              onValueChange={(v) => updateCfg({ columns: Number(v) })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1" className="text-xs">
                  1 column
                </SelectItem>
                <SelectItem value="2" className="text-xs">
                  2 columns
                </SelectItem>
                <SelectItem value="3" className="text-xs">
                  3 columns
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case "static_text":
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Content</Label>
            <Textarea
              className="text-xs min-h-[60px]"
              defaultValue={String(cfg.content ?? "")}
              onBlur={(e) => updateCfg({ content: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Font size</Label>
              <Input
                type="number"
                className="h-7 text-xs"
                defaultValue={Number(cfg.font_size ?? 10)}
                onBlur={(e) => updateCfg({ font_size: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Color</Label>
              <Input
                type="color"
                className="h-7 p-0.5"
                defaultValue={String(cfg.color ?? "#334155")}
                onChange={(e) => updateCfg({ color: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2">
              <Switch
                id={`bold-${field.id}`}
                checked={!!cfg.bold}
                onCheckedChange={(v) => updateCfg({ bold: v })}
              />
              <Label htmlFor={`bold-${field.id}`} className="text-[10px]">
                Bold
              </Label>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Align</Label>
              <Select
                value={String(cfg.alignment ?? "left")}
                onValueChange={(v) => updateCfg({ alignment: v })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left" className="text-xs">
                    Left
                  </SelectItem>
                  <SelectItem value="center" className="text-xs">
                    Center
                  </SelectItem>
                  <SelectItem value="right" className="text-xs">
                    Right
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );

    case "placeholder":
      return (
        <PlaceholderConfig cfg={cfg} docType={docType} updateCfg={updateCfg} fieldId={field.id} />
      );

    case "spacer":
      return (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Height (pt)</Label>
          <Input
            type="number"
            className="h-7 text-xs"
            defaultValue={Number(cfg.height ?? 16)}
            onBlur={(e) => updateCfg({ height: Number(e.target.value) })}
          />
        </div>
      );

    case "logo":
      return (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Width (pt)</Label>
            <Input
              type="number"
              className="h-7 text-xs"
              defaultValue={Number(cfg.width ?? 80)}
              onBlur={(e) => updateCfg({ width: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Align</Label>
            <Select
              value={String(cfg.alignment ?? "left")}
              onValueChange={(v) => updateCfg({ alignment: v })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left" className="text-xs">
                  Left
                </SelectItem>
                <SelectItem value="center" className="text-xs">
                  Center
                </SelectItem>
                <SelectItem value="right" className="text-xs">
                  Right
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case "line_items_table":
      return (
        <div className="space-y-2">
          {(["show_index", "show_quantity", "show_rate"] as const).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <Switch
                id={`${key}-${field.id}`}
                checked={cfg[key] !== false}
                onCheckedChange={(v) => updateCfg({ [key]: v })}
              />
              <Label htmlFor={`${key}-${field.id}`} className="text-[10px] capitalize">
                {key.replace("show_", "Show ").replace("_", " ")}
              </Label>
            </div>
          ))}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Header color</Label>
            <Input
              type="color"
              className="h-7 p-0.5"
              defaultValue={String(cfg.header_color ?? "#1e3a8a")}
              onChange={(e) => updateCfg({ header_color: e.target.value })}
            />
          </div>
        </div>
      );

    case "totals_block":
      return (
        <div className="space-y-2">
          {(
            [
              "show_subtotal",
              "show_tax",
              "show_total",
              "show_amount_paid",
              "show_balance_due",
            ] as const
          ).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <Switch
                id={`${key}-${field.id}`}
                checked={cfg[key] !== false}
                onCheckedChange={(v) => updateCfg({ [key]: v })}
              />
              <Label htmlFor={`${key}-${field.id}`} className="text-[10px]">
                {key.replace("show_", "Show ").replace(/_/g, " ")}
              </Label>
            </div>
          ))}
        </div>
      );

    case "signature_block":
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Signatory name</Label>
            <Input
              className="h-7 text-xs"
              defaultValue={String(cfg.signatory_name ?? "")}
              placeholder="Authorised Signatory"
              onBlur={(e) => updateCfg({ signatory_name: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Title / designation</Label>
            <Input
              className="h-7 text-xs"
              defaultValue={String(cfg.signatory_title ?? "")}
              placeholder="Director"
              onBlur={(e) => updateCfg({ signatory_title: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={`date-${field.id}`}
              checked={cfg.show_date_line !== false}
              onCheckedChange={(v) => updateCfg({ show_date_line: v })}
            />
            <Label htmlFor={`date-${field.id}`} className="text-[10px]">
              Show date line
            </Label>
          </div>
        </div>
      );

    case "notes_block":
      return (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Section label</Label>
            <Input
              className="h-7 text-xs"
              defaultValue={String(cfg.label ?? "Notes")}
              onBlur={(e) => updateCfg({ label: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              Default content (supports <code>{"{{placeholders}}"}</code>)
            </Label>
            <Textarea
              className="text-xs min-h-[60px]"
              defaultValue={String(cfg.content ?? "")}
              onBlur={(e) => updateCfg({ content: e.target.value })}
            />
          </div>
        </div>
      );

    default:
      return (
        <p className="text-[10px] text-muted-foreground italic">
          No additional configuration for this field type.
        </p>
      );
  }
}

function PlaceholderConfig({
  cfg,
  docType,
  updateCfg,
  fieldId,
}: {
  cfg: Record<string, unknown>;
  docType: PdfDocType;
  updateCfg: (u: Record<string, unknown>) => void;
  fieldId: string;
}) {
  const placeholders = getPdfPlaceholders(docType);
  const groups = [...new Set(placeholders.map((p) => p.group))];

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Data token</Label>
        <Select value={String(cfg.token ?? "")} onValueChange={(v) => updateCfg({ token: v })}>
          <SelectTrigger className="h-7 text-xs font-mono">
            <SelectValue placeholder="Select token…" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <div key={group}>
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {group}
                </div>
                {placeholders
                  .filter((p) => p.group === group)
                  .map((p) => (
                    <SelectItem key={p.key} value={p.token} className="text-xs font-mono">
                      {p.token}
                      <span className="ml-2 font-sans text-muted-foreground">{p.label}</span>
                    </SelectItem>
                  ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Fallback text</Label>
        <Input
          className="h-7 text-xs"
          defaultValue={String(cfg.fallback ?? "")}
          placeholder="Shown if value is missing"
          onBlur={(e) => updateCfg({ fallback: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Font size</Label>
          <Input
            type="number"
            className="h-7 text-xs"
            defaultValue={Number(cfg.font_size ?? 10)}
            onBlur={(e) => updateCfg({ font_size: Number(e.target.value) })}
          />
        </div>
        <div className="flex items-center gap-2 pt-4">
          <Switch
            id={`ph-bold-${fieldId}`}
            checked={!!cfg.bold}
            onCheckedChange={(v) => updateCfg({ bold: v })}
          />
          <Label htmlFor={`ph-bold-${fieldId}`} className="text-[10px]">
            Bold
          </Label>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Prefix</Label>
          <Input
            className="h-7 text-xs"
            defaultValue={String(cfg.prefix ?? "")}
            onBlur={(e) => updateCfg({ prefix: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Suffix</Label>
          <Input
            className="h-7 text-xs"
            defaultValue={String(cfg.suffix ?? "")}
            onBlur={(e) => updateCfg({ suffix: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
