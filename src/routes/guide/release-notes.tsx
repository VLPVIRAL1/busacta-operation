import { createFileRoute } from "@tanstack/react-router";
import { Rocket, Star, Wrench, Zap, Server } from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/shared/utils";

export const Route = createFileRoute("/guide/release-notes")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin", "hr_manager", "employee"]}>
      <AppShell crumbs={[{ label: "Guide", to: "/guide" }, { label: "Release Notes" }]}>
        <ReleaseNotesPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

// ─── Types & data ──────────────────────────────────────────────────────────────

type Category = "Features" | "Improvements" | "Fixes" | "Infrastructure";

type ReleaseDetail = {
  category: Category;
  items: string[];
};

type Release = {
  version: string;
  date: string;
  title: string;
  tag: string;
  highlights: string[];
  details: ReleaseDetail[];
};

const CATEGORY_CONFIG: Record<
  Category,
  { icon: React.ElementType; color: string; badgeColor: string }
> = {
  Features: {
    icon: Star,
    color: "text-blue-600",
    badgeColor: "bg-blue-500/10 text-blue-700 border-blue-200",
  },
  Improvements: {
    icon: Zap,
    color: "text-green-600",
    badgeColor: "bg-green-500/10 text-green-700 border-green-200",
  },
  Fixes: {
    icon: Wrench,
    color: "text-amber-600",
    badgeColor: "bg-amber-500/10 text-amber-700 border-amber-200",
  },
  Infrastructure: {
    icon: Server,
    color: "text-slate-600",
    badgeColor: "bg-slate-500/10 text-slate-700 border-slate-200",
  },
};

const RELEASES: Release[] = [
  {
    version: "1.8",
    date: "June 2026",
    tag: "Latest",
    title: "Payroll & Workload Management",
    highlights: [
      "Full payroll module: salary structures, leave policies, holiday calendars, and payroll runs with gross/net calculations.",
      "Workload management view — see capacity vs. assigned tasks across your whole team at a glance.",
      "Weekly capacity tracking on employee profiles.",
    ],
    details: [
      {
        category: "Features",
        items: [
          "Payroll runs: create, approve, and export monthly payroll for all employees.",
          "Salary structure templates: define pay components (basic, allowances, deductions) and apply them to staff.",
          "Leave policy engine: configure annual, sick, and other leave types with carry-over rules per firm.",
          "Holiday calendar: maintain public holidays per firm for accurate leave and payroll calculations.",
          "Workload page (/ops/workload): visual capacity board showing assigned vs. available hours per team member.",
          "Weekly capacity field on employee profiles — set planned working hours per week.",
        ],
      },
      {
        category: "Infrastructure",
        items: [
          "Four new database migrations for payroll tables (salary structures, leave policies, holidays, payroll runs).",
          "Weekly capacity column added to the profiles table.",
          "Cloudflare Workers deploy workflow added to CI pipeline.",
        ],
      },
    ],
  },
  {
    version: "1.7",
    date: "June 2026",
    tag: "Major",
    title: "Learning Engine",
    highlights: [
      "Full learning and training hub: courses, structured learning paths, Q&A boards, and a staff leaderboard.",
      "Assignment engine: HR managers can assign courses to employees with due dates and track completion.",
      "News feed for internal announcements.",
    ],
    details: [
      {
        category: "Features",
        items: [
          "Training library: create, publish, and manage e-learning courses with multimedia content.",
          "Learning paths: chain courses together into structured programmes employees work through in order.",
          "Q&A board: staff can post professional questions and answer colleagues' queries, earning leaderboard points.",
          "Leaderboard: gamified ranking of staff by learning activity — courses completed, Q&A answered, assessments passed.",
          "Course assignments: assign specific courses to individuals or groups with due dates.",
          "News feed: publish internal announcements visible to all staff on the learning landing page.",
          "SharePoint integration for course content delivery.",
        ],
      },
      {
        category: "Improvements",
        items: [
          "Learning hub now appears in the main navigation for admin, HR manager, and employee roles.",
          "Profile pages show learning completion stats.",
        ],
      },
      {
        category: "Infrastructure",
        items: [
          "New database tables: training_courses, training_assignments, learning_paths, qa_posts, leaderboard_scores, news_items.",
          "Supabase types regenerated.",
        ],
      },
    ],
  },
  {
    version: "1.6",
    date: "May 2026",
    tag: "Major",
    title: "Daily Notes, Reminders & Ops Templates Workspace",
    highlights: [
      "Daily notes enhanced with colour coding and pinning — your personal work journal.",
      "Reminders now support recurring schedules (daily, weekly, monthly).",
      "Operations templates workspace: manage task and project templates in a dedicated area.",
      "Today Agenda view on the dashboard.",
    ],
    details: [
      {
        category: "Features",
        items: [
          "Daily notes: colour tags (7 colours) and pin-to-top support.",
          "Daily notes: slash-command toolbar for quick formatting.",
          "Personal reminders: recurring support with daily, weekly, and monthly options.",
          "Ops templates workspace: create and manage reusable task templates directly within the ops hub.",
          "Today Agenda: dashboard widget showing today's tasks, reminders, and open points in one place.",
        ],
      },
      {
        category: "Improvements",
        items: [
          "Rich editor updated with improved command palette.",
          "Block palette in the organizer expanded with new block types.",
          "Preview drawer in organizer now shows live form preview.",
          "News feed and training library components polished.",
        ],
      },
      {
        category: "Fixes",
        items: [
          "Fixed daily note editor losing unsaved content on navigation.",
          "Resolved reminder notification not firing for same-day reminders.",
        ],
      },
    ],
  },
  {
    version: "1.5",
    date: "May 2026",
    tag: "Major",
    title: "HR Module — Profiles, Permissions & Compensation",
    highlights: [
      "Inline employee profile editing — no more pop-up sheets.",
      "New Permissions and Compensation tabs on every employee profile.",
      "Attendance import with mapping presets.",
    ],
    details: [
      {
        category: "Features",
        items: [
          "Employee profiles now fully editable inline — fields activate on click.",
          "Permissions tab: manage hub access and role assignments per employee.",
          "Compensation tab: salary history, pay frequency, and benefits notes.",
          "Attendance import: upload attendance spreadsheets with a column mapping wizard.",
          "Mapping presets: save and reuse column mappings for repeat imports from the same source.",
          "Leave request workflow: submit, approve, and decline leave from the HR hub.",
          "Tardiness tracking: flag late arrivals automatically from attendance data.",
        ],
      },
      {
        category: "Improvements",
        items: [
          "Employee directory now loads significantly faster for large firms.",
          "HR hub navigation restructured for clarity.",
        ],
      },
      {
        category: "Infrastructure",
        items: [
          "Database migrations for staff_compensation, attendance_import_mapping_presets.",
          "Profiles weekly capacity column (migrated in v1.8).",
        ],
      },
    ],
  },
  {
    version: "1.4",
    date: "May 2026",
    tag: "Major",
    title: "Organizer — Smart Form Engine",
    highlights: [
      "Full form builder: drag-and-drop blocks, sections, tables, and file requests.",
      "Deploy forms to clients or staff with shareable public links.",
      "Response review workflow with per-answer approval.",
    ],
    details: [
      {
        category: "Features",
        items: [
          "Template builder: create multi-section questionnaires with 8+ block types.",
          "Version control: templates are versioned so historical responses are preserved when a form is updated.",
          "Deployment engine: send forms to named recipients with due dates and progress tracking.",
          "Public link sharing: generate a link so clients can respond without a BusAcTa Operations account.",
          "Response review: mark individual answers as reviewed, request clarification, or approve.",
          "Organizer analytics: response rates, completion times, and outstanding deployments at a glance.",
          "Folder template deployments: auto-create document library structures when an organizer is deployed.",
        ],
      },
      {
        category: "Infrastructure",
        items: [
          "New tables: organizer_templates, organizer_template_versions, organizer_blocks, organizer_deployments, organizer_responses, organizer_public_links, organizer_review_audit_log.",
        ],
      },
    ],
  },
  {
    version: "1.3",
    date: "May 2026",
    tag: "Major",
    title: "E-Signature Module",
    highlights: [
      "Full digital signing workflow: upload PDFs, place signature fields, and send to multiple signatories.",
      "Tamper-proof audit trail on every document.",
      "Automated expiry reminders and completed document archiving.",
    ],
    details: [
      {
        category: "Features",
        items: [
          "Signing envelopes: group one or more documents in a single signing package.",
          "Field placement editor: drag signature, initials, date, and text fields onto any page.",
          "Multi-signatory support: define signing order and role (signer, approver, viewer) per recipient.",
          "Email delivery: recipients receive a signing link by email — no account required.",
          "Audit trail: every open, sign, and decline event is logged with timestamp and IP address.",
          "Automated reminders: send chasing emails to unsigned recipients before expiry.",
          "Completed document archive: finished envelopes are stored in the document library.",
        ],
      },
      {
        category: "Infrastructure",
        items: [
          "New tables: esign_envelopes, esign_documents, esign_recipients, esign_fields, esign_field_values, esign_page_layouts, esign_audit_log, esign_completed_documents, esign_templates.",
          "Cron endpoint for expiry processing and reminder emails.",
        ],
      },
    ],
  },
  {
    version: "1.1",
    date: "May 2026",
    tag: "Foundation",
    title: "Operations Hub — Projects, Tasks & Time",
    highlights: [
      "Core project and task management: firms → projects → tasks → subtasks.",
      "Open points tracking for unresolved questions on tasks.",
      "Time logging, pipeline Kanban, and operations reporting.",
    ],
    details: [
      {
        category: "Features",
        items: [
          "Firm and project management: full CRUD with billing method, status, and entity support.",
          "Task management: assign tasks with priority, status, reviewer, and due date.",
          "Subtasks and action items (open points) with resolution tracking.",
          "Task messages: in-task chat with @mentions and notifications.",
          "Time logging: log billable and non-billable hours per task.",
          "Pipeline: Kanban view of all projects by stage.",
          "Operating cycle: five-tier, ten-station daily workflow guide.",
          "Report centre: time analysis, project summaries, and staff productivity.",
          "Task templates: create reusable task lists for recurring engagement types.",
          "Global search: search across firms, projects, tasks, and open points.",
          "Keyboard shortcuts: hub navigation and task management shortcuts.",
        ],
      },
      {
        category: "Infrastructure",
        items: [
          "Core tables: firms, projects, tasks, task_subtasks, task_action_items, time_logs, task_attachments, task_messages.",
          "TanStack Router file-based routing established.",
          "Supabase RLS configured for all core tables.",
        ],
      },
    ],
  },
  {
    version: "1.0",
    date: "May 2026",
    tag: "Launch",
    title: "Platform Launch",
    highlights: [
      "Initial platform launch with authentication, multi-firm support, and six access roles.",
      "Admin hub: user management, access control, integrations, MFA enforcement, and audit logs.",
      "Communication hub: team channels, direct messages, and real-time presence.",
    ],
    details: [
      {
        category: "Features",
        items: [
          "User authentication with Supabase Auth — email/password login.",
          "Multi-factor authentication (MFA): TOTP app, email OTP, and backup codes.",
          "Five access roles: Super Admin, Admin, HR Manager, Employee, Client.",
          "Multi-firm architecture: one login, multiple client firms.",
          "Admin hub: user management, role assignment, hub permissions.",
          "Integrations: Microsoft 365 / SharePoint, email account connections.",
          "Audit logs and security event tracking.",
          "Communication hub: channels, direct messages, reactions, message stars and snoozes.",
          "Document library with folder templates.",
          "Notification system with per-user preference controls.",
          "Light, dark, and system theme support.",
          "Desktop app (Electron) and mobile app (Capacitor) shell.",
          "Guide hub: manual, workflows, keyboard shortcuts, sitemap, FAQ.",
        ],
      },
      {
        category: "Infrastructure",
        items: [
          "TanStack Start SSR on Cloudflare Workers.",
          "Supabase PostgreSQL with Row-Level Security on all tables.",
          "CI/CD pipeline to Cloudflare Workers.",
          "Electron app with busacta:// deep-link protocol.",
          "Capacitor mobile app scaffolding (iOS + Android).",
        ],
      },
    ],
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────

const TAG_COLOR: Record<string, string> = {
  Latest: "bg-green-500/10 text-green-700 border-green-200",
  Major: "bg-blue-500/10 text-blue-700 border-blue-200",
  Foundation: "bg-violet-500/10 text-violet-700 border-violet-200",
  Launch: "bg-orange-500/10 text-orange-700 border-orange-200",
};

function ReleaseNotesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Release Notes"
        description="A history of every major release — what was built, improved, and fixed."
      />

      <div className="relative">
        {/* Timeline spine */}
        <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" aria-hidden />

        <div className="space-y-6">
          {RELEASES.map((release, idx) => (
            <div key={release.version} className="relative pl-12">
              {/* Version circle on the spine */}
              <span
                className={cn(
                  "absolute left-0 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-background text-xs font-bold",
                  idx === 0 ? "border-primary text-primary" : "border-border text-muted-foreground",
                )}
              >
                {release.version}
              </span>

              <Card className={cn("overflow-hidden", idx === 0 && "ring-1 ring-primary/20")}>
                {/* Release header */}
                <div className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-4 py-3">
                  <Rocket
                    className={cn(
                      "h-4 w-4 shrink-0",
                      idx === 0 ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-semibold">{release.title}</span>
                      <Badge
                        variant="outline"
                        className={cn("text-xs", TAG_COLOR[release.tag] ?? "")}
                      >
                        {release.tag}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{release.date}</div>
                  </div>
                </div>

                <CardContent className="p-4 space-y-4">
                  {/* Highlights */}
                  <ul className="space-y-1.5">
                    {release.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        {h}
                      </li>
                    ))}
                  </ul>

                  {/* Expandable full details */}
                  <Accordion type="single" collapsible>
                    <AccordionItem value="details" className="border-0">
                      <AccordionTrigger className="py-1.5 text-xs text-muted-foreground hover:no-underline">
                        Full details
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4 pt-2">
                          {release.details.map((section) => {
                            const cfg = CATEGORY_CONFIG[section.category];
                            const Icon = cfg.icon;
                            return (
                              <div key={section.category}>
                                <div className="mb-2 flex items-center gap-2">
                                  <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
                                  <Badge
                                    variant="outline"
                                    className={cn("text-[10px]", cfg.badgeColor)}
                                  >
                                    {section.category}
                                  </Badge>
                                </div>
                                <ul className="space-y-1 pl-5">
                                  {section.items.map((item) => (
                                    <li
                                      key={item}
                                      className="list-disc text-xs text-muted-foreground marker:text-muted-foreground/50"
                                    >
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
