import { createFileRoute, stripSearchParams, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { Building2, ChevronDown, User, UserPlus } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { FirmOnboardingWizard } from "@/components/firm-hub/onboarding/firm-wizard";
import { DirectClientOnboardingModal } from "@/components/direct-clients/direct-client-onboarding-modal";
import { ClientsSplitView } from "@/components/clients/clients-split-view";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth/auth-context";
import { clientsIndexDefaults, clientsIndexSearchSchema } from "./_search";

type NewKind = "firm" | "direct";

export const Route = createFileRoute("/clients/")({
  validateSearch: zodValidator(clientsIndexSearchSchema),
  search: {
    middlewares: [
      stripSearchParams({
        stream: clientsIndexDefaults.stream,
        status: clientsIndexDefaults.status,
        q: clientsIndexDefaults.q,
      }),
    ],
  },
  component: ClientsHubPage,
  errorComponent: RouteErrorComponent,
});

function ClientsHubPage() {
  const { new: newKind } = Route.useSearch();
  const { roles } = useAuth();
  const navigate = useNavigate();
  const canFirm = roles.some((r) => r === "super_admin" || r === "admin");
  const canDirect = roles.some((r) => r === "super_admin" || r === "admin" || r === "employee");

  const setNew = (kind: NewKind | undefined) =>
    navigate({
      to: "/clients",
      search: (prev: Record<string, unknown>) => ({ ...prev, new: kind }),
      replace: true,
    });

  return (
    <AuthGuard allow={["super_admin", "admin", "employee"]}>
      <AppShell crumbs={[{ label: "Clients" }]} fullBleed>
        <div className="h-full min-h-0 p-3">
          <ClientsSplitView
            toolbarAction={
              <NewClientMenu canFirm={canFirm} canDirect={canDirect} onPick={(k) => setNew(k)} />
            }
          />
        </div>

        {/* Triggerless modals — fully controlled by the `?new=` URL param so
            closing (Esc, overlay click, X) clears the URL and browser
            Back/Forward toggles the modal naturally. */}
        {canFirm && (
          <FirmOnboardingWizard
            hideTrigger
            open={newKind === "firm"}
            onOpenChange={(o) => {
              if (!o && newKind === "firm") setNew(undefined);
            }}
          />
        )}
        {canDirect && (
          <DirectClientOnboardingModal
            hideTrigger
            open={newKind === "direct"}
            onOpenChange={(o) => {
              if (!o && newKind === "direct") setNew(undefined);
            }}
          />
        )}
      </AppShell>
    </AuthGuard>
  );
}

function NewClientMenu({
  canFirm,
  canDirect,
  onPick,
}: {
  canFirm: boolean;
  canDirect: boolean;
  onPick: (k: NewKind) => void;
}) {
  if (!canFirm && !canDirect) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <UserPlus className="h-4 w-4" />
          New Client
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {canFirm && (
          <DropdownMenuItem onSelect={() => onPick("firm")} className="gap-2">
            <Building2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">B2B Firm</span>
              <span className="text-[11px] text-muted-foreground">
                B2B · Firm → Projects → Tasks
              </span>
            </div>
          </DropdownMenuItem>
        )}
        {canDirect && (
          <DropdownMenuItem onSelect={() => onPick("direct")} className="gap-2">
            <User className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">B2C Client</span>
              <span className="text-[11px] text-muted-foreground">B2C · Client → Tasks</span>
            </div>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
