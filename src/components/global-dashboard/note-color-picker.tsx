import { Check, Palette } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";
import { NOTE_COLORS, noteColor, type NoteColorKey } from "./note-colors";

/**
 * Compact colour picker used by reminders and Daily Notes. Renders a small dot
 * that reflects the current selection; clicking opens a palette of swatches.
 */
export function NoteColorPicker({
  value,
  onChange,
  className,
  align = "start",
  title = "Colour",
}: {
  value: string | null | undefined;
  onChange: (key: NoteColorKey) => void;
  className?: string;
  align?: "start" | "center" | "end";
  title?: string;
}) {
  const current = noteColor(value);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          aria-label={title}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            className,
          )}
        >
          {value && value !== "default" ? (
            <span
              className={cn(
                "h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/10",
                current.swatch,
              )}
            />
          ) : (
            <Palette className="h-3.5 w-3.5" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-2">
        <div className="flex items-center gap-1.5">
          {NOTE_COLORS.map((c) => {
            const selected = (value ?? "default") === c.key;
            return (
              <button
                key={c.key}
                type="button"
                title={c.label}
                aria-label={c.label}
                onClick={() => onChange(c.key)}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-inset ring-black/10 transition-transform hover:scale-110",
                  c.swatch,
                )}
              >
                {selected && <Check className="h-3.5 w-3.5 text-foreground/70" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
