import { useState } from "react";
import { Check, ChevronsUpDown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/shared/utils";

export type EmployeeOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url?: string | null;
};

export function MultiEmployeeSelect({
  options,
  value,
  onChange,
  placeholder = "Assign employees…",
  disabled,
}: {
  options: EmployeeOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  const selectedCount = value.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          size="sm"
          disabled={disabled}
          className="h-8 justify-between gap-2 text-xs font-normal"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {selectedCount > 0 ? `${selectedCount} assigned` : placeholder}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <Command>
          <CommandInput placeholder="Search employees…" />
          <CommandList>
            <CommandEmpty>No employees found.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const checked = value.includes(opt.id);
                return (
                  <CommandItem
                    key={opt.id}
                    value={`${opt.full_name ?? ""} ${opt.email ?? ""}`}
                    onSelect={() => toggle(opt.id)}
                  >
                    <Check className={cn("mr-2 h-4 w-4", checked ? "opacity-100" : "opacity-0")} />
                    <UserAvatar
                      profile={{
                        id: opt.id,
                        full_name: opt.full_name,
                        email: opt.email,
                        avatar_url: opt.avatar_url ?? null,
                      }}
                      size="sm"
                      className="mr-2 shrink-0"
                      showPresence={false}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="truncate text-sm">
                        {opt.full_name || opt.email || "Unnamed"}
                      </span>
                      {opt.email && opt.full_name && (
                        <span className="truncate text-xs text-muted-foreground">{opt.email}</span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
