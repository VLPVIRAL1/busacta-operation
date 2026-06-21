import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, RotateCcw } from "lucide-react";
import type { OrganizerBlock, JsonObject } from "@/lib/organizer/schemas";
import { computeVisibleBlockIds } from "@/lib/organizer/evaluate-rules";

/**
 * Inline 4th-panel preview — renders blocks and lets the admin try answers
 * to verify conditional logic in real time. No DB writes, no autosave.
 */
export function PreviewPane({
  blocks,
  templateName,
}: {
  blocks: OrganizerBlock[];
  templateName: string;
}) {
  const [answers, setAnswers] = useState<Map<string, unknown>>(new Map());
  const sortedBlocks = useMemo(
    () => [...blocks].sort((a, b) => a.order_index - b.order_index),
    [blocks],
  );
  const visible = useMemo(() => computeVisibleBlockIds(blocks, answers), [blocks, answers]);
  const setAnswer = (id: string, v: unknown) => {
    setAnswers((prev) => new Map(prev).set(id, v));
  };
  const hiddenCount = sortedBlocks.length - visible.size;

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="h-10 border-b border-border/50 px-3 flex items-center gap-2 shrink-0">
        <Eye className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex-1">
          Preview
        </span>
        <Badge variant="outline" className="text-[10px]">
          {visible.size} visible
        </Badge>
        {hiddenCount > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            {hiddenCount} hidden
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          title="Reset answers"
          onClick={() => setAnswers(new Map())}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      </div>

      {/* Section navigation pills */}
      {(() => {
        const sections = sortedBlocks.filter((b) => b.block_type === "section");
        return sections.length > 0 ? (
          <div className="border-b px-3 py-1.5 flex gap-1.5 overflow-x-auto shrink-0">
            {sections.map((sec, i) => (
              <button
                key={sec.id}
                className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border hover:bg-muted/60 transition-colors whitespace-nowrap"
                onClick={() =>
                  document
                    .getElementById(`preview-${sec.id}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                {i + 1}. {sec.question_text || "Section"}
              </button>
            ))}
          </div>
        ) : null;
      })()}

      {/* Scrollable block list */}
      <div className="flex-1 overflow-y-auto scroll-smooth overscroll-contain">
        <div className="p-4 space-y-3 pb-16">
          <p className="text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-2.5 py-1.5">
            Try answers to test conditional logic. Nothing is saved.
          </p>
          {sortedBlocks.map((b) => {
            if (!visible.has(b.id))
              return (
                <div
                  key={b.id}
                  className="text-[11px] italic text-muted-foreground/60 border-l-2 border-dashed border-border pl-2.5 py-0.5"
                >
                  Hidden: {b.question_text || b.block_type}
                </div>
              );
            if (b.block_type === "section")
              return (
                <h2
                  key={b.id}
                  id={`preview-${b.id}`}
                  className="text-base font-semibold pt-3 pb-1 border-b border-border/50"
                >
                  {b.question_text || "Section"}
                </h2>
              );
            if (b.block_type === "subsection")
              return (
                <h3 key={b.id} className="text-sm font-semibold text-muted-foreground pt-2">
                  {b.question_text || "Subsection"}
                </h3>
              );
            if (b.block_type === "info")
              return (
                <p
                  key={b.id}
                  className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-lg px-3 py-2"
                >
                  {(b.config_json as JsonObject)?.body as string}
                </p>
              );
            if (b.block_type === "divider") return <hr key={b.id} className="border-border/50" />;
            return (
              <div
                key={b.id}
                className="rounded-xl border border-border/60 bg-card p-3 space-y-2 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium leading-snug">
                    {b.question_text}
                    {b.is_required && <span className="text-destructive ml-1">*</span>}
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground shrink-0">
                    {b.block_type}
                  </span>
                </div>
                <PreviewInput
                  block={b}
                  value={answers.get(b.id)}
                  onChange={(v) => setAnswer(b.id, v)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Lightweight preview of the current template — renders blocks read-only and
 * lets the admin try answers in-memory to verify conditional logic. No DB
 * writes, no autosave.
 */
export function PreviewDrawer({
  open,
  onOpenChange,
  templateName,
  blocks,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateName: string;
  blocks: OrganizerBlock[];
}) {
  const [answers, setAnswers] = useState<Map<string, unknown>>(new Map());
  const sortedBlocks = useMemo(
    () => [...blocks].sort((a, b) => a.order_index - b.order_index),
    [blocks],
  );
  const visible = useMemo(() => computeVisibleBlockIds(blocks, answers), [blocks, answers]);

  const setAnswer = (id: string, v: unknown) => {
    setAnswers((prev) => new Map(prev).set(id, v));
  };

  const hiddenCount = sortedBlocks.length - visible.size;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" /> Preview · {templateName}
          </SheetTitle>
          <SheetDescription>
            Try answers below to see conditional logic. Nothing is saved.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <Badge variant="outline">{visible.size} visible</Badge>
          <Badge variant={hiddenCount > 0 ? "secondary" : "outline"}>{hiddenCount} hidden</Badge>
        </div>
        <div className="mt-4 space-y-4">
          {sortedBlocks.map((b) => {
            if (!visible.has(b.id))
              return (
                <div
                  key={b.id}
                  className="text-xs italic text-muted-foreground border-l-2 border-dashed border-muted pl-2"
                >
                  Hidden by rule: {b.question_text || b.block_type}
                </div>
              );
            if (b.block_type === "section")
              return (
                <h2 key={b.id} className="text-lg font-semibold pt-2">
                  {b.question_text || "Section"}
                </h2>
              );
            if (b.block_type === "subsection")
              return (
                <h3 key={b.id} className="text-sm font-semibold pt-2">
                  {b.question_text || "Subsection"}
                </h3>
              );
            if (b.block_type === "info")
              return (
                <p key={b.id} className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {(b.config_json as JsonObject)?.body as string}
                </p>
              );
            if (b.block_type === "divider") return <hr key={b.id} className="my-2 border-muted" />;
            return (
              <Card key={b.id} className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="text-sm font-medium flex-1">
                    {b.question_text}
                    {b.is_required && <span className="text-destructive ml-1">*</span>}
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {b.block_type}
                  </Badge>
                </div>
                <PreviewInput
                  block={b}
                  value={answers.get(b.id)}
                  onChange={(v) => setAnswer(b.id, v)}
                />
              </Card>
            );
          })}
          <div className="pt-4 text-right">
            <Button variant="outline" onClick={() => setAnswers(new Map())}>
              Reset answers
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PreviewInput({
  block,
  value,
  onChange,
}: {
  block: OrganizerBlock;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const cfg = (block.config_json as JsonObject) ?? {};
  switch (block.block_type) {
    case "short_text":
      return (
        <Input
          value={readKey<string>(value, "text") ?? ""}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      );
    case "long_text":
      return (
        <Textarea
          rows={3}
          value={readKey<string>(value, "text") ?? ""}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      );
    case "number":
    case "currency":
      return (
        <Input
          type="number"
          value={readKey<number>(value, "value") ?? ""}
          onChange={(e) =>
            onChange({
              value: e.target.value === "" ? null : Number(e.target.value),
            })
          }
        />
      );
    case "yes_no":
      return (
        <div className="flex gap-2">
          {[
            { v: true, l: "Yes" },
            { v: false, l: "No" },
          ].map((o) => (
            <Button
              key={o.l}
              variant={readKey<boolean>(value, "value") === o.v ? "default" : "outline"}
              size="sm"
              onClick={() => onChange({ value: o.v })}
            >
              {o.l}
            </Button>
          ))}
        </div>
      );
    case "single_choice": {
      const opts = (cfg.options as Array<{ id: string; label: string }>) ?? [];
      return (
        <div className="space-y-1">
          {opts.map((o) => (
            <Button
              key={o.id}
              variant={readKey<string>(value, "optionId") === o.id ? "default" : "outline"}
              size="sm"
              className="w-full justify-start"
              onClick={() => onChange({ optionId: o.id })}
            >
              {o.label}
            </Button>
          ))}
        </div>
      );
    }
    case "phone":
    case "email":
    case "url":
      return (
        <Input
          value={readKey<string>(value, "text") ?? ""}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      );
    case "time":
      return (
        <Input
          type="time"
          value={readKey<string>(value, "value") ?? ""}
          onChange={(e) => onChange({ value: e.target.value })}
        />
      );
    case "date":
      return (
        <Input
          type="date"
          value={readKey<string>(value, "iso") ?? ""}
          onChange={(e) => onChange({ iso: e.target.value })}
        />
      );
    default:
      return (
        <p className="text-xs italic text-muted-foreground">
          ({block.block_type} — render in the live wizard)
        </p>
      );
  }
}

function readKey<T>(v: unknown, k: string): T | undefined {
  if (v && typeof v === "object" && k in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>)[k] as T;
  }
  return undefined;
}
