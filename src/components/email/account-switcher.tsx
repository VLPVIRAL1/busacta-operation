import { Check, ChevronDown, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ConnectedAccount } from "@/lib/email/accounts.functions";

export function AccountSwitcher({
  accounts,
  activeId,
  onChange,
}: {
  accounts: ConnectedAccount[];
  activeId: string | null;
  onChange: (id: string) => void;
}) {
  const active = accounts.find((a) => a.id === activeId) ?? accounts[0];
  if (!active) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs max-w-[260px]">
          <Mail className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{active.email_address}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[280px]">
        {accounts.map((a) => (
          <DropdownMenuItem
            key={a.id}
            onSelect={() => onChange(a.id)}
            className="flex items-center gap-2"
          >
            <span className="truncate flex-1 text-xs">{a.email_address}</span>
            {a.id === active.id && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/email/settings" className="text-xs">
            Manage accounts…
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
