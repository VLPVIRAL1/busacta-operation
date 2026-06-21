import { useCallback, useState, type ReactNode } from "react";
import { MathCaptcha } from "@/components/auth/math-captcha";
import { AlertDialogAction, AlertDialogDescription } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function useCaptchaGate(resetKey?: unknown) {
  const [valid, setValid] = useState(false);
  const [nonce, setNonce] = useState(0);
  const reset = useCallback(() => {
    setValid(false);
    setNonce((n) => n + 1);
  }, []);
  return { valid, setValid, nonce: `${String(resetKey ?? "captcha")}-${nonce}`, reset };
}

export function CaptchaBlock({
  label,
  onValidChange,
  captchaKey,
}: {
  label?: string;
  onValidChange: (valid: boolean) => void;
  captchaKey: string | number;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/25 p-3">
      {label && <p className="mb-2 text-xs text-muted-foreground">{label}</p>}
      <MathCaptcha key={captchaKey} onValidChange={onValidChange} />
    </div>
  );
}

export function CaptchaAlertDescription({
  children,
  captchaKey,
  onValidChange,
}: {
  children: ReactNode;
  captchaKey: string | number;
  onValidChange: (valid: boolean) => void;
}) {
  return (
    <AlertDialogDescription asChild>
      <div className="space-y-3 text-sm text-muted-foreground">
        <div>{children}</div>
        <CaptchaBlock
          captchaKey={captchaKey}
          onValidChange={onValidChange}
          label="Solve this captcha before continuing."
        />
      </div>
    </AlertDialogDescription>
  );
}

export function CaptchaAlertAction({
  valid,
  pending,
  children,
  onConfirm,
  className,
}: {
  valid: boolean;
  pending?: boolean;
  children: ReactNode;
  onConfirm: () => void;
  className?: string;
}) {
  return (
    <AlertDialogAction
      className={className}
      onClick={(e) => {
        e.preventDefault();
        if (valid && !pending) onConfirm();
      }}
      disabled={!valid || pending}
    >
      {children}
    </AlertDialogAction>
  );
}

export function CaptchaSaveButton({
  valid,
  pending,
  disabled,
  onClick,
  children,
}: {
  valid: boolean;
  pending?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      disabled={!valid || pending || disabled}
    >
      {children}
    </Button>
  );
}
