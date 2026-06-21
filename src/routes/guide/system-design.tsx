import { createFileRoute } from "@tanstack/react-router";
import {
  Globe,
  Server,
  Database,
  Monitor,
  Smartphone,
  ShieldCheck,
  Users,
  Lock,
  ChevronDown,
  Layers,
  LayoutGrid,
} from "lucide-react";
import { AuthGuard } from "@/components/auth/auth-guard";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { RouteErrorComponent } from "@/components/shared/route-error";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ALL_TIER1, MODULE_LABEL } from "@/lib/routing/use-nav";
import { cn } from "@/lib/shared/utils";

export const Route = createFileRoute("/guide/system-design")({
  component: () => (
    <AuthGuard allow={["super_admin", "admin", "hr_manager", "employee"]}>
      <AppShell crumbs={[{ label: "Guide", to: "/guide" }, { label: "System Design" }]}>
        <SystemDesignPage />
      </AppShell>
    </AuthGuard>
  ),
  errorComponent: RouteErrorComponent,
});

// ─── Tech stack ────────────────────────────────────────────────────────────────

const TECH_STACK = [
  {
    icon: Globe,
    title: "Web Application",
    subtitle: "What you see in your browser",
    color: "bg-blue-500/10 text-blue-600",
    points: [
      "Built with React — the same technology used by Facebook and Airbnb.",
      "Pages load with server-side rendering so content appears instantly.",
      "Deployed on Cloudflare's global edge network for fast access anywhere.",
      "Responsive — works on desktop, tablet, and mobile browser.",
    ],
  },
  {
    icon: Database,
    title: "Database",
    subtitle: "Where all your data lives",
    color: "bg-green-500/10 text-green-600",
    points: [
      "Powered by PostgreSQL — a battle-tested, enterprise-grade relational database.",
      "Hosted on Supabase, which provides automatic backups, real-time sync, and file storage.",
      "Every table has Row-Level Security: each user can only read or write rows they're allowed to.",
      "245+ tables covering every business domain from invoicing to payroll.",
    ],
  },
  {
    icon: Server,
    title: "Server Logic",
    subtitle: "The rules that run your business",
    color: "bg-violet-500/10 text-violet-600",
    points: [
      "Server functions run on Cloudflare Workers — lightweight, fast, globally distributed.",
      "All sensitive operations (creating invoices, approving leave) run server-side so they cannot be tampered with from the browser.",
      "Authentication is checked on every server call — no action goes through without a valid session.",
    ],
  },
  {
    icon: Monitor,
    title: "Desktop App",
    subtitle: "Installable on Windows & Mac",
    color: "bg-amber-500/10 text-amber-600",
    points: [
      "Built with Electron — the same technology used by Slack and VS Code.",
      "Wraps the web application in a native window for offline capability and desktop notifications.",
      "Supports deep-links (busacta://) for OAuth sign-in flows.",
    ],
  },
  {
    icon: Smartphone,
    title: "Mobile App",
    subtitle: "iOS & Android",
    color: "bg-rose-500/10 text-rose-600",
    points: [
      "Built with Capacitor — runs the web application inside a native mobile shell.",
      "Available on the App Store and Google Play under the BusAcTa Operations brand.",
      "Uses the same data and logic as the web — no separate mobile backend.",
    ],
  },
];

// ─── Hub descriptions ──────────────────────────────────────────────────────────

const HUB_DESC: Record<string, string> = {
  dashboard: "Your daily command centre — KPIs, pending actions, and quick links to everything.",
  ops: "Firms, projects, tasks, time logs, and the operating cycle. The operational backbone of the practice.",
  clients:
    "Unified directory of corporate clients (firms), individual contacts, and direct retail clients.",
  finance:
    "General ledger, invoicing, bank feeds, reconciliation, budgeting, and financial reports.",
  petty: "Track and approve small cash expenses with a running ledger and receipt management.",
  hr: "Employee directory, org chart, attendance tracking, leave management, and payroll.",
  learning: "Internal training courses, learning paths, Q&A boards, and staff leaderboard.",
  organizer:
    "Smart form engine — build questionnaires, checklists, and data-collection forms to deploy to clients or staff.",
  esign: "Send documents for digital signature with a full audit trail and tamper-proof records.",
  email: "Domain email configuration, outbound send log, and delivery tracking.",
  communication: "Team channels, direct messages, and threaded conversations.",
  internal: "Office asset register, keys, support tickets, and internal resources.",
  growth: "Lead pipeline and marketing activity tracking for practice growth.",
  admin: "User management, access control, integrations, system settings, and audit logs.",
  guide: "Manuals, workflows, shortcuts, and this system design reference.",
  portal:
    "Client self-service portal — clients log in to view projects, sign documents, and submit forms.",
};

// ─── Roles ────────────────────────────────────────────────────────────────────

const ROLES = [
  {
    key: "super_admin",
    label: "Super Admin",
    color: "bg-red-500/10 text-red-700 border-red-200",
    desc: "Unrestricted access to every feature, every firm, and every setting. Reserved for platform-level administrators.",
  },
  {
    key: "admin",
    label: "Admin",
    color: "bg-orange-500/10 text-orange-700 border-orange-200",
    desc: "Full access within the firm — manages users, configures settings, and can perform any operation.",
  },
  {
    key: "hr_manager",
    label: "HR Manager",
    color: "bg-teal-500/10 text-teal-700 border-teal-200",
    desc: "Manages the HR module — attendance, leave approvals, payroll processing, and training assignments.",
  },
  {
    key: "employee",
    label: "Employee",
    color: "bg-green-500/10 text-green-700 border-green-200",
    desc: "Day-to-day staff — completes tasks, logs time, views their own HR data, and submits forms.",
  },
  {
    key: "client",
    label: "Client",
    color: "bg-slate-500/10 text-slate-700 border-slate-200",
    desc: "External client contact — limited to the Client Portal to view their projects and sign documents.",
  },
];

// ─── Data dictionary ───────────────────────────────────────────────────────────

type Column = { name: string; desc: string };
type DomainTable = { table: string; label: string; desc: string; columns: Column[] };
type Domain = { key: string; label: string; emoji: string; summary: string; tables: DomainTable[] };

const DATA_DOMAINS: Domain[] = [
  {
    key: "core",
    label: "Core Business",
    emoji: "🏢",
    summary:
      "The foundational records every other part of the system references — who your people are, which firms you serve, and how projects are structured.",
    tables: [
      {
        table: "profiles",
        label: "People / Users",
        desc: "Every person with an account in the system — staff, managers, and admins.",
        columns: [
          { name: "Full name", desc: "The person's display name shown throughout the app." },
          { name: "Email address", desc: "Used for login and notifications." },
          { name: "Job title", desc: "Their role within the organisation." },
          { name: "Phone number", desc: "Contact number shown on their profile." },
          { name: "Active", desc: "Whether this account is currently enabled." },
        ],
      },
      {
        table: "user_roles",
        label: "Role Assignments",
        desc: "Links each person to their access level within a specific firm.",
        columns: [
          { name: "Person", desc: "Which user this role belongs to." },
          {
            name: "Role",
            desc: "The access level: admin, finance manager, HR manager, employee, or client.",
          },
          { name: "Firm", desc: "Which firm this role applies to (roles are per-firm)." },
          { name: "Active", desc: "Whether this role assignment is currently in effect." },
        ],
      },
      {
        table: "firms",
        label: "Client Firms",
        desc: "The accounting client firms your practice serves.",
        columns: [
          { name: "Firm name", desc: "The legal or trading name of the client." },
          { name: "Industry", desc: "The sector the firm operates in." },
          { name: "Registration number", desc: "Company registration or tax ID." },
          { name: "Address", desc: "Registered office address." },
          { name: "Status", desc: "Whether this firm is active, on-hold, or closed." },
        ],
      },
      {
        table: "projects",
        label: "Projects / Engagements",
        desc: "A job or engagement running for a client firm — audit, tax return, advisory, etc.",
        columns: [
          { name: "Project name", desc: "Short descriptive title of the engagement." },
          { name: "Firm", desc: "Which client this project is for." },
          { name: "Project type", desc: "Category such as audit, tax, bookkeeping, or advisory." },
          { name: "Status", desc: "Current stage: planning, active, on-hold, or completed." },
          { name: "Due date", desc: "When this project must be delivered." },
          {
            name: "Billing method",
            desc: "How the work is charged — fixed fee, time-based, or retainer.",
          },
        ],
      },
      {
        table: "client_entities",
        label: "Legal Entities",
        desc: "Individual legal entities (subsidiaries, trusts, divisions) that belong to a client firm.",
        columns: [
          { name: "Entity name", desc: "Full legal name of the entity." },
          { name: "Parent firm", desc: "Which client firm this entity belongs to." },
          { name: "Entity type", desc: "Company, trust, partnership, or sole trader." },
          { name: "Registration number", desc: "Entity-level company or tax registration." },
          { name: "Active", desc: "Whether this entity is currently engaged." },
        ],
      },
      {
        table: "clients",
        label: "Client Contacts",
        desc: "Individual people at client firms — the humans you deal with day to day.",
        columns: [
          { name: "Full name", desc: "Contact person's name." },
          { name: "Firm", desc: "Which client firm they work for." },
          { name: "Job title", desc: "Their role at the client firm." },
          { name: "Email", desc: "Their email address for correspondence." },
          {
            name: "Primary contact",
            desc: "Whether this is the main point of contact for the firm.",
          },
        ],
      },
    ],
  },
  {
    key: "ops",
    label: "Operations",
    emoji: "⚙️",
    summary:
      "The day-to-day work engine — tasks, subtasks, open questions, time tracking, and attachments.",
    tables: [
      {
        table: "tasks",
        label: "Tasks",
        desc: "A unit of work assigned to one or more team members within a project.",
        columns: [
          { name: "Title", desc: "What needs to be done." },
          { name: "Project", desc: "Which engagement this task belongs to." },
          { name: "Assigned to", desc: "The person responsible for completing it." },
          { name: "Reviewer", desc: "The person who will review and sign off on the work." },
          { name: "Status", desc: "Current state: to-do, in-progress, in-review, or done." },
          { name: "Priority", desc: "Urgency level: low, normal, high, or critical." },
          { name: "Due date", desc: "When this task must be completed." },
        ],
      },
      {
        table: "task_subtasks",
        label: "Subtasks",
        desc: "Smaller checklist items within a task that must all be completed before the task is done.",
        columns: [
          { name: "Title", desc: "The specific step to complete." },
          { name: "Parent task", desc: "Which task this subtask belongs to." },
          { name: "Assigned to", desc: "The person responsible for this step." },
          { name: "Done", desc: "Whether this step has been completed." },
          { name: "Due date", desc: "When this individual step is due." },
        ],
      },
      {
        table: "task_action_items",
        label: "Open Points",
        desc: "Questions, blockers, or follow-ups raised during a task that need resolution before work can proceed.",
        columns: [
          { name: "Description", desc: "What the open question or blocker is." },
          { name: "Task", desc: "Which task raised this issue." },
          { name: "Raised by", desc: "Who identified this point." },
          { name: "Assigned to", desc: "Who is responsible for resolving it." },
          { name: "Resolved", desc: "Whether this point has been closed." },
          { name: "Due date", desc: "When a response is needed by." },
        ],
      },
      {
        table: "time_logs",
        label: "Time Logs",
        desc: "Hours recorded by staff against specific tasks for billing and productivity tracking.",
        columns: [
          { name: "Who logged it", desc: "The staff member who did the work." },
          { name: "Task", desc: "Which task the time was spent on." },
          { name: "Date", desc: "The date the work was performed." },
          { name: "Hours worked", desc: "Number of hours (or fractions of hours) recorded." },
          { name: "Description", desc: "What was done during this time." },
          { name: "Billable", desc: "Whether this time is chargeable to the client." },
        ],
      },
      {
        table: "task_attachments",
        label: "Task Attachments",
        desc: "Files uploaded to a task — working papers, spreadsheets, screenshots, etc.",
        columns: [
          { name: "File name", desc: "The name of the uploaded file." },
          { name: "Task", desc: "Which task this file belongs to." },
          { name: "Uploaded by", desc: "Who attached the file." },
          { name: "Upload date", desc: "When it was uploaded." },
          { name: "File size", desc: "Size of the file in kilobytes or megabytes." },
        ],
      },
      {
        table: "task_messages",
        label: "Task Comments",
        desc: "In-task chat messages — discussions, notes, and @mentions between team members.",
        columns: [
          { name: "Message text", desc: "What was written." },
          { name: "Task", desc: "Which task the comment belongs to." },
          { name: "Author", desc: "Who wrote the message." },
          { name: "Sent at", desc: "Date and time the message was posted." },
          {
            name: "Mentions",
            desc: "Other users tagged in the message (they receive a notification).",
          },
        ],
      },
    ],
  },
  {
    key: "hr",
    label: "Human Resources & Payroll",
    emoji: "👥",
    summary:
      "Everything about your staff — attendance, leave, compensation, payroll runs, and training.",
    tables: [
      {
        table: "employee_import_runs",
        label: "Employee Import Jobs",
        desc: "Bulk upload sessions used to add or update staff records from a spreadsheet.",
        columns: [
          { name: "Upload date", desc: "When the import was run." },
          { name: "File name", desc: "The spreadsheet that was uploaded." },
          { name: "Uploaded by", desc: "Which admin ran the import." },
          { name: "Records processed", desc: "How many rows were in the file." },
          { name: "Errors found", desc: "How many rows had problems (shown with details)." },
          { name: "Status", desc: "Pending, processing, completed, or failed." },
        ],
      },
      {
        table: "attendance_entries",
        label: "Attendance Records",
        desc: "Daily attendance data for each employee.",
        columns: [
          { name: "Employee", desc: "Which staff member this record is for." },
          { name: "Date", desc: "The working day." },
          { name: "Check-in time", desc: "When they arrived at work." },
          { name: "Check-out time", desc: "When they left work." },
          { name: "Hours worked", desc: "Total hours calculated from check-in to check-out." },
          { name: "Status", desc: "Present, absent, late, or half-day." },
        ],
      },
      {
        table: "leave_requests",
        label: "Leave Requests",
        desc: "Applications for annual leave, sick leave, or other time off.",
        columns: [
          { name: "Employee", desc: "Who is requesting leave." },
          { name: "Leave type", desc: "Annual, sick, family responsibility, unpaid, etc." },
          { name: "Start date", desc: "First day of leave." },
          { name: "End date", desc: "Last day of leave." },
          { name: "Days requested", desc: "Number of working days." },
          { name: "Status", desc: "Pending, approved, or declined." },
          { name: "Approved by", desc: "The manager who actioned the request." },
        ],
      },
      {
        table: "staff_compensation",
        label: "Compensation Records",
        desc: "Salary and benefits details for each employee.",
        columns: [
          { name: "Employee", desc: "Whose compensation this record is for." },
          { name: "Base salary", desc: "Annual or monthly gross salary." },
          { name: "Currency", desc: "The currency of payment." },
          { name: "Effective date", desc: "When this compensation came into effect." },
          { name: "Pay frequency", desc: "Monthly, bi-weekly, or weekly." },
        ],
      },
      {
        table: "payroll_runs",
        label: "Payroll Runs",
        desc: "Monthly payroll processing batches showing gross pay, deductions, and net pay per employee.",
        columns: [
          { name: "Period", desc: "The month and year being paid (e.g. 'May 2026')." },
          { name: "Firm", desc: "Which firm's payroll this run covers." },
          { name: "Status", desc: "Draft, processing, approved, or paid." },
          { name: "Total gross pay", desc: "Sum of all gross salaries before deductions." },
          { name: "Total deductions", desc: "Sum of all taxes, UIF, and other deductions." },
          {
            name: "Total net pay",
            desc: "What employees actually receive in their bank accounts.",
          },
        ],
      },
      {
        table: "payroll_salary_structures",
        label: "Salary Structures",
        desc: "Template pay structures defining how salaries are built (basic pay + allowances + deductions).",
        columns: [
          { name: "Name", desc: "Label for this structure (e.g. 'Standard Monthly')." },
          {
            name: "Components",
            desc: "List of elements: basic, housing allowance, medical aid, PAYE, UIF, etc.",
          },
          { name: "Firm", desc: "Which firm this structure belongs to." },
          {
            name: "Default for role",
            desc: "Which employee role this structure is auto-applied to.",
          },
        ],
      },
      {
        table: "payroll_leave_policies",
        label: "Leave Policies",
        desc: "Rules governing how many days of each leave type employees are entitled to.",
        columns: [
          { name: "Name", desc: "Policy name (e.g. 'Standard Annual Leave')." },
          { name: "Leave type", desc: "The category of leave this policy covers." },
          { name: "Days per year", desc: "Entitlement in working days." },
          { name: "Carry-over allowed", desc: "Whether unused days roll over to the next year." },
          { name: "Firm", desc: "Which firm this policy applies to." },
        ],
      },
      {
        table: "training_courses",
        label: "Training Courses",
        desc: "E-learning or in-person courses available to staff.",
        columns: [
          { name: "Title", desc: "Name of the course." },
          { name: "Description", desc: "What the course covers." },
          { name: "Type", desc: "Online, in-person, or blended." },
          { name: "Duration", desc: "Estimated time to complete." },
          { name: "Published", desc: "Whether the course is visible and assignable." },
        ],
      },
      {
        table: "training_assignments",
        label: "Training Assignments",
        desc: "Records of which courses have been assigned to which employees, and their progress.",
        columns: [
          { name: "Employee", desc: "Who this assignment is for." },
          { name: "Course", desc: "Which course they've been assigned." },
          { name: "Assigned by", desc: "The manager or HR admin who assigned it." },
          { name: "Due date", desc: "When they need to complete it by." },
          { name: "Completion status", desc: "Not started, in progress, or completed." },
          { name: "Score", desc: "Their result if the course includes an assessment." },
        ],
      },
    ],
  },
  {
    key: "esign",
    label: "E-Signature",
    emoji: "✍️",
    summary:
      "Send documents for legally-binding digital signature with a tamper-proof audit trail.",
    tables: [
      {
        table: "esign_envelopes",
        label: "Signing Envelopes",
        desc: "A signing package that groups one or more documents sent to one or more signatories.",
        columns: [
          {
            name: "Title",
            desc: "Descriptive name of the signing package (e.g. 'Annual Financial Statements — FY2025').",
          },
          { name: "Created by", desc: "The staff member who prepared the envelope." },
          { name: "Status", desc: "Draft, sent, in-progress, completed, declined, or expired." },
          { name: "Expiry date", desc: "After this date the signing links are no longer valid." },
          { name: "Firm", desc: "Which client firm this is for." },
        ],
      },
      {
        table: "esign_documents",
        label: "Envelope Documents",
        desc: "Individual PDF files contained within a signing envelope.",
        columns: [
          { name: "File name", desc: "The name of the PDF document." },
          { name: "Envelope", desc: "Which signing package this document belongs to." },
          { name: "Page count", desc: "Total number of pages in the document." },
          { name: "Signing order", desc: "The position of this document in the signing sequence." },
        ],
      },
      {
        table: "esign_recipients",
        label: "Recipients / Signatories",
        desc: "The people who need to sign, initial, or review documents in an envelope.",
        columns: [
          { name: "Name", desc: "The person's full name." },
          { name: "Email", desc: "Where the signing invitation is sent." },
          {
            name: "Role",
            desc: "Signer (must sign), viewer (read-only), or approver (must approve).",
          },
          { name: "Signed at", desc: "Date and time they completed their signing action." },
          { name: "Status", desc: "Pending, opened, signed, declined, or expired." },
        ],
      },
      {
        table: "esign_fields",
        label: "Signing Fields",
        desc: "The boxes placed on specific pages for signatures, initials, dates, or typed text.",
        columns: [
          { name: "Field type", desc: "Signature, initials, date, or free-text input." },
          { name: "Recipient", desc: "Which signatory this field is assigned to." },
          { name: "Page number", desc: "Which page of the document this field appears on." },
          { name: "Position", desc: "Exact location on the page (X/Y coordinates)." },
          {
            name: "Required",
            desc: "Whether the recipient must complete this field before submitting.",
          },
        ],
      },
      {
        table: "esign_audit_log",
        label: "Audit Trail",
        desc: "A tamper-proof log of every action taken on a document — provides legal evidence of the signing process.",
        columns: [
          {
            name: "Event type",
            desc: "What happened: opened, signed, declined, forwarded, completed, etc.",
          },
          { name: "Who did it", desc: "The person who performed the action." },
          { name: "When", desc: "Exact date and time." },
          { name: "IP address", desc: "The internet address from which the action was taken." },
          {
            name: "Envelope / Document",
            desc: "Which signing package and document this event relates to.",
          },
        ],
      },
    ],
  },
  {
    key: "organizer",
    label: "Organizer (Smart Forms)",
    emoji: "📋",
    summary:
      "A form and checklist engine — design questionnaires once, deploy them to clients or staff, collect answers, and review responses.",
    tables: [
      {
        table: "organizer_templates",
        label: "Form Templates",
        desc: "The master design of a form or questionnaire — created once and reused many times.",
        columns: [
          { name: "Title", desc: "Name of the form (e.g. 'Annual Tax Information Gather')." },
          { name: "Description", desc: "What this form is used for." },
          {
            name: "Version",
            desc: "Version number — templates are versioned so old responses are preserved.",
          },
          { name: "Status", desc: "Draft (still being built) or Published (ready to deploy)." },
          { name: "Firm", desc: "Which firm this template belongs to." },
        ],
      },
      {
        table: "organizer_blocks",
        label: "Form Blocks / Questions",
        desc: "The individual building blocks within a template — headings, questions, tables, file uploads, etc.",
        columns: [
          {
            name: "Block type",
            desc: "Question, heading, data table, file request, or rich text note.",
          },
          { name: "Question text", desc: "The prompt shown to the person filling in the form." },
          {
            name: "Required",
            desc: "Whether this question must be answered before the form can be submitted.",
          },
          {
            name: "Position order",
            desc: "Where this block appears on the form (first, second, etc.).",
          },
        ],
      },
      {
        table: "organizer_deployments",
        label: "Deployments",
        desc: "A specific instance of a form sent to a particular person (client or staff member) for completion.",
        columns: [
          { name: "Template", desc: "Which form was deployed." },
          { name: "Sent to", desc: "Who received this deployment." },
          { name: "Sent date", desc: "When it was dispatched." },
          { name: "Due date", desc: "When the response is needed by." },
          { name: "Status", desc: "Pending, in-progress, submitted, or reviewed." },
        ],
      },
      {
        table: "organizer_responses",
        label: "Responses / Answers",
        desc: "The answers submitted by the recipient for each question in a deployment.",
        columns: [
          { name: "Deployment", desc: "Which deployed form this answer belongs to." },
          { name: "Block / Question", desc: "Which question was answered." },
          { name: "Answer", desc: "The content entered by the respondent." },
          { name: "Answered by", desc: "Who submitted this answer." },
          { name: "Answered at", desc: "When the answer was saved." },
          { name: "Reviewed by", desc: "Which staff member reviewed and approved this answer." },
        ],
      },
    ],
  },
  {
    key: "comms",
    label: "Communication & Collaboration",
    emoji: "💬",
    summary:
      "Real-time team chat, daily planning notes, and personal reminders — everything needed to stay in sync.",
    tables: [
      {
        table: "chat_threads",
        label: "Chat Channels & DMs",
        desc: "Conversations between team members — either open channels (topics, projects) or direct messages.",
        columns: [
          {
            name: "Name",
            desc: "The channel name (e.g. '#year-end-2025' or 'Direct with Avani').",
          },
          { name: "Type", desc: "Channel (group) or direct message (1-to-1 or small group)." },
          { name: "Members", desc: "Who is in this conversation." },
          { name: "Firm", desc: "Which firm context this channel belongs to." },
          {
            name: "Archived",
            desc: "Whether the channel has been archived (hidden but not deleted).",
          },
        ],
      },
      {
        table: "chat_messages",
        label: "Messages",
        desc: "Individual messages sent within a channel or direct message thread.",
        columns: [
          { name: "Message text", desc: "What was written." },
          { name: "Channel", desc: "Which thread this message belongs to." },
          { name: "Author", desc: "Who sent it." },
          { name: "Sent at", desc: "Date and time of posting." },
          { name: "Reactions", desc: "Emoji reactions added by other users." },
          { name: "Reply to", desc: "If this is a threaded reply, which message it responds to." },
        ],
      },
      {
        table: "daily_notes",
        label: "Daily Notes",
        desc: "Private planning notes a user writes for themselves — like a personal work journal.",
        columns: [
          { name: "Author", desc: "Which user this note belongs to." },
          { name: "Date", desc: "The day this note was written for." },
          { name: "Content", desc: "The note text (supports rich formatting)." },
          { name: "Pinned", desc: "Whether this note is pinned to the top for easy access." },
          { name: "Color", desc: "Optional colour tag for visual organisation." },
        ],
      },
      {
        table: "personal_reminders",
        label: "Reminders",
        desc: "Scheduled alerts a user sets to be notified at a future date and time.",
        columns: [
          { name: "Title", desc: "What the reminder is about." },
          { name: "Notes", desc: "Optional extra detail." },
          { name: "Remind at", desc: "The exact date and time to trigger the notification." },
          { name: "Recurrence", desc: "Whether it repeats: none, daily, weekly, monthly." },
          { name: "Done", desc: "Whether the user has dismissed or completed this reminder." },
        ],
      },
      {
        table: "notifications",
        label: "Notifications",
        desc: "System-generated alerts shown in the bell menu — task assignments, approvals, mentions, etc.",
        columns: [
          { name: "Recipient", desc: "Who receives this notification." },
          {
            name: "Type",
            desc: "What triggered it (task assigned, comment mention, leave approved, etc.).",
          },
          { name: "Title", desc: "Short headline of the notification." },
          { name: "Link", desc: "Where to go when the notification is clicked." },
          { name: "Read", desc: "Whether the user has seen it." },
        ],
      },
    ],
  },
  {
    key: "docs",
    label: "Document Library",
    emoji: "📁",
    summary:
      "File storage and document management — organised folders, file request links, and internal asset tracking.",
    tables: [
      {
        table: "document_nodes",
        label: "Files & Folders",
        desc: "Every file and folder in the document library — organised in a tree structure.",
        columns: [
          { name: "Name", desc: "File or folder name." },
          { name: "Type", desc: "File or folder." },
          {
            name: "Parent folder",
            desc: "Which folder this item lives in (empty if at the root).",
          },
          { name: "Firm", desc: "Which client firm this document belongs to." },
          { name: "Uploaded by", desc: "Who added this file." },
          { name: "Last modified", desc: "When the file was last changed or replaced." },
        ],
      },
      {
        table: "folder_library_templates",
        label: "Folder Templates",
        desc: "Pre-defined folder structures that can be stamped out for a new client or project automatically.",
        columns: [
          { name: "Name", desc: "Template name (e.g. 'Audit Client Folder Structure')." },
          { name: "Description", desc: "What this template is used for." },
          { name: "Structure", desc: "The folder hierarchy — a list of nested folder names." },
          { name: "Active", desc: "Whether this template is available to deploy." },
        ],
      },
      {
        table: "file_request_links",
        label: "File Request Links",
        desc: "Shareable upload links sent to external parties (clients) so they can submit documents without needing a login.",
        columns: [
          { name: "Title", desc: "What documents are being requested." },
          {
            name: "Destination folder",
            desc: "Where uploaded files land in the document library.",
          },
          { name: "Created by", desc: "Which staff member generated the link." },
          { name: "Expires at", desc: "After this date the link no longer works." },
          { name: "Access count", desc: "How many times files have been uploaded via this link." },
        ],
      },
    ],
  },
  {
    key: "security",
    label: "Security & Audit",
    emoji: "🔒",
    summary:
      "A complete record of who logged in, what they changed, security incidents, and MFA status — everything needed for compliance and forensics.",
    tables: [
      {
        table: "login_events",
        label: "Login Events",
        desc: "A record of every login attempt — successful or failed.",
        columns: [
          { name: "User", desc: "Who attempted to log in." },
          { name: "Date / Time", desc: "When the attempt occurred." },
          { name: "Result", desc: "Success, wrong password, account locked, MFA failed, etc." },
          { name: "IP address", desc: "The internet address the login came from." },
          { name: "Device type", desc: "Browser, desktop app, or mobile app." },
        ],
      },
      {
        table: "security_audit_log",
        label: "Security Audit Log",
        desc: "A detailed record of every sensitive action performed in the system.",
        columns: [
          { name: "Who did it", desc: "The user who performed the action." },
          {
            name: "Action type",
            desc: "What was done (created, modified, deleted, exported, etc.).",
          },
          { name: "Target record", desc: "Which specific record was affected." },
          {
            name: "Before / After",
            desc: "What the data looked like before and after the change.",
          },
          { name: "Date / Time", desc: "Exactly when it happened." },
          { name: "IP address", desc: "Where the action was performed from." },
        ],
      },
      {
        table: "mfa_enforcement_status",
        label: "MFA Status",
        desc: "Tracks whether multi-factor authentication is active for each user.",
        columns: [
          { name: "User", desc: "Which person this MFA record belongs to." },
          { name: "MFA enabled", desc: "Whether they have set up a second factor." },
          { name: "Method", desc: "Authenticator app, SMS, or email OTP." },
          { name: "Last verified", desc: "When they last used their second factor to log in." },
          { name: "Forced by admin", desc: "Whether an admin has required MFA for this user." },
        ],
      },
      {
        table: "incident_records",
        label: "Incident Records",
        desc: "Logged security or operational incidents requiring investigation or follow-up.",
        columns: [
          { name: "Title", desc: "Short description of the incident." },
          { name: "Severity", desc: "Low, medium, high, or critical." },
          { name: "Description", desc: "Full details of what happened." },
          { name: "Reported by", desc: "Who raised the incident." },
          { name: "Status", desc: "Open, investigating, resolved, or closed." },
          { name: "Resolution notes", desc: "What was done to fix or contain the issue." },
        ],
      },
      {
        table: "access_review_schedule",
        label: "Access Reviews",
        desc: "Scheduled reviews of user permissions — ensures the right people have the right access.",
        columns: [
          { name: "Review period", desc: "The time window being reviewed (e.g. Q1 2026)." },
          { name: "Reviewer", desc: "The admin responsible for conducting this review." },
          { name: "Status", desc: "Scheduled, in-progress, or completed." },
          { name: "Due date", desc: "When the review must be finished." },
          { name: "Findings", desc: "Any access issues identified and resolved." },
        ],
      },
    ],
  },
  {
    key: "config",
    label: "Configuration & Integrations",
    emoji: "🔧",
    summary:
      "System settings, personal preferences, and connections to external services like Microsoft 365 and email providers.",
    tables: [
      {
        table: "app_settings",
        label: "App Settings",
        desc: "Firm-level or system-level configuration values that control how the platform behaves.",
        columns: [
          { name: "Setting name", desc: "The identifier for this configuration option." },
          { name: "Value", desc: "The current setting value." },
          { name: "Scope", desc: "Whether this applies to a specific firm or the entire system." },
          { name: "Last changed by", desc: "Who updated this setting." },
          { name: "Changed at", desc: "When it was last modified." },
        ],
      },
      {
        table: "user_ui_prefs",
        label: "User Preferences",
        desc: "Each user's personal interface choices — theme, sidebar, and layout preferences.",
        columns: [
          { name: "User", desc: "Whose preferences these are." },
          { name: "Theme", desc: "Light, dark, or follow the system setting." },
          {
            name: "Sidebar pinned",
            desc: "Whether the navigation sidebar stays open or auto-collapses.",
          },
          { name: "Default hub", desc: "Which hub opens when they first log in." },
          { name: "Compact mode", desc: "Whether to show denser rows in tables and lists." },
        ],
      },
      {
        table: "connected_email_accounts",
        label: "Connected Email Accounts",
        desc: "Email accounts linked to the platform for sending correspondence and receiving replies.",
        columns: [
          { name: "Email address", desc: "The connected inbox." },
          { name: "Provider", desc: "Gmail, Microsoft 365, or SMTP." },
          { name: "Connected by", desc: "The staff member who authorised the connection." },
          { name: "Status", desc: "Active, expired, or disconnected." },
          { name: "Last sync", desc: "When emails were last checked." },
        ],
      },
      {
        table: "integration_credentials",
        label: "Integration Credentials",
        desc: "API keys and tokens used to connect to third-party services like SharePoint, payment gateways, etc.",
        columns: [
          {
            name: "Service name",
            desc: "Which integration this key is for (e.g. 'Microsoft Graph').",
          },
          { name: "Firm", desc: "Which firm's connection this is." },
          { name: "Credential type", desc: "OAuth token, API key, webhook secret, etc." },
          { name: "Expires at", desc: "When this token needs to be refreshed." },
          { name: "Active", desc: "Whether the connection is currently working." },
        ],
      },
      {
        table: "sharepoint_sync_jobs",
        label: "SharePoint Sync Jobs",
        desc: "Background jobs that keep documents synchronised between BusAcTa Operations and a SharePoint site.",
        columns: [
          { name: "Firm", desc: "Which client's SharePoint is being synced." },
          {
            name: "SharePoint site URL",
            desc: "The specific SharePoint site or document library.",
          },
          {
            name: "Folder path",
            desc: "Which folder in BusAcTa Operations maps to which SharePoint location.",
          },
          { name: "Last sync time", desc: "When the most recent sync completed." },
          { name: "Files synced", desc: "How many files were transferred in the last sync." },
          { name: "Status", desc: "Idle, running, completed, or errored." },
        ],
      },
    ],
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────

function SystemDesignPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="System Design"
        description="How BusAcTa Operations is built, what data it stores, and how security works — explained in plain English."
      />

      <Tabs defaultValue="architecture">
        <TabsList className="mb-2">
          <TabsTrigger value="architecture">
            <Layers className="mr-1.5 h-4 w-4" />
            Architecture
          </TabsTrigger>
          <TabsTrigger value="data">
            <Database className="mr-1.5 h-4 w-4" />
            Data Dictionary
          </TabsTrigger>
        </TabsList>

        {/* ── Architecture tab ── */}
        <TabsContent value="architecture" className="space-y-8">
          {/* Tech stack */}
          <section>
            <h2 className="mb-1 text-base font-semibold">How it's built</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              BusAcTa Operations is a single platform that runs on web, desktop, and mobile using
              the same data and logic everywhere.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {TECH_STACK.map((s) => {
                const Icon = s.icon;
                return (
                  <Card key={s.title}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                            s.color,
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <div>
                          <CardTitle className="text-sm">{s.title}</CardTitle>
                          <p className="text-xs text-muted-foreground">{s.subtitle}</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-1.5">
                        {s.points.map((p) => (
                          <li
                            key={p}
                            className="flex items-start gap-2 text-sm text-muted-foreground"
                          >
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Hub map */}
          <section>
            <h2 className="mb-1 text-base font-semibold">Application Hubs</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              The platform is divided into 16 specialised hubs — each one a "virtual department"
              grouping related tools together.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ALL_TIER1.map((t1) => {
                const Icon = t1.icon;
                return (
                  <Card key={t1.key} className="overflow-hidden">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-sm">{MODULE_LABEL[t1.key]}</div>
                          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                            {HUB_DESC[t1.key] ?? ""}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Security model */}
          <section>
            <h2 className="mb-1 text-base font-semibold">Security Model</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Access is controlled at two levels: application roles determine what menus and
              features you can see, and Row-Level Security at the database ensures you can only ever
              read or write data you're permitted to — even if a bug existed in the front-end.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-primary" />
                    The 6 Access Roles
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ROLES.map((r) => (
                    <div key={r.key} className="flex items-start gap-3">
                      <Badge variant="outline" className={cn("shrink-0 text-xs", r.color)}>
                        {r.label}
                      </Badge>
                      <p className="text-xs text-muted-foreground">{r.desc}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Lock className="h-4 w-4 text-primary" />
                    Row-Level Security (RLS)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Every table in the database has automatic security rules called Row-Level
                    Security policies. These rules run{" "}
                    <strong className="text-foreground">inside the database itself</strong> — not
                    just in the app.
                  </p>
                  <p>
                    This means: even if the application code had a bug, the database would still
                    refuse to return data that the current user doesn't have permission to see.
                  </p>
                  <p>
                    Example: an HR Manager can only manage staff records for their firm. An Employee
                    can only see their own leave requests — never someone else's salary.
                  </p>
                  <div className="rounded-md border bg-muted/40 p-3 text-xs font-mono leading-relaxed">
                    <span className="text-green-700">✓</span> user_can_access_firm(firm_id)
                    <br />
                    <span className="text-green-700">✓</span> has_role(user_id, 'hr_manager')
                    <br />
                    <span className="text-green-700">✓</span> current_user_role() checks every query
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        </TabsContent>

        {/* ── Data Dictionary tab ── */}
        <TabsContent value="data" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            BusAcTa Operations stores data across 10 business domains. Expand any domain to see its
            tables and key fields — all described in plain English.
          </p>
          <Accordion type="multiple" className="space-y-2">
            {DATA_DOMAINS.map((domain) => (
              <AccordionItem
                key={domain.key}
                value={domain.key}
                className="rounded-lg border bg-card px-0 shadow-sm"
              >
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <span className="text-xl">{domain.emoji}</span>
                    <div>
                      <div className="font-semibold text-sm">{domain.label}</div>
                      <div className="text-xs text-muted-foreground font-normal">
                        {domain.summary}
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  <div className="space-y-6">
                    {domain.tables.map((t) => (
                      <div key={t.table}>
                        <div className="mb-2 flex items-baseline gap-2">
                          <span className="font-semibold text-sm">{t.label}</span>
                          <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            {t.table}
                          </code>
                        </div>
                        <p className="mb-3 text-sm text-muted-foreground">{t.desc}</p>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-1/3 text-xs">Field</TableHead>
                              <TableHead className="text-xs">What it stores</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {t.columns.map((col) => (
                              <TableRow key={col.name}>
                                <TableCell className="py-2 text-xs font-medium">
                                  {col.name}
                                </TableCell>
                                <TableCell className="py-2 text-xs text-muted-foreground">
                                  {col.desc}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <Card className="border-dashed">
            <CardContent className="flex items-start gap-3 p-4 text-sm text-muted-foreground">
              <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                The full database contains <strong className="text-foreground">245+ tables</strong>.
                This dictionary covers the core tables most users and administrators interact with.
                Supporting tables (indexes, mapping tables, audit sub-tables) are omitted for
                clarity.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
