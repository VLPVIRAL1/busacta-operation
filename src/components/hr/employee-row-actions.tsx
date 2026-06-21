import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MoreVertical, CalendarClock, ShieldCheck, Mail, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { verifyEmployeePortalLockout } from "@/lib/hr/employees.functions";
import { resendEmployeeInvite } from "@/lib/hr/invites.functions";

export function EmployeeRowActions(props: {
  employeeId: string;
  isActive: boolean;
  currentStatus?: string;
}) {
  const { employeeId } = props;

  const verifyFn = useServerFn(verifyEmployeePortalLockout);
  const resendFn = useServerFn(resendEmployeeInvite);

  const verify = useMutation({
    mutationFn: async () => verifyFn({ data: { userId: employeeId } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Portal lockout verified — no portal access vectors found.");
      else toast.error(`Lockout issues: ${r.issues.join("; ")}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Verification failed"),
  });

  const resend = useMutation({
    mutationFn: async (kind: "invite" | "recovery") =>
      resendFn({ data: { profileId: employeeId, kind } }),
    onSuccess: (r, kind) => {
      if (r.ok) {
        toast.success(
          kind === "invite"
            ? `Invitation email sent to ${r.email}`
            : `Password reset email sent to ${r.email}`,
        );
      } else {
        toast.error(r.reason ?? "Couldn't send email");
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Email send failed"),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Employee actions" title="Actions">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => verify.mutate()} disabled={verify.isPending}>
            <ShieldCheck className="h-4 w-4 mr-2" /> Verify portal lockout
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`/hr/attendance?employee=${employeeId}`}>
              <CalendarClock className="h-4 w-4 mr-2" /> View attendance
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => resend.mutate("invite")} disabled={resend.isPending}>
            <Mail className="h-4 w-4 mr-2" /> Resend invitation
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => resend.mutate("recovery")} disabled={resend.isPending}>
            <KeyRound className="h-4 w-4 mr-2" /> Send password reset
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
