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
import {
  type ConditionalGroup,
  type ConditionalLeaf,
  type ConditionalRules,
  type OrganizerBlock,
} from "@/lib/organizer/schemas";

type Node = ConditionalGroup | ConditionalLeaf;

function isGroup(n: Node): n is ConditionalGroup {
  return (n as ConditionalGroup).rules !== undefined;
}

const OPS: Array<{ value: ConditionalLeaf["op"]; label: string; needsValue: boolean }> = [
  { value: "equals", label: "equals", needsValue: true },
  { value: "not_equals", label: "does not equal", needsValue: true },
  { value: "in", label: "is one of", needsValue: true },
  { value: "not_in", label: "is not one of", needsValue: true },
  { value: "gt", label: ">", needsValue: true },
  { value: "gte", label: "≥", needsValue: true },
  { value: "lt", label: "<", needsValue: true },
  { value: "lte", label: "≤", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "is_empty", label: "is empty", needsValue: false },
  { value: "is_not_empty", label: "is not empty", needsValue: false },
];

export function ConditionalRuleBuilder({
  value,
  onChange,
  candidateBlocks,
}: {
  value: ConditionalRules;
  onChange: (next: ConditionalRules) => void;
  candidateBlocks: OrganizerBlock[];
}) {
  const enabled = value !== null;
  const root: ConditionalGroup = enabled
    ? (value as { show_when: ConditionalGroup }).show_when
    : { op: "AND", rules: [] };

  const emit = (g: ConditionalGroup) => onChange({ show_when: g });

  if (!enabled) {
    return (
      <div className="text-xs text-muted-foreground">
        Always shown.{" "}
        <button className="underline" onClick={() => emit({ op: "AND", rules: [] })}>
          Add a show-when rule
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <GroupEditor group={root} candidateBlocks={candidateBlocks} onChange={(g) => emit(g)} />
      <button className="text-xs text-muted-foreground underline" onClick={() => onChange(null)}>
        Remove all rules (always show)
      </button>
    </div>
  );
}

function GroupEditor({
  group,
  candidateBlocks,
  onChange,
  depth = 0,
}: {
  group: ConditionalGroup;
  candidateBlocks: OrganizerBlock[];
  onChange: (g: ConditionalGroup) => void;
  depth?: number;
}) {
  const setRule = (i: number, r: Node) => {
    const next = [...group.rules];
    next[i] = r;
    onChange({ ...group, rules: next });
  };
  const removeRule = (i: number) =>
    onChange({ ...group, rules: group.rules.filter((_, j) => j !== i) });
  const addLeaf = () =>
    onChange({
      ...group,
      rules: [...group.rules, { blockId: candidateBlocks[0]?.id ?? "", op: "equals", value: "" }],
    });
  const addGroup = () =>
    onChange({
      ...group,
      rules: [...group.rules, { op: "AND", rules: [] }],
    });

  return (
    <div className={`border rounded p-2 space-y-2 ${depth > 0 ? "bg-muted/30" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Match</span>
        <Select
          value={group.op}
          onValueChange={(v) => onChange({ ...group, op: v as "AND" | "OR" })}
        >
          <SelectTrigger className="w-20 h-7">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">All</SelectItem>
            <SelectItem value="OR">Any</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">of:</span>
      </div>

      {group.rules.map((r, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1">
            {isGroup(r) ? (
              <GroupEditor
                group={r}
                candidateBlocks={candidateBlocks}
                onChange={(g) => setRule(i, g)}
                depth={depth + 1}
              />
            ) : (
              <LeafEditor
                leaf={r}
                candidateBlocks={candidateBlocks}
                onChange={(l) => setRule(i, l)}
              />
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => removeRule(i)} aria-label="Remove rule">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={addLeaf}>
          <Plus className="h-3 w-3 mr-1" /> Rule
        </Button>
        {depth < 2 && (
          <Button size="sm" variant="ghost" onClick={addGroup}>
            <Plus className="h-3 w-3 mr-1" /> Group
          </Button>
        )}
      </div>
    </div>
  );
}

function LeafEditor({
  leaf,
  candidateBlocks,
  onChange,
}: {
  leaf: ConditionalLeaf;
  candidateBlocks: OrganizerBlock[];
  onChange: (l: ConditionalLeaf) => void;
}) {
  const opDef = OPS.find((o) => o.value === leaf.op) ?? OPS[0];
  const valueStr =
    leaf.value === undefined || leaf.value === null
      ? ""
      : typeof leaf.value === "string"
        ? leaf.value
        : JSON.stringify(leaf.value);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select value={leaf.blockId} onValueChange={(v) => onChange({ ...leaf, blockId: v })}>
        <SelectTrigger className="h-7 min-w-[10rem]">
          <SelectValue placeholder="Question…" />
        </SelectTrigger>
        <SelectContent>
          {candidateBlocks.map((b) => {
            const isSection = b.block_type === "section" || b.block_type === "subsection";
            return (
              <SelectItem key={b.id} value={b.id}>
                {isSection ? "§ " : ""}
                {b.question_text?.slice(0, 50) || "(untitled)"}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
      <Select
        value={leaf.op}
        onValueChange={(v) => onChange({ ...leaf, op: v as ConditionalLeaf["op"] })}
      >
        <SelectTrigger className="h-7 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {OPS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {opDef.needsValue && (
        <Input
          className="h-7 w-40"
          value={valueStr}
          placeholder={leaf.op === "in" || leaf.op === "not_in" ? "[ ... ]" : "value"}
          onChange={(e) => {
            const raw = e.target.value;
            let parsed: unknown = raw;
            if (raw === "true") parsed = true;
            else if (raw === "false") parsed = false;
            else if (raw !== "" && !isNaN(Number(raw)) && /^-?\d+(\.\d+)?$/.test(raw))
              parsed = Number(raw);
            else if (raw.startsWith("[") || raw.startsWith("{")) {
              try {
                parsed = JSON.parse(raw);
              } catch {
                parsed = raw;
              }
            }
            onChange({ ...leaf, value: parsed });
          }}
        />
      )}
    </div>
  );
}
