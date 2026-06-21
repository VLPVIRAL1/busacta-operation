import { useEffect, useId, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function newChallenge() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, sum: a + b };
}

/**
 * Lightweight client-side math captcha. Renders a simple "a + b = ?" challenge,
 * exposes an `isValid` flag via onValidChange and auto-rotates on each new mount
 * or when the user clicks refresh.
 */
export function MathCaptcha({
  onValidChange,
  className,
}: {
  onValidChange: (valid: boolean) => void;
  className?: string;
}) {
  const inputId = useId();
  const [c, setC] = useState<{ a: number; b: number; sum: number } | null>(null);
  const [val, setVal] = useState("");

  useEffect(() => {
    setC(newChallenge());
  }, []);

  useEffect(() => {
    const ok = !!c && val.trim() !== "" && Number(val) === c.sum;
    onValidChange(ok);
  }, [val, c, onValidChange]);

  const refresh = () => {
    setC(newChallenge());
    setVal("");
  };

  return (
    <div className={className}>
      <Label htmlFor={inputId} className="text-xs font-medium">
        Verify you're human
      </Label>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="select-none rounded-md border bg-muted px-3 py-2 text-sm font-mono font-semibold tabular-nums text-foreground">
          {c ? `${c.a} + ${c.b} = ?` : "Loading…"}
        </div>
        <Input
          id={inputId}
          inputMode="numeric"
          pattern="[0-9]*"
          value={val}
          onChange={(e) => setVal(e.target.value.replace(/[^0-9-]/g, ""))}
          placeholder="Answer"
          className="h-9 w-24"
          autoComplete="off"
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-9 w-9"
          onClick={refresh}
          title="New challenge"
        >
          <RefreshCcw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
