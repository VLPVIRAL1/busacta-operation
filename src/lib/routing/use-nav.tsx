import {
  LayoutDashboard,
  Briefcase,
  Users,
  TrendingUp,
  Settings,
  BookOpen,
  ListTodo,
  MessageCircleQuestion,
  Kanban,
  MessagesSquare,
  Bell,
  Activity,
  Clock,
  BarChart3,
  ListChecks,
  CalendarSearch,
  ShieldCheck,
  ScrollText,
  UserCog,
  FileText,
  Calendar,
  GraduationCap,
  Megaphone,
  Target,
  BookText,
  Workflow,
  HelpCircle,
  Home,
  AlertTriangle,
  FolderTree,
  Keyboard,
  Paintbrush,
  Network,
  History,
  FileSignature,
  FileStack,
  Send,
  Mail,
  User,
  ClipboardCheck,
  Library,
  Newspaper,
  Route,
  Trophy,
  BookMarked,
  Banknote,
  Rocket,
  type LucideIcon,
} from "lucide-react";

import { useAuth } from "@/lib/auth/auth-context";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { canAccess, requiredRolesFor, BYPASS_ACCESS } from "@/lib/routing/route-access";
import { isHubVisibleFor } from "@/lib/auth/default-hubs-for-roles";

export type AppRole = "super_admin" | "admin" | "hr_manager" | "employee" | "client";

export type ModuleKey =
  | "dashboard"
  | "ops"
  | "communication"
  | "hr"
  | "learning"
  | "organizer"
  | "esign"
  | "email"
  | "growth"
  | "clients"
  | "admin"
  | "guide"
  | "gallery"
  | "portal"
  | "general";

/** Hubs that admins can toggle on/off globally and per-user. Excludes admin (always available to admins) and portal/general. */
export const TOGGLEABLE_MODULES: ModuleKey[] = [
  "dashboard",
  "ops",
  "hr",
  "learning",
  "organizer",
  "esign",
  "email",
  "growth",
  "clients",
  "guide",
  "gallery",
];

export const MODULE_LABEL: Record<ModuleKey, string> = {
  dashboard: "Dashboard",
  ops: "Operations",
  communication: "Communication",
  hr: "Human Resources",
  learning: "Learning & Training",
  organizer: "Organizer",
  esign: "E-Signature",
  email: "Email",
  growth: "Growth",
  clients: "Clients",
  admin: "Admin",
  guide: "Guide",
  gallery: "File Gallery",
  portal: "Client Portal",
  general: "General",
};

export interface Tier1Item {
  key: ModuleKey;
  title: string;
  url: string;
  icon: LucideIcon;
}

export interface Tier2Link {
  title: string;
  url: string;
  icon: LucideIcon;
  description?: string;
  roles?: AppRole[]; // visible if intersects user roles; absent = all roles in this module
  restricted?: boolean; // computed: true when current user can't access (always false while BYPASS_ACCESS=true)
  requiredRoles?: AppRole[]; // computed: roles needed for the tooltip "Requires …" hint
}

export interface Tier2Group {
  label: string;
  links: Tier2Link[];
}

const ALL: AppRole[] = ["super_admin", "admin", "hr_manager", "employee", "client"];

const TIER1: (Tier1Item & { roles: AppRole[] })[] = [
  {
    key: "dashboard",
    title: "Dashboard",
    url: "/global-dashboard",
    icon: Home,
    roles: ["super_admin", "admin", "hr_manager", "employee"],
  },
  {
    key: "ops",
    title: "Operations",
    url: "/ops",
    icon: Briefcase,
    roles: ["super_admin", "admin", "hr_manager", "employee"],
  },
  // Unified Clients hub (B2B Firms + B2C B2C Clients). /clients and
  // /clients still exist as deep links but are hidden from primary nav.
  {
    key: "clients",
    title: "Clients",
    url: "/clients",
    icon: Users,
    roles: ["super_admin", "admin", "employee"],
  },
  {
    key: "communication",
    title: "Communication",
    url: "/ops/communication",
    icon: MessagesSquare,
    roles: ["super_admin", "admin", "hr_manager", "employee"],
  },
  {
    key: "hr",
    title: "Human Resources",
    url: "/hr",
    icon: Users,
    roles: ["super_admin", "admin", "hr_manager", "employee"],
  },
  {
    key: "learning",
    title: "Learning & Training",
    url: "/learning",
    icon: GraduationCap,
    roles: ["super_admin", "admin", "hr_manager", "employee"],
  },
  {
    key: "organizer",
    title: "Organizer",
    url: "/organizer",
    icon: ListChecks,
    roles: ["super_admin", "admin", "hr_manager", "employee"],
  },
  {
    key: "esign",
    title: "E-Signature",
    url: "/esign",
    icon: FileSignature,
    roles: ["super_admin", "admin"],
  },
  { key: "email", title: "Email", url: "/email", icon: Mail, roles: ["super_admin", "admin"] },
  {
    key: "growth",
    title: "Growth",
    url: "/growth",
    icon: TrendingUp,
    roles: ["super_admin", "admin"],
  },
  { key: "admin", title: "Admin", url: "/admin", icon: Settings, roles: ["super_admin", "admin"] },
  {
    key: "guide",
    title: "Guide",
    url: "/guide",
    icon: BookOpen,
    roles: ["super_admin", "admin", "hr_manager", "employee"],
  },
  {
    key: "gallery",
    title: "File Gallery",
    url: "/gallery",
    icon: FolderTree,
    roles: ["super_admin", "admin", "hr_manager", "employee"],
  },
  { key: "portal", title: "Client Portal", url: "/portal", icon: Briefcase, roles: ["client"] },
];

/**
 * Legacy "Client Management" grouping keys. Now that the unified `/clients`
 * hub replaces both as the primary nav entry, this list is empty so the
 * sidebar/mobile-nav grouping code becomes a no-op. Kept as a named export
 * so existing imports keep compiling without churn.
 */
export const CLIENT_MGMT_KEYS: ReadonlyArray<ModuleKey> = [];

const TIER2: Record<ModuleKey, Tier2Group[]> = {
  dashboard: [],
  clients: [
    {
      label: "Clients",
      links: [
        { title: "All Clients", url: "/clients", icon: Users },
        {
          title: "Folder Library",
          url: "/clients/firm/folder-library",
          icon: FolderTree,
          roles: ["super_admin", "admin"],
        },
      ],
    },
  ],
  organizer: [
    {
      label: "Overview",
      links: [
        {
          title: "Templates",
          url: "/organizer",
          icon: ListChecks,
          description: "Create & edit form / exam templates",
        },
      ],
    },
    {
      label: "Tracking",
      links: [
        {
          title: "Deployments",
          url: "/organizer/tracking",
          icon: FileText,
          description: "Track all deployed organizers, exams & questionnaires",
        },
      ],
    },
    {
      label: "Insights",
      links: [
        {
          title: "Analytics",
          url: "/organizer/analytics",
          icon: BarChart3,
          description: "Completion funnel, time-per-section & drop-off blocks",
        },
      ],
    },
    {
      label: "Mine",
      links: [
        {
          title: "My Inbox",
          url: "/organizer/inbox",
          icon: ListChecks,
          description: "Organizers assigned to me",
        },
        {
          title: "Notifications",
          url: "/ops/notifications",
          icon: Bell,
          description: "Organizer-related notifications (opens center)",
        },
      ],
    },
  ],
  communication: [
    {
      label: "Channels",
      links: [
        {
          title: "Firm & Project Channels",
          url: "/ops/communication",
          icon: MessagesSquare,
          description: "Threaded conversations scoped to firms, projects, tasks",
        },
      ],
    },
    {
      label: "Direct Messages",
      links: [
        {
          title: "Direct Messages",
          url: "/ops/communication/dm",
          icon: MessagesSquare,
          description: "1-to-1 chats and group chats with your team",
          roles: ["super_admin", "admin", "hr_manager", "employee"],
        },
        {
          title: "New DM / Group",
          url: "/ops/communication/dm/new",
          icon: MessagesSquare,
          description: "Start a new conversation",
          roles: ["super_admin", "admin", "hr_manager", "employee"],
        },
      ],
    },
  ],
  ops: [
    {
      label: "Workspace",
      links: [
        {
          title: "Workspace",
          url: "/ops/workspace",
          icon: Briefcase,
          description: "Unified view — firms, B2C clients & projects in one place",
        },
      ],
    },
    {
      label: "To-Do",
      links: [
        { title: "To-Do", url: "/ops/todos", icon: ListTodo, description: "Tasks assigned to you" },
      ],
    },
    {
      label: "Pipeline",
      links: [
        {
          title: "Pipeline",
          url: "/ops/pipeline",
          icon: Kanban,
          description: "Project Kanban board",
        },
      ],
    },
    {
      label: "Templates",
      links: [
        {
          title: "Templates",
          url: "/ops/templates",
          icon: ListChecks,
          description: "Workflow, clarification & action, and email templates",
          roles: ["super_admin", "admin", "employee"],
        },
      ],
    },
    {
      label: "Notifications",
      links: [
        {
          title: "Notifications",
          url: "/ops/notifications",
          icon: Bell,
          description: "Mentions, assignments, due-soon",
        },
      ],
    },
    {
      label: "Insights & setup",
      links: [
        {
          title: "Reports",
          url: "/ops/reports",
          icon: BarChart3,
          description: "Reports, time logs, productivity, activity & workload",
          roles: ["super_admin", "admin", "hr_manager", "employee"],
        },
      ],
    },
    {
      label: "Email",
      links: [
        {
          title: "Email Hub",
          url: "/email/hub",
          icon: Mail,
          description: "Microsoft-connected inbox — read, send & manage email accounts",
        },
        {
          title: "Email Settings",
          url: "/email/settings",
          icon: Settings,
          description: "Connected accounts, health check & admin credentials",
          roles: ["super_admin", "admin"],
        },
      ],
    },
  ],
  hr: [
    {
      label: "Employee Directory",
      links: [
        {
          title: "Employee Directory",
          url: "/hr/employees",
          icon: Users,
          description: "Staff profiles & contacts",
        },
      ],
    },
    {
      label: "Employee Hierarchy",
      links: [
        {
          title: "Employee Hierarchy",
          url: "/hr/hierarchy",
          icon: Network,
          description: "Interactive org chart & reporting lines",
        },
      ],
    },
    {
      label: "Attendance & Leaves",
      links: [
        {
          title: "Attendance & Leaves",
          url: "/hr/attendance",
          icon: Calendar,
          description: "Time off and timesheets",
        },
      ],
    },
    {
      label: "Tardiness Tracker",
      links: [
        {
          title: "Tardiness Tracker",
          url: "/hr/tardiness",
          icon: AlertTriangle,
          description: "Late arrivals & patterns",
          roles: ["super_admin", "admin", "hr_manager"],
        },
      ],
    },
    {
      label: "Payroll",
      links: [
        {
          title: "Payroll",
          url: "/hr/payroll",
          icon: Banknote,
          description: "Runs, employee setup, policies & holiday calendar",
          roles: ["super_admin", "admin", "hr_manager"],
        },
      ],
    },
  ],
  learning: [
    {
      label: "Overview",
      links: [
        {
          title: "Dashboard",
          url: "/learning",
          icon: LayoutDashboard,
          description: "Learning & Training hub overview",
        },
        {
          title: "Leaderboard",
          url: "/learning/leaderboard",
          icon: Trophy,
          description: "Firm-wide completion rates and CPE progress",
        },
      ],
    },
    {
      label: "Training",
      links: [
        {
          title: "Courses & Library",
          url: "/learning/courses",
          icon: BookMarked,
          description: "My learning, course catalog, training library, and news",
        },
        {
          title: "Training Paths",
          url: "/learning/paths",
          icon: Route,
          description: "Curated curricula — group courses into structured programs",
        },
        {
          title: "Training Library",
          url: "/learning/library",
          icon: Library,
          description: "SharePoint-backed document library for training materials",
        },
      ],
    },
    {
      label: "Community",
      links: [
        {
          title: "Office Hours Q&A",
          url: "/learning/qa",
          icon: HelpCircle,
          description: "Ask questions and build a searchable knowledge bank",
        },
      ],
    },
  ],
  esign: [
    {
      label: "E-Signature",
      links: [
        {
          title: "Dashboard",
          url: "/esign",
          icon: LayoutDashboard,
          description: "E-Signature hub overview",
        },
        {
          title: "All Envelopes",
          url: "/esign/envelopes",
          icon: Send,
          description: "Sent, in-progress and completed signature requests",
        },
        {
          title: "New Envelope",
          url: "/esign/envelopes/new",
          icon: FileSignature,
          description: "Upload a document and route it for signature",
        },
        {
          title: "Templates",
          url: "/esign/templates",
          icon: FileStack,
          description: "Reusable document templates with pre-placed fields",
        },
      ],
    },
  ],
  email: [
    {
      label: "Overview",
      links: [
        {
          title: "Dashboard",
          url: "/email",
          icon: LayoutDashboard,
          description: "Email hub overview — domain, templates, send log",
          roles: ["super_admin", "admin"],
        },
      ],
    },
    {
      label: "Inbox",
      links: [
        {
          title: "Email Hub",
          url: "/email/hub",
          icon: Mail,
          description: "Microsoft-connected inbox — read, send & manage email accounts",
        },
        {
          title: "Email Settings",
          url: "/email/settings",
          icon: Settings,
          description: "Connected accounts, health check & admin credentials",
          roles: ["super_admin", "admin"],
        },
      ],
    },
    {
      label: "Delivery",
      links: [
        {
          title: "Send Log",
          url: "/email/log",
          icon: ScrollText,
          description: "All outgoing emails with status, recipient, errors",
          roles: ["super_admin", "admin"],
        },
      ],
    },
  ],
  growth: [
    {
      label: "Growth",
      links: [
        {
          title: "Dashboard",
          url: "/growth",
          icon: LayoutDashboard,
          description: "Growth hub overview",
        },
        {
          title: "Marketing Analytics",
          url: "/growth/analytics",
          icon: BarChart3,
          description: "Channel ROI, funnel & spend",
        },
        {
          title: "Campaigns",
          url: "/growth/marketing",
          icon: Megaphone,
          description: "Plan, budget & track campaigns",
        },
        {
          title: "Marketing Calendar",
          url: "/growth/calendar",
          icon: Calendar,
          description: "Campaign dates & task deadlines",
        },
        {
          title: "Content Library",
          url: "/growth/content",
          icon: Newspaper,
          description: "Case studies, collateral & links",
        },
        {
          title: "Lead Pipeline",
          url: "/growth/leads",
          icon: Target,
          description: "Prospect & deal tracking",
        },
        {
          title: "Contracts",
          url: "/growth/contracts",
          icon: FileSignature,
          description: "NDA & SLA prep — profiles, templates, generate .docx/PDF",
        },
      ],
    },
  ],
  // Single flat group → rendered as a flat tab bar (no mega-menu dropdowns).
  admin: [
    {
      label: "Admin",
      links: [
        {
          title: "Dashboard",
          url: "/admin",
          icon: LayoutDashboard,
          description: "Admin hub overview",
        },
        {
          title: "Access Control",
          url: "/admin/access-control",
          icon: ShieldCheck,
          description: "Members, invitations, roles & hub visibility — unified",
          roles: ["super_admin", "admin"],
        },
        {
          title: "System Preferences",
          url: "/admin/settings",
          icon: Settings,
          description: "Settings, hub visibility, branding & PDF templates",
        },
        {
          title: "Integration",
          url: "/admin/integration",
          icon: Network,
          description: "WhatsApp & Microsoft Graph / SharePoint — external services",
          roles: ["super_admin", "admin"],
        },
        {
          title: "Monitoring",
          url: "/admin/activity-audit",
          icon: CalendarSearch,
          description: "Activity audit, login history, performance & client errors",
          roles: ["super_admin", "admin"],
        },
        {
          title: "Security",
          url: "/admin/security",
          icon: ShieldCheck,
          description: "Live security-posture scanner findings",
          roles: ["super_admin", "admin"],
        },
        {
          title: "Pre-launch",
          url: "/admin/verify",
          icon: Rocket,
          description: "RLS verification, go-live checklist & restore drill",
          roles: ["super_admin", "admin"],
        },
        {
          title: "Compliance",
          url: "/admin/compliance",
          icon: ClipboardCheck,
          description: "SOC 2 posture & incident response",
          roles: ["super_admin", "admin"],
        },
        {
          title: "Auto-Categorisation",
          url: "/admin/categorisation",
          icon: ListChecks,
          description: "Document type detection rules, confidence thresholds & live simulator",
          roles: ["super_admin", "admin"],
        },
      ],
    },
  ],
  guide: [
    {
      label: "Overview",
      links: [
        {
          title: "Dashboard",
          url: "/guide",
          icon: LayoutDashboard,
          description: "Guide hub overview",
        },
      ],
    },
    {
      label: "Documentation",
      links: [
        {
          title: "Site Map",
          url: "/guide/sitemap",
          icon: Workflow,
          description: "Flow chart of every page in the app",
        },
        {
          title: "Route Health",
          url: "/guide/route-health",
          icon: ShieldCheck,
          description: "Automated QA: verifies every link resolves and surfaces gating",
        },
        {
          title: "Application Manual",
          url: "/guide/manual",
          icon: BookText,
          description: "Complete how-to guide",
        },
        {
          title: "Standard Workflows",
          url: "/guide/workflows",
          icon: Workflow,
          description: "Step-by-step SOPs",
        },
        {
          title: "Keyboard Shortcuts",
          url: "/guide/shortcuts",
          icon: Keyboard,
          description: "Power-user shortcut cheatsheet",
        },
        {
          title: "Theme Preview",
          url: "/guide/theme-preview",
          icon: Paintbrush,
          description: "Design tokens & component swatches",
        },
        { title: "FAQ", url: "/guide/faq", icon: HelpCircle, description: "Common questions" },
      ],
    },
    {
      label: "System & Design",
      links: [
        {
          title: "System Design",
          url: "/guide/system-design",
          icon: Network,
          description: "Architecture overview and full data dictionary",
        },
        {
          title: "Roles & Permissions",
          url: "/guide/roles",
          icon: UserCog,
          description: "Who can access what — role by role",
        },
        {
          title: "Glossary",
          url: "/guide/glossary",
          icon: BookOpen,
          description: "Plain-English definitions of every app term",
        },
        {
          title: "Release Notes",
          url: "/guide/release-notes",
          icon: History,
          description: "What's new in each release",
        },
      ],
    },
  ],
  gallery: [
    {
      label: "Overview",
      links: [
        {
          title: "Browse Files",
          url: "/gallery",
          icon: FolderTree,
          description: "Read-only browser for every task document across the firm",
        },
      ],
    },
  ],
  portal: [
    {
      label: "Client Portal",
      links: [
        {
          title: "Portal · Overview",
          url: "/portal",
          icon: LayoutDashboard,
          description: "Your firm, projects and updates",
        },
      ],
    },
  ],
  general: [
    {
      label: "General",
      links: [
        {
          title: "My Profile",
          url: "/general/profile",
          icon: UserCog,
          description: "Your account and preferences",
        },
        {
          title: "Two-factor (MFA)",
          url: "/security/mfa",
          icon: ShieldCheck,
          description: "Enroll authenticator apps & backup codes",
        },
        {
          title: "Help & Manual",
          url: "/guide/manual",
          icon: HelpCircle,
          description: "User guide, tutorials and support",
        },
      ],
    },
  ],
};

export function moduleFromPath(pathname: string): ModuleKey {
  if (pathname.startsWith("/global-dashboard")) return "dashboard";
  if (pathname.startsWith("/learning")) return "learning";
  if (pathname.startsWith("/hr/training")) return "learning"; // legacy redirect target
  if (pathname.startsWith("/hr")) return "hr";
  if (pathname.startsWith("/growth")) return "growth";
  if (pathname.startsWith("/clients")) return "clients";
  // Legacy deep links: treat as part of the unified Clients hub so the
  // sidebar stays highlighted on the new nav entry.
  if (pathname.startsWith("/clients")) return "clients";
  if (pathname.startsWith("/clients")) return "clients";
  if (pathname.startsWith("/esign")) return "esign";
  if (pathname.startsWith("/email")) return "email";

  if (pathname.startsWith("/ops/communication")) return "communication";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/guide")) return "guide";
  if (pathname.startsWith("/ops")) return "ops";
  if (pathname.startsWith("/portal")) return "portal";
  if (pathname.startsWith("/general")) return "general";
  if (pathname.startsWith("/security")) return "general";
  return "dashboard";
}

export function useNav() {
  const { roles, department, user } = useAuth();
  const userRoles = (roles ?? []) as AppRole[];

  const settingsQ = useQuery({
    queryKey: ["app-settings", "system", "nav"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("id", "system")
        .maybeSingle();
      return (data?.value ?? {}) as {
        module_hubs?: Partial<Record<ModuleKey, boolean>>;
      };
    },
    staleTime: 60_000,
  });

  const overridesQ = useQuery({
    queryKey: ["user-hub-perms", user?.id ?? "anon"],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_hub_permissions" as never)
        .select("module_key,allowed")
        .eq("user_id", user!.id);
      const map: Partial<Record<ModuleKey, boolean>> = {};
      for (const r of (data ?? []) as Array<{ module_key: string; allowed: boolean }>) {
        map[r.module_key as ModuleKey] = r.allowed;
      }
      return map;
    },
    staleTime: 60_000,
  });

  const moduleHubs = settingsQ.data?.module_hubs ?? {};
  const userOverrides = overridesQ.data ?? {};

  // OPEN ACCESS MODE: role / department gating stays disabled during the
  // validation phase. Hub Module Visibility, however, IS enforced — a hub
  // hidden via the matrix is removed from the menu here (and blocked on direct
  // navigation by AppShell). See isHubVisibleFor for the resolution order.
  const hasAny = (_allowed: AppRole[]) => {
    void _allowed;
    return true;
  };
  const isPriv = userRoles.includes("super_admin") || userRoles.includes("admin");
  void isPriv;

  const passesDeptGate = (_key: ModuleKey): boolean => {
    void _key;
    return true;
  };
  const passesHubGate = (key: ModuleKey): boolean =>
    isHubVisibleFor(key, {
      overrides: userOverrides,
      roles: userRoles,
      moduleHubs,
    });

  const tier1 = TIER1.filter(
    (i) => hasAny(i.roles) && passesDeptGate(i.key) && passesHubGate(i.key),
  );

  const tier2For = (key: ModuleKey): Tier2Group[] => {
    const groups = TIER2[key] ?? [];
    // OPEN ACCESS MODE: ignore per-link role filters.
    // Annotate links with restricted/requiredRoles using the central matrix.
    // While BYPASS_ACCESS is true, restricted is always false (no visual change),
    // but the data is wired so flipping the flag turns on lock+tooltip everywhere.
    const isSuperAdmin = userRoles.includes("super_admin");
    return groups
      .map((g) => ({
        ...g,
        links: g.links
          .map((l) => {
            const need = requiredRolesFor(l.url) ?? l.roles ?? [];
            const restricted =
              !isSuperAdmin &&
              (!canAccess(userRoles, l.url) ||
                (l.roles ? !l.roles.some((r) => userRoles.includes(r)) && !BYPASS_ACCESS : false));
            return { ...l, requiredRoles: need, restricted };
          })
          // When enforcement is ON, hide links the user can't reach (e.g. Payroll,
          // Audit Log for non-super_admins) rather than showing a locked teaser.
          // During the bypass/validation phase, keep showing them as locked.
          .filter((l) => BYPASS_ACCESS || !l.restricted),
      }))
      .filter((g) => g.links.length > 0);
  };

  return { tier1, tier2For, userRoles, department };
}

export const ALL_TIER1 = TIER1;
export const ALL_TIER2 = TIER2;
