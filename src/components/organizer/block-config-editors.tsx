/**
 * Structured per-block-type configuration editors used by the Builder Inspector.
 * Each editor receives the block's `config_json` and an `onCommit` callback that
 * persists the updated config via `upsertBlock`.
 */
import { useMemo, useState } from "react";
import { GripVertical, Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { create, all } from "mathjs";

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

import type {
  JsonObject,
  MatrixConfig,
  SignatureConfig,
  MultiFileConfig,
  CalculatedConfig,
} from "@/lib/organizer/schemas";

type CommitFn = (patch: JsonObject) => void;

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

// ============================================================
// MATRIX
// ============================================================

interface MatrixRowCol {
  id: string;
  label: string;
  value?: string;
}

export function MatrixConfigEditor({
  config,
  onCommit,
}: {
  config: JsonObject;
  onCommit: CommitFn;
}) {
  const rows: MatrixRowCol[] = Array.isArray(config.rows)
    ? (config.rows as unknown as MatrixRowCol[])
    : typeof config.rows === "string"
      ? (config.rows as string)
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((label) => ({ id: uid(), label }))
      : [];
  const columns: MatrixRowCol[] = Array.isArray(config.columns)
    ? (config.columns as unknown as MatrixRowCol[])
    : typeof config.columns === "string"
      ? (config.columns as string)
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((label) => ({ id: uid(), label, value: slug(label) }))
      : [];
  const selection: MatrixConfig["selection"] = config.selection === "multi" ? "multi" : "single";

  const update = (patch: {
    rows?: MatrixRowCol[];
    columns?: MatrixRowCol[];
    selection?: MatrixConfig["selection"];
  }) => {
    onCommit({
      ...config,
      rows: (patch.rows ?? rows) as unknown as JsonObject[],
      columns: (patch.columns ?? columns) as unknown as JsonObject[],
      selection: patch.selection ?? selection,
    } as unknown as JsonObject);
  };

  const addRow = () => update({ rows: [...rows, { id: uid(), label: `Row ${rows.length + 1}` }] });
  const addCol = () =>
    update({
      columns: [
        ...columns,
        { id: uid(), label: `Option ${columns.length + 1}`, value: `opt_${columns.length + 1}` },
      ],
    });

  return (
    <div className="space-y-4">
      <div>
        <Label>Selection mode</Label>
        <Select
          value={selection}
          onValueChange={(v) => update({ selection: v as MatrixConfig["selection"] })}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single choice per row (radio)</SelectItem>
            <SelectItem value="multi">Multiple per row (checkbox)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Rows</Label>
          <Button type="button" size="sm" variant="ghost" onClick={addRow}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add row
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">No rows yet.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={r.id} className="flex items-center gap-1.5">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={r.label}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...r, label: e.target.value };
                    update({ rows: next });
                  }}
                  className="h-8"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => update({ rows: rows.filter((x) => x.id !== r.id) })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Columns (scale)</Label>
          <Button type="button" size="sm" variant="ghost" onClick={addCol}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add column
          </Button>
        </div>
        {columns.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">No columns yet.</p>
        ) : (
          <div className="space-y-1.5">
            {columns.map((c, i) => (
              <div key={c.id} className="flex items-center gap-1.5">
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={c.label}
                  onChange={(e) => {
                    const next = [...columns];
                    next[i] = {
                      ...c,
                      label: e.target.value,
                      value: c.value ?? slug(e.target.value),
                    };
                    update({ columns: next });
                  }}
                  className="h-8"
                  placeholder="Label"
                />
                <Input
                  value={c.value ?? ""}
                  onChange={(e) => {
                    const next = [...columns];
                    next[i] = { ...c, value: slug(e.target.value) };
                    update({ columns: next });
                  }}
                  className="h-8 w-28"
                  placeholder="value"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => update({ columns: columns.filter((x) => x.id !== c.id) })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SIGNATURE
// ============================================================

export function SignatureConfigEditor({
  config,
  onCommit,
}: {
  config: JsonObject;
  onCommit: CommitFn;
}) {
  const c: SignatureConfig = {
    allowDrawn: config.allowDrawn !== false,
    allowTyped: config.allowTyped !== false,
    requireFullName: config.requireFullName === true,
  };
  const set = (patch: Partial<SignatureConfig>) =>
    onCommit({ ...config, ...c, ...patch } as unknown as JsonObject);

  return (
    <div className="space-y-3">
      <ToggleRow
        label="Allow drawn signature"
        description="Respondent draws on canvas; stored as PNG"
        checked={c.allowDrawn}
        onChange={(v) => set({ allowDrawn: v })}
      />
      <ToggleRow
        label="Allow typed signature"
        description="Respondent types their full legal name"
        checked={c.allowTyped}
        onChange={(v) => set({ allowTyped: v })}
      />
      <ToggleRow
        label="Require full legal name"
        description="Reject short / single-word inputs"
        checked={c.requireFullName}
        onChange={(v) => set({ requireFullName: v })}
      />
      {!c.allowDrawn && !c.allowTyped ? (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          At least one signature mode must be enabled.
        </p>
      ) : null}
    </div>
  );
}

// ============================================================
// MULTI-FILE
// ============================================================

export function MultiFileConfigEditor({
  config,
  onCommit,
}: {
  config: JsonObject;
  onCommit: CommitFn;
}) {
  const c: MultiFileConfig = {
    maxFiles: typeof config.maxFiles === "number" ? config.maxFiles : 10,
    minFiles: typeof config.minFiles === "number" ? config.minFiles : 0,
    maxSizeMb: typeof config.maxSizeMb === "number" ? config.maxSizeMb : 25,
    acceptedMime: Array.isArray(config.acceptedMime) ? (config.acceptedMime as string[]) : [],
  };
  const set = (patch: Partial<MultiFileConfig>) =>
    onCommit({ ...config, ...c, ...patch } as unknown as JsonObject);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label className="text-xs">Min files</Label>
          <Input
            type="number"
            min={0}
            value={c.minFiles}
            onChange={(e) => set({ minFiles: Math.max(0, Number(e.target.value) || 0) })}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-xs">Max files</Label>
          <Input
            type="number"
            min={1}
            value={c.maxFiles}
            onChange={(e) => set({ maxFiles: Math.max(1, Number(e.target.value) || 1) })}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-xs">Max size (MB)</Label>
          <Input
            type="number"
            min={1}
            value={c.maxSizeMb}
            onChange={(e) => set({ maxSizeMb: Math.max(1, Number(e.target.value) || 1) })}
            className="h-8"
          />
        </div>
      </div>
      <div>
        <Label className="text-xs">Accepted MIME types (comma separated)</Label>
        <Input
          value={c.acceptedMime.join(", ")}
          onChange={(e) =>
            set({
              acceptedMime: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="image/*, application/pdf"
          className="h-8 font-mono text-xs"
        />
        <p className="mt-1 text-xs text-muted-foreground">Leave blank to accept any file type.</p>
      </div>
    </div>
  );
}

// ============================================================
// CALCULATED
// ============================================================

const mathInstance = create(all, {});

export function CalculatedConfigEditor({
  config,
  candidateBlocks,
  onCommit,
}: {
  config: JsonObject;
  candidateBlocks: Array<{ id: string; label: string }>;
  onCommit: CommitFn;
}) {
  const c: CalculatedConfig = {
    formula: typeof config.formula === "string" ? config.formula : "",
    precision: typeof config.precision === "number" ? config.precision : 2,
    displayAs: (config.displayAs as CalculatedConfig["displayAs"]) ?? "number",
  };
  const [draft, setDraft] = useState(c.formula);
  const set = (patch: Partial<CalculatedConfig>) =>
    onCommit({ ...config, ...c, ...patch } as unknown as JsonObject);

  const variables = useMemo(
    () =>
      candidateBlocks.map((b) => ({
        token: `block_${b.id.replace(/-/g, "")}`,
        label: b.label,
      })),
    [candidateBlocks],
  );

  // Live validation: try compile against a scope of zeros.
  const validation = useMemo(() => {
    if (!draft.trim()) return { ok: true as const, msg: "" };
    try {
      const scope: Record<string, number> = {};
      variables.forEach((v) => {
        scope[v.token] = 1;
      });
      const r = mathInstance.evaluate(draft, scope);
      if (typeof r !== "number" || !Number.isFinite(r)) {
        return { ok: false as const, msg: "Result is not a finite number" };
      }
      return { ok: true as const, msg: "Formula is valid" };
    } catch (e) {
      return { ok: false as const, msg: (e as Error).message };
    }
  }, [draft, variables]);

  return (
    <div className="space-y-3">
      <div>
        <Label>Formula</Label>
        <Textarea
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => set({ formula: draft })}
          placeholder="block_abc + block_def * 0.1"
          className="font-mono text-xs"
        />
        <p
          className={cn(
            "mt-1 flex items-center gap-1 text-xs",
            validation.ok ? "text-emerald-600" : "text-destructive",
          )}
        >
          {validation.ok ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : (
            <AlertCircle className="h-3 w-3" />
          )}
          {validation.msg || "Empty formula — field will display nothing."}
        </p>
      </div>

      {variables.length > 0 && (
        <div>
          <Label className="text-xs">Available variables</Label>
          <div className="mt-1 flex flex-wrap gap-1">
            {variables.map((v) => (
              <button
                key={v.token}
                type="button"
                onClick={() => {
                  const next = draft ? `${draft} ${v.token}` : v.token;
                  setDraft(next);
                  set({ formula: next });
                }}
                className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted"
                title={v.label}
              >
                {v.token}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Precision (decimals)</Label>
          <Input
            type="number"
            min={0}
            max={8}
            value={c.precision}
            onChange={(e) =>
              set({ precision: Math.max(0, Math.min(8, Number(e.target.value) || 0)) })
            }
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-xs">Display as</Label>
          <Select
            value={c.displayAs}
            onValueChange={(v) => set({ displayAs: v as CalculatedConfig["displayAs"] })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="currency">Currency</SelectItem>
              <SelectItem value="percent">Percent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Shared toggle row
// ============================================================

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-0.5">
        <Label className="text-sm">{label}</Label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
