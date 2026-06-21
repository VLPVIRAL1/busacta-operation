import {
  ShieldCheck,
  Briefcase,
  User as UserIcon,
  ChevronDown,
  Crown,
  Users,
  Layers,
} from "lucide-react";
import { useAuth, type AppRole } from "@/lib/auth/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

const META: Record<AppRole, { label: string; icon: typeof ShieldCheck }> = {
  super_admin: { label: "Super Admin", icon: Crown },
  admin: { label: "Admin", icon: ShieldCheck },
  hr_manager: { label: "HR Mgr", icon: Users },
  employee: { label: "Employee", icon: Briefcase },
  client: { label: "Client", icon: UserIcon },
};

export function RoleSwitcher() {
  const { activeRole, roles, setActiveRole, isAllMode } = useAuth();
  if (roles.length === 0) return null;

  // Single role → read-only chip (no dropdown, no switching).
  if (roles.length === 1) {
    const only = roles[0];
    const M = META[only];
    return (
      <Badge variant="outline" className="h-8 gap-1.5 px-2 text-xs font-normal">
        <M.icon className="h-3.5 w-3.5" />
        {M.label}
      </Badge>
    );
  }

  const triggerLabel = isAllMode
    ? "All roles"
    : activeRole && activeRole !== "all"
      ? META[activeRole].label
      : "Select role";
  const TriggerIcon = isAllMode
    ? Layers
    : activeRole && activeRole !== "all"
      ? META[activeRole].icon
      : Layers;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <TriggerIcon className="h-3.5 w-3.5" />
          <span className="text-xs">{triggerLabel}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs">View as…</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {roles.map((r) => {
          const M = META[r];
          const isActive = !isAllMode && activeRole === r;
          return (
            <DropdownMenuItem
              key={r}
              onClick={() => setActiveRole(r)}
              className={isActive ? "bg-accent" : ""}
            >
              <M.icon className="h-3.5 w-3.5 mr-2" />
              {M.label}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setActiveRole("all")}
          className={isAllMode ? "bg-accent" : ""}
        >
          <Layers className="h-3.5 w-3.5 mr-2" />
          All roles
          <span className="ml-auto text-[10px] text-muted-foreground">union</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
