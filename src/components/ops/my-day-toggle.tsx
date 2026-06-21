import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/shared/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { addToMyDay, removeFromMyDay, isInMyDayQuery } from "@/lib/queries/ops.queries";

/**
 * Sun-icon toggle that pins a task to the current user's "My Day" list.
 *
 * STRICTLY PERSONAL: writes go to `task_my_day` scoped by `auth.uid()` and are
 * enforced by RLS (per-user SELECT / INSERT / UPDATE / DELETE policies).
 * Never expose a "share" or "make visible to firm" affordance — this is the
 * Microsoft To-Do "My Day" model and resets at midnight (date-bound).
 */
export function MyDayToggle({
  taskId,
  size = "sm",
  showLabel = false,
}: {
  taskId: string;
  size?: "sm" | "icon";
  showLabel?: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: pinned = false } = useQuery(isInMyDayQuery(taskId, user?.id));

  const m = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in required");
      if (pinned) await removeFromMyDay(taskId, user.id);
      else await addToMyDay(taskId, user.id);
    },
    onSuccess: () => {
      toast.success(pinned ? "Removed from your day" : "Added to your day");
      qc.invalidateQueries({ queryKey: ["my-day-task", taskId, user?.id] });
      qc.invalidateQueries({ queryKey: ["my-day", user?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const label = pinned ? "Remove from My Day" : "Add to My Day";

  const button = (
    <Button
      type="button"
      size={size === "icon" ? "icon" : "sm"}
      variant="ghost"
      className={cn(
        size === "icon" ? "h-7 w-7" : "h-7 gap-1.5 px-2 text-xs",
        pinned
          ? "text-amber-600 dark:text-amber-300 bg-amber-100/70 dark:bg-amber-500/15 ring-1 ring-amber-400/60 hover:bg-amber-100"
          : "text-muted-foreground hover:text-amber-500",
      )}
      onClick={(e) => {
        e.stopPropagation();
        m.mutate();
      }}
      disabled={m.isPending}
      aria-pressed={pinned}
      aria-label={label}
    >
      <Sun className={cn("h-3.5 w-3.5", pinned && "fill-amber-400 text-amber-500")} />
      {showLabel && <span>{pinned ? "In My Day" : "Add to My Day"}</span>}
    </Button>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="top">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
