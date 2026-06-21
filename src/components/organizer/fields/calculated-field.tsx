import { useEffect, useMemo, useRef } from "react";
import { create, all, type MathJsInstance } from "mathjs";
import { Calculator } from "lucide-react";
import type { CalculatedAnswer, CalculatedConfig } from "@/lib/organizer/schemas";

// Frozen-scope math evaluator: no imports, no functions, only arithmetic.
const math: MathJsInstance = create(all, {});
math.import(
  {
    // explicitly disallow any I/O / dangerous symbols by overriding with noop
    import: function () {
      throw new Error("disabled");
    },
    createUnit: function () {
      throw new Error("disabled");
    },
    evaluate: function () {
      throw new Error("disabled");
    },
    parse: function () {
      throw new Error("disabled");
    },
    simplify: function () {
      throw new Error("disabled");
    },
    derivative: function () {
      throw new Error("disabled");
    },
  },
  { override: true },
);

interface Props {
  config: Partial<CalculatedConfig> & Record<string, unknown>;
  answers: Map<string, unknown>;
  blockId: string;
  value: unknown;
  onChange: (v: CalculatedAnswer) => void;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (typeof obj.value === "number") return obj.value;
    if (typeof obj.text === "string") {
      const n = Number(obj.text);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/**
 * Read-only computed field. Formula references other blocks via `block_<id>`
 * (id-dashes stripped). Example: `block_abc + block_def * 0.1`.
 */
export function CalculatedField({ config, answers, value, onChange }: Props) {
  const formula = typeof config.formula === "string" ? config.formula : "";
  const precision = typeof config.precision === "number" ? config.precision : 2;
  const displayAs = (config.displayAs as CalculatedConfig["displayAs"]) ?? "number";

  const scope = useMemo(() => {
    const s: Record<string, number> = {};
    answers.forEach((v, id) => {
      const n = toNumber(v);
      if (n !== null) s[`block_${id.replace(/-/g, "")}`] = n;
    });
    return s;
  }, [answers]);

  const result: number | null = useMemo(() => {
    if (!formula.trim()) return null;
    try {
      const r = math.evaluate(formula, scope);
      if (typeof r === "number" && Number.isFinite(r)) {
        return Number(r.toFixed(precision));
      }
      return null;
    } catch {
      return null;
    }
  }, [formula, scope, precision]);

  // Persist whenever the computed value changes.
  const lastEmit = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (lastEmit.current === result) return;
    lastEmit.current = result;
    onChange({ value: result, formula });
  }, [result, formula, onChange]);

  const display = (() => {
    if (result === null) return "—";
    if (displayAs === "currency") return `$${result.toLocaleString()}`;
    if (displayAs === "percent") return `${result}%`;
    return result.toLocaleString();
  })();

  const valid = value && typeof value === "object" && "value" in (value as object);

  return (
    <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
      <Calculator className="h-4 w-4 text-muted-foreground" />
      <div className="flex-1">
        <div className="text-lg font-semibold tabular-nums text-foreground">{display}</div>
        {formula ? (
          <div className="text-xs text-muted-foreground">
            <span className="font-mono">{formula}</span>
            {!valid && result !== null ? " · saving…" : null}
          </div>
        ) : (
          <div className="text-xs italic text-muted-foreground">No formula configured</div>
        )}
      </div>
    </div>
  );
}
