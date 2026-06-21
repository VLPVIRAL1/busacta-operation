import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ArrowRight, HelpCircle, Route as RouteIcon, Trophy } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/learning/")({
  component: () => (
    <AuthGuard allow={["admin", "super_admin", "hr_manager", "employee"]}>
      <AppShell crumbs={[{ label: "Learning & Training" }]}>
        <LearningDashboard />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

const TILES = [
  {
    title: "Courses & Certifications",
    description: "Manage course assignments, status updates, and CPE credit tracking.",
    to: "/learning/courses",
    Icon: BookOpen,
  },
  {
    title: "Training Paths",
    description: "Curated learning curricula — group courses into structured programs.",
    to: "/learning/paths",
    Icon: RouteIcon,
  },
  {
    title: "Office Hours Q&A",
    description: "Post technical questions and build a searchable knowledge bank of answers.",
    to: "/learning/qa",
    Icon: HelpCircle,
  },
  {
    title: "Leaderboard",
    description: "Track firm-wide training completion rates and CPE progress.",
    to: "/learning/leaderboard",
    Icon: Trophy,
  },
] as const;

function LearningDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Learning & Training"
        description="Independent hub for staff development — courses, certifications, and continuing education. Fully separate from HR records."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TILES.map(({ title, description, to, Icon }) => (
          <Link key={to} to={to as never} className="group">
            <Card className="h-full transition-all hover:border-primary/40 hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <div>
                  <div className="text-base font-semibold">{title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
