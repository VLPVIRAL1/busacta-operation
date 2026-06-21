import { Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/shared/utils";

/**
 * WhatsApp-style delivery state for an outgoing message.
 * - "sent": single grey check (server accepted the row)
 * - "delivered": double grey check (at least one other recipient has the row visible)
 * - "read": double blue check (at least one other recipient has seen the row)
 */
export type DeliveryState = "sent" | "delivered" | "read";

export function ReadTicks({ state, className }: { state: DeliveryState; className?: string }) {
  if (state === "sent") {
    return <Check aria-label="Sent" className={cn("h-3 w-3 opacity-70", className)} />;
  }
  return (
    <CheckCheck
      aria-label={state === "read" ? "Read" : "Delivered"}
      className={cn("h-3 w-3", state === "read" ? "text-sky-400" : "opacity-70", className)}
    />
  );
}
