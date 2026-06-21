import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MathCaptcha } from "@/components/auth/math-captcha";
import { cn } from "@/lib/shared/utils";

/**
 * Reusable destructive-action confirmation dialog with a math captcha gate.
 * Use for deleting Projects, Clients, Tasks, Sub-tasks, Notes, SOPs,
 * Open Points / Clarifications, Links, and Files.
 */
export function DeleteConfirmDialog({
  trigger,
  entityLabel,
  entityName,
  description,
  confirmLabel = "Yes, delete",
  cancelLabel = "No, keep it",
  onConfirm,
  open,
  onOpenChange,
}: {
  trigger?: ReactNode;
  entityLabel: string;
  entityName?: string | null;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open! : internalOpen;
  const setOpen = (o: boolean) => {
    if (!isControlled) setInternalOpen(o);
    onOpenChange?.(o);
    if (!o) setCaptchaOk(false);
  };
  const [captchaOk, setCaptchaOk] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <AlertDialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this {entityLabel.toLowerCase()}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {entityName && (
                <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{entityLabel}: </span>
                  <span className="font-semibold text-foreground">{entityName}</span>
                </div>
              )}
              <p className="text-sm">
                {description ??
                  "This action is permanent. Solve the captcha below and confirm to continue."}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <MathCaptcha onValidChange={setCaptchaOk} className="mt-1" />
        <AlertDialogFooter className="mt-2">
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!captchaOk || busy}
            className={cn(
              "bg-destructive text-destructive-foreground hover:bg-destructive/90",
              (!captchaOk || busy) && "opacity-60",
            )}
            onClick={async (e) => {
              e.preventDefault();
              if (!captchaOk) return;
              setBusy(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Deleting…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
