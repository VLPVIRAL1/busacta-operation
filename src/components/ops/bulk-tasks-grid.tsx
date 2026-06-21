/**
 * Pure editable grid for Bulk Import Tasks.
 * File import and paste handling live in the parent route — this component
 * is only responsible for displaying and editing the row array.
 *
 * 13 columns covering every task field. Client + # columns are sticky left.
 * Assignee/reviewer cells show a resolution dot (green = found, amber = unknown).
 */
import { useCallback, useMemo } from "react";
import { Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/shared/utils";
import type { ProfileLite } from "@/lib/queries/ops.queries";
import { type BulkRow, emptyRow, isRowValid, buildProfileMap } from "@/lib/ops/bulk-import-mapper";

// ── Re-exports consumed by the route page ────────────────────────────
export type { BulkRow };
export { isRowValid, emptyRow };

// ── Props ─────────────────────────────────────────────────────────────

export interface BulkTasksGridProps {
  rows: BulkRow[];
  onChange: (rows: BulkRow[]) => void;
  disabled?: boolean;
  /** Employee profiles used to resolve assignee/reviewer names → IDs. */
  profiles: ProfileLite[];
  /** Client names from the selected firm — powers the client autocomplete datalist. */
  clientNames?: string[];
}

// ── Select option constants ───────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In Progress" },
  { value: "review", label: "Review" },
  { value: "waiting_client", label: "Waiting" },
  { value: "complete", label: "Complete" },
] as const;

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
] as const;

const COMPLEXITY_OPTIONS = [
  { value: "a_hard", label: "A — Hard" },
  { value: "b_medium", label: "B — Medium" },
  { value: "c_easy", label: "C — Easy" },
] as const;

const PERIOD_OPTIONS = [
  { value: "__none__", label: "—" },
  { value: "Monthly", label: "Monthly" },
  { value: "Quarterly", label: "Quarterly" },
  { value: "Yearly", label: "Yearly" },
  { value: "Ad-hoc", label: "Ad-hoc" },
] as const;

const SOFTWARE_OPTIONS = [
  { value: "__none__", label: "—" },
  { value: "lacerte", label: "Lacerte" },
  { value: "drake", label: "Drake" },
  { value: "cch_axcess", label: "CCH Axcess" },
  { value: "ultratax", label: "UltraTax" },
  { value: "proconnect", label: "ProConnect" },
  { value: "other", label: "Other" },
] as const;

// ── Extracted sub-components ─────────────────────────────────────────

function PersonCell({
  value,
  field,
  role,
  profileMap,
  onUpdate,
  disabled,
}: {
  value: string;
  field: "assigneeName" | "reviewerName";
  role: string;
  profileMap: Map<string, string>;
  onUpdate: (patch: Partial<BulkRow>) => void;
  disabled?: boolean;
}) {
  const key = value.trim().toLowerCase();
  const resolved = key ? profileMap.has(key) : null;

  return (
    <TableCell className="py-1 min-w-[160px]">
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <Input
                value={value}
                onChange={(e) => onUpdate({ [field]: e.target.value })}
                placeholder="Name or email"
                className="h-7 text-xs flex-1 min-w-0"
                disabled={disabled}
              />
              {resolved !== null && (
                <span
                  className={cn(
                    "h-2 w-2 rounded-full shrink-0",
                    resolved ? "bg-emerald-500" : "bg-amber-400",
                  )}
                />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {resolved === true && "Staff resolved ✓"}
            {resolved === false && `No match — task saves without ${role}`}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </TableCell>
  );
}

function GridSelect({
  value,
  options,
  onValueChange,
  disabled,
}: {
  value: string;
  options: readonly { readonly value: string; readonly label: string }[];
  onValueChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className="h-7 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Component ─────────────────────────────────────────────────────────

export function BulkTasksGrid({
  rows,
  onChange,
  disabled,
  profiles,
  clientNames,
}: BulkTasksGridProps) {
  // Build name/email → id map for inline resolution indicators
  const profileMap = useMemo(() => buildProfileMap(profiles), [profiles]);

  const updateRow = useCallback(
    (index: number, patch: Partial<BulkRow>) => {
      const next = [...rows];
      next[index] = { ...next[index], ...patch };
      onChange(next);
    },
    [rows, onChange],
  );

  const removeRow = useCallback(
    (index: number) => {
      onChange(rows.filter((_, i) => i !== index));
    },
    [rows, onChange],
  );

  const addRow = useCallback(() => {
    onChange([...rows, emptyRow()]);
  }, [rows, onChange]);

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-6">
        <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={disabled}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add row manually
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Client name datalist for autocomplete when a firm is selected */}
      {clientNames && clientNames.length > 0 && (
        <datalist id="bulk-client-names">
          {clientNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      )}
      {/* Table — wrapped in Card to match app data-table pattern */}
      <Card>
        <CardContent className="p-0 max-h-[60vh] overflow-auto">
          <Table className="text-xs" style={{ tableLayout: "auto" }}>
            <TableHeader className="bg-muted/60 sticky top-0 z-10">
              <TableRow>
                <TableHead className="h-8 w-9 text-center text-[10px] uppercase sticky left-0 z-20 bg-muted/60 border-r">
                  #
                </TableHead>
                <TableHead className="h-8 text-[10px] uppercase sticky left-9 z-20 bg-muted/60 border-r min-w-[160px]">
                  Client <span className="text-destructive">*</span>
                </TableHead>
                <TableHead className="h-8 text-[10px] uppercase min-w-[200px]">
                  Title <span className="text-destructive">*</span>
                </TableHead>
                <TableHead className="h-8 text-[10px] uppercase min-w-[200px]">
                  Description
                </TableHead>
                <TableHead className="h-8 text-[10px] uppercase min-w-[160px]">Assignee</TableHead>
                <TableHead className="h-8 text-[10px] uppercase min-w-[160px]">Reviewer</TableHead>
                <TableHead className="h-8 text-[10px] uppercase min-w-[130px]">Status</TableHead>
                <TableHead className="h-8 text-[10px] uppercase min-w-[100px]">Priority</TableHead>
                <TableHead className="h-8 text-[10px] uppercase min-w-[120px]">
                  Complexity
                </TableHead>
                <TableHead className="h-8 text-[10px] uppercase min-w-[110px]">Period</TableHead>
                <TableHead className="h-8 text-[10px] uppercase min-w-[90px]">Tax Year</TableHead>
                <TableHead className="h-8 text-[10px] uppercase min-w-[130px]">
                  Start Date
                </TableHead>
                <TableHead className="h-8 text-[10px] uppercase min-w-[130px]">Due Date</TableHead>
                <TableHead className="h-8 text-[10px] uppercase min-w-[120px]">Software</TableHead>
                <TableHead className="h-8 w-9" />
                <TableHead className="h-8 w-9" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => {
                const valid = isRowValid(row);
                const hasIssues = !valid && (!!row.clientName || !!row.title);

                return (
                  <TableRow
                    key={row._key}
                    className={cn("h-9 border-t", hasIssues && "bg-destructive/5")}
                  >
                    {/* # — sticky */}
                    <TableCell className="py-1 text-center text-muted-foreground w-9 sticky left-0 z-10 bg-background border-r">
                      {idx + 1}
                    </TableCell>

                    {/* Client — sticky */}
                    <TableCell className="py-1 sticky left-9 z-10 bg-background border-r min-w-[160px]">
                      <Input
                        value={row.clientName}
                        onChange={(e) => updateRow(idx, { clientName: e.target.value })}
                        placeholder="Client name"
                        list={
                          clientNames && clientNames.length > 0 ? "bulk-client-names" : undefined
                        }
                        className={cn(
                          "h-7 text-xs",
                          !row.clientName.trim() && "border-destructive/50",
                        )}
                        disabled={disabled}
                      />
                    </TableCell>

                    {/* Title */}
                    <TableCell className="py-1 min-w-[200px]">
                      <Input
                        value={row.title}
                        onChange={(e) => updateRow(idx, { title: e.target.value })}
                        placeholder="Task title"
                        className={cn("h-7 text-xs", !row.title.trim() && "border-destructive/50")}
                        disabled={disabled}
                      />
                    </TableCell>

                    {/* Description */}
                    <TableCell className="py-1 min-w-[200px]">
                      <Input
                        value={row.description}
                        onChange={(e) => updateRow(idx, { description: e.target.value })}
                        placeholder="Optional"
                        className="h-7 text-xs"
                        disabled={disabled}
                      />
                    </TableCell>

                    {/* Assignee */}
                    <PersonCell
                      value={row.assigneeName}
                      field="assigneeName"
                      role="assignee"
                      profileMap={profileMap}
                      onUpdate={(patch) => updateRow(idx, patch)}
                      disabled={disabled}
                    />

                    {/* Reviewer */}
                    <PersonCell
                      value={row.reviewerName}
                      field="reviewerName"
                      role="reviewer"
                      profileMap={profileMap}
                      onUpdate={(patch) => updateRow(idx, patch)}
                      disabled={disabled}
                    />

                    {/* Status */}
                    <TableCell className="py-1 min-w-[130px]">
                      <GridSelect
                        value={row.status}
                        options={STATUS_OPTIONS}
                        onValueChange={(v) => updateRow(idx, { status: v as BulkRow["status"] })}
                        disabled={disabled}
                      />
                    </TableCell>

                    {/* Priority */}
                    <TableCell className="py-1 min-w-[100px]">
                      <GridSelect
                        value={row.priority}
                        options={PRIORITY_OPTIONS}
                        onValueChange={(v) =>
                          updateRow(idx, { priority: v as BulkRow["priority"] })
                        }
                        disabled={disabled}
                      />
                    </TableCell>

                    {/* Complexity */}
                    <TableCell className="py-1 min-w-[120px]">
                      <GridSelect
                        value={row.complexity}
                        options={COMPLEXITY_OPTIONS}
                        onValueChange={(v) =>
                          updateRow(idx, { complexity: v as BulkRow["complexity"] })
                        }
                        disabled={disabled}
                      />
                    </TableCell>

                    {/* Period */}
                    <TableCell className="py-1 min-w-[110px]">
                      <GridSelect
                        value={row.period ?? "__none__"}
                        options={PERIOD_OPTIONS}
                        onValueChange={(v) =>
                          updateRow(idx, {
                            period: v === "__none__" ? null : (v as BulkRow["period"]),
                          })
                        }
                        disabled={disabled}
                      />
                    </TableCell>

                    {/* Tax Year */}
                    <TableCell className="py-1 min-w-[90px]">
                      <Input
                        type="number"
                        value={row.taxYear ?? ""}
                        onChange={(e) =>
                          updateRow(idx, {
                            taxYear: e.target.value ? Number(e.target.value) : null,
                          })
                        }
                        placeholder="2025"
                        className="h-7 text-xs"
                        min={1900}
                        max={2100}
                        disabled={disabled}
                      />
                    </TableCell>

                    {/* Start Date */}
                    <TableCell className="py-1 min-w-[130px]">
                      <Input
                        type="date"
                        value={row.startDate}
                        onChange={(e) => updateRow(idx, { startDate: e.target.value })}
                        className="h-7 text-xs"
                        disabled={disabled}
                      />
                    </TableCell>

                    {/* Due Date */}
                    <TableCell className="py-1 min-w-[130px]">
                      <Input
                        type="date"
                        value={row.dueDate}
                        onChange={(e) => updateRow(idx, { dueDate: e.target.value })}
                        className="h-7 text-xs"
                        disabled={disabled}
                      />
                    </TableCell>

                    {/* Software */}
                    <TableCell className="py-1 min-w-[120px]">
                      <GridSelect
                        value={row.software ?? "__none__"}
                        options={SOFTWARE_OPTIONS}
                        onValueChange={(v) =>
                          updateRow(idx, {
                            software: v === "__none__" ? null : (v as BulkRow["software"]),
                          })
                        }
                        disabled={disabled}
                      />
                    </TableCell>

                    {/* Validation */}
                    <TableCell className="py-1 text-center w-9">
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {valid ? (
                              <CheckCircle2 className="inline h-4 w-4 text-emerald-500" />
                            ) : (
                              <AlertCircle className="inline h-4 w-4 text-destructive" />
                            )}
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">
                            {valid ? "Ready to save" : "Client and Title are required"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>

                    {/* Delete */}
                    <TableCell className="py-1 text-center w-9">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeRow(idx)}
                        disabled={disabled}
                        title="Remove row"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add row */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={disabled || rows.length >= 500}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add row
        </Button>
        {rows.length >= 500 && (
          <span className="text-xs text-muted-foreground">Maximum 500 rows reached</span>
        )}
      </div>
    </div>
  );
}
