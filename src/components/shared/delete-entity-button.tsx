import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button, type buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/auth-context";
import type { VariantProps } from "class-variance-authority";
import {
  CaptchaAlertAction,
  CaptchaAlertDescription,
  useCaptchaGate,
} from "@/components/auth/captcha-confirm";

type Variant = VariantProps<typeof buttonVariants>["variant"];
type Size = VariantProps<typeof buttonVariants>["size"];

interface Props {
  table: "firms" | "projects" | "client_entities" | "tasks";
  id: string;
  label: string;
  cascadeNote?: string;
  invalidateKeys?: unknown[][];
  onDeleted?: () => void;
  variant?: Variant;
  size?: Size;
  iconOnly?: boolean;
  buttonLabel?: string;
}

/** Admin-only delete with confirmation. Renders nothing for non-admins. */
export function DeleteEntityButton({
  table,
  id,
  label,
  cascadeNote,
  invalidateKeys = [],
  onDeleted,
  variant = "ghost",
  size = "sm",
  iconOnly,
  buttonLabel = "Delete",
}: Props) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const captcha = useCaptchaGate(`${table}-${id}`);

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${label} deleted`);
      setOpen(false);
      for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: k });
      onDeleted?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (role !== "admin") return null;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) captcha.reset();
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant={variant}
          size={iconOnly ? "icon" : size}
          className={
            iconOnly ? "h-8 w-8 text-destructive" : "text-destructive hover:text-destructive"
          }
        >
          <Trash2 className="h-4 w-4" />
          {!iconOnly && <span className="ml-1">{buttonLabel}</span>}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {label}?</AlertDialogTitle>
          <CaptchaAlertDescription captchaKey={captcha.nonce} onValidChange={captcha.setValid}>
            This permanently removes <strong>{label}</strong>.{cascadeNote && <> {cascadeNote}</>}{" "}
            This cannot be undone.
          </CaptchaAlertDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <CaptchaAlertAction
            valid={captcha.valid}
            pending={del.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onConfirm={() => del.mutate()}
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </CaptchaAlertAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
