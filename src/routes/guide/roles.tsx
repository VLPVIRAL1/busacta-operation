import { createFileRoute } from "@tanstack/react-router";
import { Check, Minus, Circle } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MODULE_LABEL } from "@/lib/routing/use-nav";
import { cn } from "@/lib/shared/utils";

export const Route = createFileRoute("/guide/roles")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin", "hr_manager", "employee"]}>
      <AppShell crumbs={[{ label: "Guide", to: "/guide" }, { label: "Roles & Permissions" }]}>
        <RolesPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

// ─── Role definitions ──────────────────────────────────────────────────────────

const ROLES = [
  {
    key: "super_admin" as const,
    label: "Super Admin",
    abbr: "SA",
    color: "bg-red-500/10 text-red-700 border-red-200",
    headerColor: "bg-red-50 text-red-800",
    desc: "Unrestricted access across every firm, feature, and setting. Reserved for platform-level administrators.",
    typicalUser: "IT or platform owner",
  },
  {
    key: "admin" as const,
    label: "Admin",
    abbr: "AD",
    color: "bg-orange-500/10 text-orange-700 border-orange-200",
    headerColor: "bg-orange-50 text-orange-800",
    desc: "Full control within the firm — manages users, configures settings, and can perform any operation.",
    typicalUser: "Office manager, partner",
  },
  {
    key: "hr_manager" as const,
    label: "HR Manager",
    abbr: "HR",
    color: "bg-teal-500/10 text-teal-700 border-teal-200",
    headerColor: "bg-teal-50 text-teal-800",
    desc: "Manages HR, payroll, and training — attends to staff records, leave, and course assignments.",
    typicalUser: "HR officer, people manager",
  },
  {
    key: "employee" as const,
    label: "Employee",
    abbr: "EM",
    color: "bg-green-500/10 text-green-700 border-green-200",
    headerColor: "bg-green-50 text-green-800",
    desc: "Day-to-day staff — complete tasks, log time, view own HR data, and respond to organizer forms.",
    typicalUser: "Junior accountant, bookkeeper",
  },
  {
    key: "client" as const,
    label: "Client",
    abbr: "CL",
    color: "bg-slate-500/10 text-slate-700 border-slate-200",
    headerColor: "bg-slate-50 text-slate-800",
    desc: "External client — limited to the Client Portal to view their projects and sign documents.",
    typicalUser: "Client representative",
  },
] as const;

type RoleKey = (typeof ROLES)[number]["key"];
type AccessLevel = "full" | "partial" | "none";

// ─── Hub access matrix ─────────────────────────────────────────────────────────
// "full"    = complete access to all features in this hub
// "partial" = limited access (see explanations below)
// "none"    = hub is not visible or accessible

const HUB_ACCESS: Record<string, Record<RoleKey, AccessLevel>> = {
  dashboard: {
    super_admin: "full",
    admin: "full",
    hr_manager: "full",
    employee: "full",
    client: "none",
  },
  ops: {
    super_admin: "full",
    admin: "full",
    hr_manager: "full",
    employee: "full",
    client: "none",
  },
  clients: {
    super_admin: "full",
    admin: "full",
    hr_manager: "none",
    employee: "partial",
    client: "none",
  },
  hr: {
    super_admin: "full",
    admin: "full",
    hr_manager: "full",
    employee: "partial",
    client: "none",
  },
  learning: {
    super_admin: "full",
    admin: "full",
    hr_manager: "full",
    employee: "full",
    client: "none",
  },
  organizer: {
    super_admin: "full",
    admin: "full",
    hr_manager: "full",
    employee: "partial",
    client: "none",
  },
  esign: {
    super_admin: "full",
    admin: "full",
    hr_manager: "none",
    employee: "none",
    client: "none",
  },
  email: {
    super_admin: "full",
    admin: "full",
    hr_manager: "none",
    employee: "none",
    client: "none",
  },
  communication: {
    super_admin: "full",
    admin: "full",
    hr_manager: "full",
    employee: "full",
    client: "partial",
  },
  growth: {
    super_admin: "full",
    admin: "full",
    hr_manager: "none",
    employee: "none",
    client: "none",
  },
  admin: {
    super_admin: "full",
    admin: "full",
    hr_manager: "none",
    employee: "none",
    client: "none",
  },
  guide: {
    super_admin: "full",
    admin: "full",
    hr_manager: "full",
    employee: "full",
    client: "none",
  },
  portal: {
    super_admin: "full",
    admin: "partial",
    hr_manager: "none",
    employee: "none",
    client: "full",
  },
};

// Explanations for partial access cells
const PARTIAL_NOTES: { hub: string; role: RoleKey; note: string }[] = [
  {
    hub: "clients",
    role: "employee",
    note: "Can view firm details and contact lists, but cannot create, edit, or delete client records.",
  },
  {
    hub: "hr",
    role: "employee",
    note: "Can view and update their own profile, submit leave requests, and see their own attendance — but cannot view or manage other employees.",
  },
  {
    hub: "organizer",
    role: "employee",
    note: "Can complete and submit organizer forms assigned to them, but cannot create templates or deploy forms to others.",
  },
  {
    hub: "communication",
    role: "client",
    note: "Clients using the portal can message their assigned account team through a dedicated client channel — they cannot access internal staff channels or direct messages.",
  },
  {
    hub: "portal",
    role: "admin",
    note: "Admins can configure and manage the client portal (set up access, view activity) but do not use it as a client would.",
  },
];

// ─── Access indicator ──────────────────────────────────────────────────────────

function AccessCell({ level }: { level: AccessLevel }) {
  if (level === "full") {
    return (
      <span className="flex items-center justify-center">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-700">
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      </span>
    );
  }
  if (level === "partial") {
    return (
      <span className="flex items-center justify-center">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <Circle className="h-3 w-3 fill-amber-400 text-amber-500" />
        </span>
      </span>
    );
  }
  return (
    <span className="flex items-center justify-center">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground/50">
        <Minus className="h-3.5 w-3.5" />
      </span>
    </span>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

function RolesPage() {
  const hubKeys = Object.keys(HUB_ACCESS);

  // Group partial notes by hub
  const partialByHub: Record<string, typeof PARTIAL_NOTES> = {};
  for (const n of PARTIAL_NOTES) {
    if (!partialByHub[n.hub]) partialByHub[n.hub] = [];
    partialByHub[n.hub].push(n);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Roles & Permissions"
        description="BusAcTa Operations has five access roles. Each role determines which hubs a user can see and what they can do inside them."
      />

      {/* Role cards */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          The 5 Roles
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((r) => (
            <Card key={r.key} className="overflow-hidden">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-xs font-semibold", r.color)}>
                    {r.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{r.typicalUser}</span>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <p className="text-xs text-muted-foreground">{r.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Permission matrix */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Hub Access Matrix
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Which hubs each role can access.{" "}
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-green-100 text-green-700">
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>{" "}
            Full access
          </span>
          {" · "}
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Circle className="h-2.5 w-2.5 fill-amber-400" />
            </span>{" "}
            Partial (see notes)
          </span>
          {" · "}
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground/50">
              <Minus className="h-2.5 w-2.5" />
            </span>{" "}
            No access
          </span>
        </p>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-36 text-xs">Hub</TableHead>
                  {ROLES.map((r) => (
                    <TableHead
                      key={r.key}
                      className={cn(
                        "min-w-[88px] text-center text-xs font-semibold",
                        r.headerColor,
                      )}
                    >
                      {r.abbr}
                      <div className="text-[10px] font-normal opacity-75">{r.label}</div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {hubKeys.map((hubKey) => {
                  const access = HUB_ACCESS[hubKey];
                  const hasPartial = ROLES.some((r) => access[r.key] === "partial");
                  return (
                    <TableRow key={hubKey} className={cn(hasPartial && "bg-amber-50/40")}>
                      <TableCell className="py-2 text-xs font-medium">
                        {MODULE_LABEL[hubKey as keyof typeof MODULE_LABEL] ?? hubKey}
                      </TableCell>
                      {ROLES.map((r) => (
                        <TableCell key={r.key} className="py-2 text-center">
                          <AccessCell level={access[r.key]} />
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </section>

      {/* Partial access explanations */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          What "partial access" means
        </h2>
        <Accordion type="multiple" className="space-y-2">
          {Object.entries(partialByHub).map(([hub, notes]) => (
            <AccordionItem
              key={hub}
              value={hub}
              className="rounded-lg border bg-card px-0 shadow-sm"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-3 text-left">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <Circle className="h-3 w-3 fill-amber-400" />
                  </span>
                  <span className="font-semibold text-sm">
                    {MODULE_LABEL[hub as keyof typeof MODULE_LABEL] ?? hub}
                  </span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {notes.length} role{notes.length > 1 ? "s" : ""} with limited access
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-3">
                  {notes.map((n) => {
                    const role = ROLES.find((r) => r.key === n.role);
                    return (
                      <div key={n.role} className="flex items-start gap-3">
                        <Badge
                          variant="outline"
                          className={cn("mt-0.5 shrink-0 text-xs", role?.color)}
                        >
                          {role?.label}
                        </Badge>
                        <p className="text-sm text-muted-foreground">{n.note}</p>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Note about super_admin */}
      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div>
            <strong className="text-foreground">Super Admin</strong> always has full access to every
            hub and feature — including cross-firm visibility. This role is reserved for platform
            administrators and should not be assigned to regular staff.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
