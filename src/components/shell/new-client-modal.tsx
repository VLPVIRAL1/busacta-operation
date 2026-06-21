import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Building2, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/shared/utils";

/**
 * Global "+ New Client" button + stream-picker modal. Routes the user
 * into the appropriate existing onboarding flow rather than rebuilding
 * a unified wizard — preserves segregation of duties (Firm Hub is
 * CEO-only, B2C Clients onboarding is employee-accessible).
 */
export function NewClientButton() {
  const { role } = useAuth();
  const canCreateFirm = role === "super_admin" || role === "admin";
  const canCreateDirect = role === "super_admin" || role === "admin" || role === "employee";

  // Hide entirely if user can't create either kind.
  if (!canCreateFirm && !canCreateDirect) return null;

  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const goFirm = () => {
    setOpen(false);
    navigate({ to: "/clients", search: { new: "firm" } as never });
  };
  const goDirect = () => {
    setOpen(false);
    navigate({ to: "/clients", search: { new: "direct" } as never });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="hidden md:inline-flex gap-1.5"
          aria-label="Add a new client"
          title="New client"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span>New Client</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a new client</DialogTitle>
          <DialogDescription>
            Pick the engagement type. We'll route you to the right onboarding flow.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ChoiceCard
            disabled={!canCreateFirm}
            tone="cpa"
            icon={<Building2 className="h-5 w-5" />}
            label="B2B Firm"
            sublabel="B2B · Firm → Projects → Tasks"
            hint={!canCreateFirm ? "Requires admin" : "Opens Firm Hub onboarding wizard"}
            onClick={goFirm}
          />
          <ChoiceCard
            disabled={!canCreateDirect}
            tone="direct"
            icon={<User className="h-5 w-5" />}
            label="B2C Client"
            sublabel="B2C · Client → Tasks (no project layer)"
            hint="Opens B2C Client onboarding"
            onClick={goDirect}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceCard({
  icon,
  label,
  sublabel,
  hint,
  tone,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  hint: string;
  tone: "cpa" | "direct";
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative flex flex-col items-start gap-1.5 rounded-lg border-2 p-4 text-left transition-all",
        "hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tone === "cpa"
          ? "border-sky-300 bg-sky-50/40 hover:bg-sky-50 dark:border-sky-500/40 dark:bg-sky-500/5 dark:hover:bg-sky-500/10"
          : "border-rose-300 bg-rose-50/40 hover:bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/5 dark:hover:bg-rose-500/10",
        disabled && "opacity-50 cursor-not-allowed hover:shadow-none",
      )}
    >
      <span
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-md",
          tone === "cpa"
            ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200"
            : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
        )}
      >
        {icon}
      </span>
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-muted-foreground">{sublabel}</span>
      <span className="mt-1 text-[11px] text-muted-foreground/80">{hint}</span>
    </button>
  );
}
