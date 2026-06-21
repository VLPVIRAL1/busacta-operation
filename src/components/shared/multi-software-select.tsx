import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { SOFTWARE_OPTIONS, type SoftwareType, labelFor } from "@/lib/shared/domain";
import { cn } from "@/lib/shared/utils";

export function MultiSoftwareSelect({
  value,
  onChange,
  placeholder = "Select tax software…",
}: {
  value: SoftwareType[];
  onChange: (next: SoftwareType[]) => void;
  placeholder?: string;
}) {
  const toggle = (v: SoftwareType) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal">
          <span className="flex flex-wrap gap-1">
            {value.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              value.map((v) => (
                <Badge key={v} variant="secondary" className="text-xs">
                  {labelFor(SOFTWARE_OPTIONS, v)}
                </Badge>
              ))
            )}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start">
        {SOFTWARE_OPTIONS.map((opt) => {
          const checked = value.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={cn(
                "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                checked && "bg-accent/50",
              )}
            >
              <span>{opt.label}</span>
              {checked && <Check className="h-4 w-4 text-primary" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
