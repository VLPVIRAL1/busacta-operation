import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface TableColumn {
  id: string;
  label: string;
  type: "short_text" | "number" | "currency" | "single_choice" | "date" | "yes_no";
  options?: Array<{ id: string; label: string }>;
}

interface TableValue {
  rows?: Array<Record<string, unknown>>;
}

/**
 * Dynamic-row table field for `table` blocks.
 * Value shape: { rows: [{ <columnId>: <primitive>, ... }, ...] }
 */
export function WizardTableField({
  value,
  disabled,
  onChange,
  config,
}: {
  value: unknown;
  disabled?: boolean;
  onChange: (v: TableValue) => void;
  config: Record<string, unknown>;
}) {
  const cols: TableColumn[] = Array.isArray(config.columns)
    ? (config.columns as TableColumn[])
    : [];
  const minRows = typeof config.minRows === "number" ? config.minRows : 0;
  const maxRows = typeof config.maxRows === "number" ? config.maxRows : 50;

  const rows: Array<Record<string, unknown>> = Array.isArray(
    (value as TableValue | undefined)?.rows,
  )
    ? ((value as TableValue).rows as Array<Record<string, unknown>>)
    : [];

  const addRow = () => {
    if (rows.length >= maxRows) return;
    onChange({ rows: [...rows, {}] });
  };
  const removeRow = (idx: number) => {
    if (rows.length <= minRows) return;
    onChange({ rows: rows.filter((_, i) => i !== idx) });
  };
  const setCell = (idx: number, colId: string, v: unknown) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, [colId]: v } : r));
    onChange({ rows: next });
  };

  if (cols.length === 0) {
    return (
      <p className="text-xs italic text-muted-foreground">This table has no columns configured.</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-muted-foreground">
              {cols.map((c) => (
                <th key={c.id} className="text-left px-2 py-1 border-b font-medium">
                  {c.label}
                </th>
              ))}
              {!disabled && <th className="w-8 border-b"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={cols.length + 1}
                  className="px-2 py-3 text-center text-muted-foreground italic"
                >
                  No rows yet.
                </td>
              </tr>
            )}
            {rows.map((row, idx) => (
              <tr key={idx} className="border-b last:border-0">
                {cols.map((c) => (
                  <td key={c.id} className="px-1 py-1 align-top">
                    <Cell
                      col={c}
                      value={row[c.id]}
                      disabled={disabled}
                      onChange={(v) => setCell(idx, c.id, v)}
                    />
                  </td>
                ))}
                {!disabled && (
                  <td className="px-1 py-1 align-top">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => removeRow(idx)}
                      disabled={rows.length <= minRows}
                      title="Remove row"
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && rows.length < maxRows && (
        <Button type="button" size="sm" variant="outline" onClick={addRow} className="text-xs">
          <Plus className="h-3 w-3 mr-1" /> Add row
        </Button>
      )}
    </div>
  );
}

function Cell({
  col,
  value,
  disabled,
  onChange,
}: {
  col: TableColumn;
  value: unknown;
  disabled?: boolean;
  onChange: (v: unknown) => void;
}) {
  const v = value;
  if (col.type === "yes_no") {
    return (
      <Select
        value={v === true ? "yes" : v === false ? "no" : ""}
        onValueChange={(x) => onChange(x === "yes")}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
    );
  }
  if (col.type === "single_choice") {
    return (
      <Select value={(v as string) ?? ""} onValueChange={(x) => onChange(x)} disabled={disabled}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          {(col.options ?? []).map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  const inputType =
    col.type === "number" || col.type === "currency"
      ? "number"
      : col.type === "date"
        ? "date"
        : "text";
  return (
    <Input
      className="h-8 text-xs"
      type={inputType}
      value={v === undefined || v === null ? "" : String(v)}
      disabled={disabled}
      onChange={(e) =>
        onChange(
          col.type === "number" || col.type === "currency"
            ? e.target.value === ""
              ? null
              : Number(e.target.value)
            : e.target.value,
        )
      }
    />
  );
}
