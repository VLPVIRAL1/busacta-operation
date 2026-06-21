import { useMemo } from "react";
import { cn } from "@/lib/shared/utils";
import type { MatrixAnswer, MatrixConfig } from "@/lib/organizer/schemas";

interface Props {
  config: Partial<MatrixConfig> & Record<string, unknown>;
  value: unknown;
  disabled?: boolean;
  onChange: (v: MatrixAnswer) => void;
  blockId: string;
}

/**
 * Matrix / Likert grid. Rows = sub-questions, columns = scale.
 * `selection: "single"` => radio per row. `"multi"` => checkboxes per cell.
 *
 * Stored shape: { selections: { [rowId]: string | string[] } }
 */
export function MatrixField({ config, value, disabled, onChange, blockId }: Props) {
  const rows = Array.isArray(config.rows) ? (config.rows as MatrixConfig["rows"]) : [];
  const columns = Array.isArray(config.columns) ? (config.columns as MatrixConfig["columns"]) : [];
  const selection = config.selection === "multi" ? "multi" : "single";

  const current: MatrixAnswer["selections"] = useMemo(() => {
    if (value && typeof value === "object" && "selections" in value) {
      return ((value as MatrixAnswer).selections ?? {}) as MatrixAnswer["selections"];
    }
    return {};
  }, [value]);

  const setRow = (rowId: string, colValue: string) => {
    const next: MatrixAnswer["selections"] = { ...current };
    if (selection === "single") {
      next[rowId] = colValue;
    } else {
      const arr = Array.isArray(next[rowId]) ? [...(next[rowId] as string[])] : [];
      const idx = arr.indexOf(colValue);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(colValue);
      next[rowId] = arr;
    }
    onChange({ selections: next });
  };

  if (!rows.length || !columns.length) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs italic text-muted-foreground">
        Matrix needs at least one row and one column. Configure in the builder.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="w-1/3 border-b p-2 text-left font-medium text-foreground" />
            {columns.map((c) => (
              <th
                key={c.id}
                scope="col"
                className="border-b p-2 text-center font-medium text-foreground"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-muted/30">
              <th scope="row" className="border-b p-2 text-left font-normal text-foreground">
                {r.label}
              </th>
              {columns.map((c) => {
                const checked =
                  selection === "single"
                    ? current[r.id] === c.value
                    : Array.isArray(current[r.id]) && (current[r.id] as string[]).includes(c.value);
                return (
                  <td key={c.id} className={cn("border-b p-2 text-center")}>
                    <input
                      type={selection === "single" ? "radio" : "checkbox"}
                      name={`matrix-${blockId}-${r.id}`}
                      value={c.value}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => setRow(r.id, c.value)}
                      aria-label={`${r.label} → ${c.label}`}
                      className="h-4 w-4 cursor-pointer accent-primary"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
