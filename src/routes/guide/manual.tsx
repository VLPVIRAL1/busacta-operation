import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { AuthGuard } from "@/components/auth/auth-guard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Building2,
  ListTodo,
  Clock,
  BarChart3,
  Bell,
  MessagesSquare,
  Activity,
  Users,
  Settings,
  ShieldCheck,
  Filter,
  Save,
  Star,
  Search,
  BookOpen,
  PlayCircle,
  CheckCircle2,
  Sparkles,
  Kanban,
  ListChecks,
  CalendarSearch,
  Palette,
  ScrollText,
  HelpCircle,
} from "lucide-react";

export const Route = createFileRoute("/guide/manual")({
  head: () => ({
    meta: [
      { title: "User Guide — TaxOps Suite" },
      {
        name: "description",
        content:
          "Complete user guide and interactive walkthrough for TaxOps Suite — dashboards, firms, projects, tasks, time tracking, reports, admin and FAQs.",
      },
      { property: "og:title", content: "User Guide — TaxOps Suite" },
      {
        property: "og:description",
        content: "Step-by-step walkthrough and FAQs for the TaxOps Suite operations platform.",
      },
      { property: "og:url", content: "https://one.busacta.com/guide/manual" },
    ],
    links: [{ rel: "canonical", href: "https://one.busacta.com/guide/manual" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: HelpPage,
});

type Section = {
  id: string;
  title: string;
  icon: typeof LayoutDashboard;
  summary: string;
  audience: string[];
  steps: { title: string; body: string }[];
  tips?: string[];
  link?: { to: string; label: string };
};

const SECTIONS: Section[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    icon: LayoutDashboard,
    summary: "Your daily landing page — quick stats, upcoming deadlines, and what needs attention.",
    audience: ["admin", "employee", "client"],
    steps: [
      {
        title: "Read the KPI cards",
        body: "Top cards summarize active firms, projects, open tasks, and overdue items. Click any card to drill into the matching list.",
      },
      {
        title: "Scan upcoming work",
        body: "The 'Upcoming' panel shows tasks due in the next 7 days, sorted by due date. Hover a row to see the assignee and project.",
      },
      {
        title: "Open recent activity",
        body: "Recent activity shows the last actions across your firms. Use it as a daily standup feed.",
      },
    ],
    tips: [
      "If the dashboard feels empty, your role may not have firms assigned. Ask an admin to invite you to a firm.",
    ],
    link: { to: "/global-dashboard", label: "Open Dashboard" },
  },
  {
    id: "firms",
    title: "Firms",
    icon: Building2,
    summary:
      "Top-level workspace per B2B firm. Each firm has its own clients, projects, pipeline and team.",
    audience: ["admin", "employee"],
    steps: [
      {
        title: "Create a firm",
        body: "Click 'New firm', set name, type and primary contact. The firm appears in the left list immediately.",
      },
      {
        title: "Edit a firm inline",
        body: "Press the edit icon — the right-hand drawer opens with all editable fields (no popup). Save to persist.",
      },
      {
        title: "Switch into a firm",
        body: "Click the firm row to enter its workspace: Clients, Projects, Pipeline, Communication, SOPs, Activity, Timesheet.",
      },
    ],
    link: { to: "/ops/firms", label: "Open Firms" },
  },
  {
    id: "tasks",
    title: "Tasks & To-Do",
    icon: ListTodo,
    summary:
      "The atomic unit of work. Each task has assignee, reviewer, dates, status and a discussion.",
    audience: ["admin", "employee", "client"],
    steps: [
      {
        title: "View a task",
        body: "Open any task to see Discussion, Notes, Links, Time Logs and a read-only assignee/reviewer panel at the top.",
      },
      {
        title: "Edit a task",
        body: "Press 'Edit'. The drawer lets you change Assignee, Reviewer, Due date, Start date and Completion date — these are NOT editable on the main view to prevent accidental changes.",
      },
      {
        title: "Use the To-Do page",
        body: "/ops/todos shows everything assigned to you across all firms. Filter by status and due date.",
      },
    ],
    tips: [
      "Completion date auto-fills when you mark a task Done, but you can override it from the Edit drawer.",
    ],
    link: { to: "/ops/todos", label: "Open To-Do" },
  },
  {
    id: "pipeline",
    title: "Pipeline",
    icon: Kanban,
    summary:
      "Kanban view of all projects across firms — drag cards between stages to update status.",
    audience: ["admin", "employee"],
    steps: [
      {
        title: "Drag a card",
        body: "Grab a project card and drop it into a new column to update its stage instantly.",
      },
      {
        title: "Filter the board",
        body: "Use the toolbar to filter by firm, owner or project type. Save filter presets for repeat views.",
      },
    ],
    link: { to: "/ops/pipeline", label: "Open Pipeline" },
  },
  {
    id: "communication",
    title: "Communication",
    icon: MessagesSquare,
    summary:
      "Threaded messages with clients and within your team. Internal threads are not visible to clients.",
    audience: ["admin", "employee", "client"],
    steps: [
      {
        title: "Pick a thread",
        body: "Threads are grouped by firm. Internal threads have a lock badge — only staff can see them.",
      },
      {
        title: "Send a message",
        body: "Type and hit Enter. Use @ to mention a teammate (they receive a notification).",
      },
    ],
    link: { to: "/ops/communication", label: "Open Communication" },
  },
  {
    id: "notifications",
    title: "Notifications",
    icon: Bell,
    summary: "Mentions, assignments, status changes and due-date reminders gathered in one feed.",
    audience: ["admin", "employee", "client"],
    steps: [
      {
        title: "Mark as read",
        body: "Click an item to jump to the source and mark it read. Bulk-mark from the toolbar.",
      },
      {
        title: "Filter",
        body: "Filter by type (mentions, assignments, due soon) and save your preferred filter as default.",
      },
    ],
    link: { to: "/ops/notifications", label: "Open Notifications" },
  },
  {
    id: "time-logs",
    title: "Time Logs",
    icon: Clock,
    summary: "Track time per task or project. Used for billing and capacity reporting.",
    audience: ["admin", "employee"],
    steps: [
      {
        title: "Log time",
        body: "From any task: 'Log time' → pick duration and note. Or use the Time Logs page to log against any project.",
      },
      {
        title: "Review weekly",
        body: "The Reports page rolls up time by user, firm and project type.",
      },
    ],
    link: { to: "/ops/time-logs", label: "Open Time Logs" },
  },
  {
    id: "reports",
    title: "Reports",
    icon: BarChart3,
    summary: "Capacity, throughput, deadline-risk and time-on-engagement charts.",
    audience: ["admin", "employee"],
    steps: [
      {
        title: "Pick a date range",
        body: "All charts respect the global date range picker at the top of the page.",
      },
      {
        title: "Export",
        body: "Click the download icon on any chart to export the underlying data as CSV.",
      },
    ],
    link: { to: "/ops/reports", label: "Open Reports" },
  },
  {
    id: "filters",
    title: "Filters & Saved Presets",
    icon: Filter,
    summary:
      "Every filterable page supports URL persistence and saved presets stored in your browser.",
    audience: ["admin", "employee", "client"],
    steps: [
      {
        title: "URL persistence",
        body: "Selecting filters updates the URL. Refresh, bookmark or share the link — the filtered view is preserved.",
      },
      {
        title: "Save a preset",
        body: "Click 'Save preset' in the filter bar, give it a name. It's stored locally in your browser.",
      },
      {
        title: "Set a default",
        body: "Click the star next to a preset to make it your default — it auto-applies whenever you open the page with no URL filters.",
      },
    ],
    tips: [
      "Presets are per-browser. Switching computers? Re-create them or copy the URL of a filtered view.",
    ],
  },
  {
    id: "templates",
    title: "Workflow Templates",
    icon: ListChecks,
    summary: "Reusable task lists. Apply a template to a new project to skip manual setup.",
    audience: ["admin", "employee"],
    steps: [
      {
        title: "Build a template",
        body: "Add tasks with default assignee role, relative due dates and dependencies.",
      },
      {
        title: "Apply to a project",
        body: "When creating a project, pick a template — all tasks are created with dates resolved against the project start date.",
      },
    ],
    link: { to: "/ops/templates", label: "Open Templates" },
  },
  {
    id: "admin",
    title: "Admin Area",
    icon: ShieldCheck,
    summary: "Team management, branding, security checks and system settings — admin role only.",
    audience: ["admin"],
    steps: [
      {
        title: "Team",
        body: "Invite users, assign roles (admin, employee, client) and scope client users to specific firms.",
      },
      {
        title: "Branding",
        body: "Upload a logo, set primary/accent colors and your firm name. Applies across the suite.",
      },
      {
        title: "Settings",
        body: "Tune notification defaults, time zone, working days, and feature toggles.",
      },
      {
        title: "Security",
        body: "RLS Verification, Security Issues, Audit Log and Go-Live Readiness — run before sharing the app outside your team.",
      },
    ],
    link: { to: "/admin/settings", label: "Open Settings" },
  },
];

function HelpPage() {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!query.trim()) return SECTIONS;
    const q = query.toLowerCase();
    return SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.steps.some(
          (st) => st.title.toLowerCase().includes(q) || st.body.toLowerCase().includes(q),
        ),
    );
  }, [query]);

  return (
    <AuthGuard>
      <AppShell>
        <div className="space-y-6 p-6 max-w-6xl mx-auto">
          <header className="space-y-2">
            <div className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              <h1 className="text-3xl font-semibold tracking-tight">User Guide</h1>
            </div>
            <p className="text-muted-foreground max-w-3xl">
              Everything you need to use TaxOps Suite end-to-end. Search, browse by section, or try
              the interactive checklists and live demos below.
            </p>
            <div className="relative max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the guide..."
                className="pl-9"
              />
            </div>
          </header>

          <Tabs defaultValue="guide" className="w-full">
            <TabsList>
              <TabsTrigger value="guide">
                <BookOpen className="h-4 w-4 mr-2" />
                Guide
              </TabsTrigger>
              <TabsTrigger value="quickstart">
                <PlayCircle className="h-4 w-4 mr-2" />
                Quick Start
              </TabsTrigger>
              <TabsTrigger value="interactive">
                <Sparkles className="h-4 w-4 mr-2" />
                Interactive
              </TabsTrigger>
              <TabsTrigger value="faq">
                <HelpCircle className="h-4 w-4 mr-2" />
                FAQ
              </TabsTrigger>
            </TabsList>

            {/* GUIDE */}
            <TabsContent value="guide" className="mt-6 space-y-4">
              {filtered.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground">
                    No matches for "{query}".
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {filtered.map((s) => {
                    const Icon = s.icon;
                    return (
                      <Card key={s.id} id={s.id}>
                        <CardHeader>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <div className="rounded-md bg-primary/10 p-2">
                                <Icon className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <CardTitle className="text-xl">{s.title}</CardTitle>
                                <CardDescription className="mt-1">{s.summary}</CardDescription>
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {s.audience.map((a) => (
                                    <Badge key={a} variant="secondary" className="capitalize">
                                      {a}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                            {s.link && (
                              <Button asChild size="sm" variant="outline">
                                <Link to={s.link.to}>{s.link.label}</Link>
                              </Button>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <ol className="space-y-3">
                            {s.steps.map((st, i) => (
                              <li key={i} className="flex gap-3">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium">
                                  {i + 1}
                                </span>
                                <div>
                                  <p className="font-medium">{st.title}</p>
                                  <p className="text-sm text-muted-foreground">{st.body}</p>
                                </div>
                              </li>
                            ))}
                          </ol>
                          {s.tips && s.tips.length > 0 && (
                            <>
                              <Separator />
                              <div className="space-y-1">
                                <p className="text-sm font-medium flex items-center gap-1">
                                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Tips
                                </p>
                                <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                                  {s.tips.map((t, i) => (
                                    <li key={i}>{t}</li>
                                  ))}
                                </ul>
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* QUICK START */}
            <TabsContent value="quickstart" className="mt-6">
              <QuickStartChecklist />
            </TabsContent>

            {/* INTERACTIVE DEMOS */}
            <TabsContent value="interactive" className="mt-6 space-y-6">
              <FilterPresetDemo />
              <TaskEditDemo />
              <SearchDemo />
            </TabsContent>

            {/* FAQ */}
            <TabsContent value="faq" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Frequently asked questions</CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="single" collapsible>
                    {FAQ.map((f, i) => (
                      <AccordionItem key={i} value={`f-${i}`}>
                        <AccordionTrigger>{f.q}</AccordionTrigger>
                        <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AppShell>
    </AuthGuard>
  );
}

const QUICK_STEPS = [
  "Open the Dashboard and skim today's KPIs",
  "Create or open a Firm",
  "Create a Project (use a Workflow Template)",
  "Open a Task and post a Discussion message",
  "Edit a Task — set Assignee, Reviewer, Start & Completion dates",
  "Apply filters on Open Points and save a preset",
  "Star a preset to make it your default",
  "Log time against a task",
  "Open Reports and export a CSV",
];

function QuickStartChecklist() {
  const [done, setDone] = useState<boolean[]>(() => Array(QUICK_STEPS.length).fill(false));
  const completed = done.filter(Boolean).length;
  const pct = Math.round((completed / QUICK_STEPS.length) * 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Get productive in 9 steps</CardTitle>
        <CardDescription>
          Tick off as you go. Progress is saved in this browser tab only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>
              {completed} of {QUICK_STEPS.length} complete
            </span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
          <Progress value={pct} />
        </div>
        <ul className="space-y-2">
          {QUICK_STEPS.map((step, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted/50 transition"
            >
              <Checkbox
                id={`qs-${i}`}
                checked={done[i]}
                onCheckedChange={(v) =>
                  setDone((d) => d.map((x, idx) => (idx === i ? Boolean(v) : x)))
                }
              />
              <Label
                htmlFor={`qs-${i}`}
                className={done[i] ? "line-through text-muted-foreground" : ""}
              >
                {i + 1}. {step}
              </Label>
              {done[i] && <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />}
            </li>
          ))}
        </ul>
        {pct === 100 && (
          <div className="rounded-md bg-primary/10 p-4 text-sm">
            🎉 You're set up. Bookmark this page — come back any time you want a refresher.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FilterPresetDemo() {
  const [firm, setFirm] = useState("");
  const [project, setProject] = useState("");
  const [type, setType] = useState("");
  const [presets, setPresets] = useState<
    { name: string; firm: string; project: string; type: string; isDefault: boolean }[]
  >([]);
  const [name, setName] = useState("");

  const save = () => {
    if (!name.trim()) {
      toast.error("Name your preset first");
      return;
    }
    setPresets((p) => [...p, { name: name.trim(), firm, project, type, isDefault: false }]);
    setName("");
    toast.success("Preset saved (demo only)");
  };
  const apply = (i: number) => {
    const p = presets[i];
    setFirm(p.firm);
    setProject(p.project);
    setType(p.type);
    toast.success(`Applied "${p.name}"`);
  };
  const star = (i: number) => {
    setPresets((arr) =>
      arr.map((p, idx) => ({ ...p, isDefault: idx === i ? !p.isDefault : false })),
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-primary" /> Try it: Save a filter preset
        </CardTitle>
        <CardDescription>
          This is a sandbox. Real presets live next to filters on each page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Firm</Label>
            <Input
              value={firm}
              onChange={(e) => setFirm(e.target.value)}
              placeholder="e.g. Acme CPA"
            />
          </div>
          <div className="space-y-1">
            <Label>Project</Label>
            <Input
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder="e.g. 2024 1120-S"
            />
          </div>
          <div className="space-y-1">
            <Label>Project type</Label>
            <Input
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="e.g. Tax Return"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Preset name"
            className="max-w-xs"
          />
          <Button onClick={save}>
            <Save className="h-4 w-4 mr-2" />
            Save preset
          </Button>
        </div>
        {presets.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">Your presets</Label>
            <ul className="space-y-2">
              {presets.map((p, i) => (
                <li key={i} className="flex items-center gap-2 rounded-md border p-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => star(i)}
                    aria-label="Set default"
                  >
                    <Star className={`h-4 w-4 ${p.isDefault ? "fill-primary text-primary" : ""}`} />
                  </Button>
                  <div className="flex-1 text-sm">
                    <span className="font-medium">{p.name}</span>{" "}
                    <span className="text-muted-foreground">
                      {[p.firm, p.project, p.type].filter(Boolean).join(" · ") || "no filters"}
                    </span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => apply(i)}>
                    Apply
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaskEditDemo() {
  const [editing, setEditing] = useState(false);
  const [task, setTask] = useState({
    assignee: "Priya R.",
    reviewer: "Sam K.",
    due: "2026-05-20",
    start: "2026-05-08",
    completion: "",
    notes: "",
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Try it: Task edit drawer</CardTitle>
        <CardDescription>
          On the real task page these fields are read-only. Press Edit to open the drawer and change
          them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Assignee</div>
            <div className="font-medium">{task.assignee}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Reviewer</div>
            <div className="font-medium">{task.reviewer}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Due</div>
            <div className="font-medium">{task.due}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Start</div>
            <div className="font-medium">{task.start || "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Completion</div>
            <div className="font-medium">{task.completion || "—"}</div>
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditing((v) => !v)}>
          {editing ? "Close editor" : "Edit task"}
        </Button>
        {editing && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-md border p-4 bg-muted/30">
            <div className="space-y-1">
              <Label>Assignee</Label>
              <Input
                value={task.assignee}
                onChange={(e) => setTask({ ...task, assignee: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Reviewer</Label>
              <Input
                value={task.reviewer}
                onChange={(e) => setTask({ ...task, reviewer: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input
                type="date"
                value={task.due}
                onChange={(e) => setTask({ ...task, due: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Start date</Label>
              <Input
                type="date"
                value={task.start}
                onChange={(e) => setTask({ ...task, start: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Completion date</Label>
              <Input
                type="date"
                value={task.completion}
                onChange={(e) => setTask({ ...task, completion: e.target.value })}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={task.notes}
                onChange={(e) => setTask({ ...task, notes: e.target.value })}
                placeholder="Optional notes…"
              />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button
                onClick={() => {
                  setEditing(false);
                  toast.success("Saved (demo)");
                }}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const SAMPLE_ITEMS = [
  { kind: "Task", title: "Review 1120-S draft", firm: "Acme CPA" },
  { kind: "Open point", title: "Need bank statement Mar–Jun", firm: "Northwind LLC" },
  { kind: "Project", title: "Q2 Bookkeeping", firm: "Globex" },
  { kind: "Firm", title: "Initech Partners", firm: "—" },
  { kind: "Task", title: "Prepare 1099 batch", firm: "Initech Partners" },
  { kind: "Open point", title: "Confirm depreciation method", firm: "Acme CPA" },
];

function SearchDemo() {
  const [q, setQ] = useState("");
  const results = SAMPLE_ITEMS.filter(
    (i) =>
      !q ||
      i.title.toLowerCase().includes(q.toLowerCase()) ||
      i.firm.toLowerCase().includes(q.toLowerCase()) ||
      i.kind.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Try it: Universal search</CardTitle>
        <CardDescription>
          Type to filter across mock tasks, projects and open points.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="pl-9"
          />
        </div>
        <ul className="divide-y rounded-md border">
          {results.map((r, i) => (
            <li key={i} className="p-3 flex items-center gap-3">
              <Badge variant="outline">{r.kind}</Badge>
              <span className="font-medium flex-1">{r.title}</span>
              <span className="text-sm text-muted-foreground">{r.firm}</span>
            </li>
          ))}
          {results.length === 0 && (
            <li className="p-6 text-center text-sm text-muted-foreground">No matches</li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

const FAQ = [
  {
    q: "Why can't I edit Assignee or Due date directly on the task page?",
    a: "To prevent accidental changes — they're read-only on the main view. Press Edit and use the drawer to change Assignee, Reviewer, Due date, Start date and Completion date.",
  },
  {
    q: "Where are my saved filter presets stored?",
    a: "In your browser's localStorage, scoped per page. They don't sync across devices. Use a shared URL if you want to send a filtered view to a teammate.",
  },
  {
    q: "How do I make a preset apply automatically?",
    a: "Click the star icon next to it. Only one preset per page can be the default. It applies on page load when no URL filters are present.",
  },
  {
    q: "Who can see internal team messages?",
    a: "Only users with the admin or employee role. Client users never see internal threads, time logs, task notes or task links.",
  },
  {
    q: "How do I add a new user?",
    a: "Admin → Team → Invite. Choose role (admin / employee / client) and, for clients, scope them to one or more firms.",
  },
  {
    q: "Where do I configure system-wide defaults?",
    a: "Admin → Settings. Change time zone, working days, notification defaults and feature toggles.",
  },
  {
    q: "How do I export data?",
    a: "Open Reports, choose your range, then click the download icon on any chart for CSV. Most list pages also have an Export CSV action in their toolbar.",
  },
  {
    q: "I can't see anything — what's wrong?",
    a: "Most likely your user isn't assigned to any firm yet. Ask an admin to invite you or scope you to the right firm in Admin → Team.",
  },
];
