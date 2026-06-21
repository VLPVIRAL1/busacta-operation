import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Banknote, Users, CalendarClock, CalendarCheck } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { PayrollDashboard } from "@/components/hr/payroll-dashboard";
import { PayrollEmployeeSetup } from "@/components/hr/payroll-employee-setup";
import { AttendancePoliciesCard } from "@/components/hr/attendance-policies-card";
import { HolidayCalendarSection } from "@/components/hr/holiday-calendar-section";
import { cn } from "@/lib/shared/utils";

type PayrollView = "runs" | "employees" | "attendance" | "holidays";
const VIEW_KEY = "hr.payroll.view";
const VALID_VIEWS: PayrollView[] = ["runs", "employees", "attendance", "holidays"];

type PayrollSearch = { view?: PayrollView };

export const Route = createFileRoute("/hr/payroll/")({
  validateSearch: (search: Record<string, unknown>): PayrollSearch => {
    const v = search.view;
    return {
      view:
        typeof v === "string" && (VALID_VIEWS as string[]).includes(v)
          ? (v as PayrollView)
          : undefined,
    };
  },
  component: () => (
    <AuthGuard allow={["super_admin", "hr_manager"]}>
      <AppShell crumbs={[{ label: "Human Resources", to: "/hr/employees" }, { label: "Payroll" }]}>
        <PayrollPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

function PayrollPage() {
  const search = Route.useSearch();
  const [view, setView] = useState<PayrollView>(() => {
    // ?view= search param wins on initial render; else fall back to localStorage; else "runs"
    if (search.view) return search.view;
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved && (VALID_VIEWS as string[]).includes(saved)) return saved as PayrollView;
    } catch {
      /* ignore */
    }
    return "runs";
  });

  // If URL view changes (e.g. redirect from old /setup or /holidays routes), sync it
  useEffect(() => {
    if (search.view && search.view !== view) {
      setView(search.view);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.view]);

  const handleView = (v: PayrollView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* View switcher */}
      <div className="shrink-0 flex items-center gap-1 border-b px-4 py-1.5 bg-background/60">
        <ViewTab
          active={view === "runs"}
          onClick={() => handleView("runs")}
          icon={<Banknote className="h-3.5 w-3.5" />}
          label="Payroll Runs"
        />
        <ViewTab
          active={view === "employees"}
          onClick={() => handleView("employees")}
          icon={<Users className="h-3.5 w-3.5" />}
          label="Employee Setup"
        />
        <ViewTab
          active={view === "attendance"}
          onClick={() => handleView("attendance")}
          icon={<CalendarClock className="h-3.5 w-3.5" />}
          label="Attendance Policies"
        />
        <ViewTab
          active={view === "holidays"}
          onClick={() => handleView("holidays")}
          icon={<CalendarCheck className="h-3.5 w-3.5" />}
          label="Holiday Calendar"
        />
      </div>

      {/* Active view */}
      {view === "runs" && <PayrollDashboard />}
      {view === "employees" && <PayrollEmployeeSetup />}
      {view === "attendance" && <AttendancePoliciesCard />}
      {view === "holidays" && <HolidayCalendarSection />}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
