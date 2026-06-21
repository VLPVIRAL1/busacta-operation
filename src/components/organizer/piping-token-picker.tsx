import { useMemo, useState } from "react";
import { AtSign, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { OrganizerBlock } from "@/lib/organizer/schemas";

/**
 * PipingTokenPicker
 * -----------------
 * Authoring affordance for the answer-piping feature. Renders an `@` button
 * that opens a searchable list of upstream answer blocks. Clicking one
 * inserts a `{{block:<id>}}` token into the caller's text by way of
 * `onInsert(token)`.
 *
 * Caller responsibilities:
 *  - Pass the *eligible* upstream blocks (typically `candidateRefs` from the
 *    builder — strict document-order ancestry, scalar-producing types).
 *  - On `onInsert`, splice the token at the current caret position of the
 *    target input/textarea and re-focus.
 */
export function PipingTokenPicker({
  candidates,
  onInsert,
  size = "sm",
  label = "Insert answer",
}: {
  candidates: OrganizerBlock[];
  onInsert: (token: string) => void;
  size?: "sm" | "icon";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return candidates.slice(0, 50);
    return candidates
      .filter((b) => (b.question_text ?? "").toLowerCase().includes(needle))
      .slice(0, 50);
  }, [candidates, q]);

  if (candidates.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {size === "icon" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={label}
            aria-label={label}
          >
            <AtSign className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" className="h-7">
            <AtSign className="h-3.5 w-3.5 mr-1" /> {label}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-2 border-b">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search previous questions…"
            className="h-8"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-xs text-muted-foreground text-center">
              No upstream answers match.
            </div>
          ) : (
            filtered.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  onInsert(`{{block:${b.id}}}`);
                  setOpen(false);
                  setQ("");
                }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-start gap-2"
              >
                <Check className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/0 group-hover:text-foreground" />
                <div className="min-w-0">
                  <div className="truncate">
                    {b.question_text || (
                      <span className="text-muted-foreground italic">Untitled question</span>
                    )}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {b.block_type}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="px-3 py-2 border-t text-[10px] text-muted-foreground">
          Inserts <code className="font-mono">{`{{block:id}}`}</code>. At render time, the answer is
          substituted in.
        </div>
      </PopoverContent>
    </Popover>
  );
}
